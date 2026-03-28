package openclaw

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// Message represents a chat message
type Message struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"` // "user" or "assistant"
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
	Done      bool      `json:"done"`
}

// Session manages a single openclaw/claude process
type Session struct {
	ID        string
	WorkDir   string
	Binary    string
	Messages  []Message
	CreatedAt time.Time
	LastUsed  time.Time

	mu       sync.Mutex
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	stdout   io.ReadCloser
	stderr   io.ReadCloser
	cancel   context.CancelFunc
	running  bool
	msgChan  chan Message
}

// SessionManager manages multiple openclaw sessions
type SessionManager struct {
	mu          sync.RWMutex
	sessions    map[string]*Session
	binary      string
	baseWorkDir string
	maxSessions int
	timeout     time.Duration
}

// NewSessionManager creates a new session manager
func NewSessionManager(binary, baseWorkDir string, maxSessions int, timeoutMin int) *SessionManager {
	os.MkdirAll(baseWorkDir, 0755)
	return &SessionManager{
		sessions:    make(map[string]*Session),
		binary:      binary,
		baseWorkDir: baseWorkDir,
		maxSessions: maxSessions,
		timeout:     time.Duration(timeoutMin) * time.Minute,
	}
}

// CreateSession creates a new session
func (sm *SessionManager) CreateSession(id string) (*Session, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if len(sm.sessions) >= sm.maxSessions {
		// Try to clean up expired sessions
		sm.cleanExpiredLocked()
		if len(sm.sessions) >= sm.maxSessions {
			return nil, fmt.Errorf("max sessions (%d) reached", sm.maxSessions)
		}
	}

	workDir := filepath.Join(sm.baseWorkDir, id)
	os.MkdirAll(workDir, 0755)

	s := &Session{
		ID:        id,
		WorkDir:   workDir,
		Binary:    sm.binary,
		CreatedAt: time.Now(),
		LastUsed:  time.Now(),
		msgChan:   make(chan Message, 100),
	}
	sm.sessions[id] = s
	return s, nil
}

// GetSession gets an existing session
func (sm *SessionManager) GetSession(id string) (*Session, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	s, ok := sm.sessions[id]
	if ok {
		s.LastUsed = time.Now()
	}
	return s, ok
}

// DeleteSession removes a session
func (sm *SessionManager) DeleteSession(id string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if s, ok := sm.sessions[id]; ok {
		s.Stop()
		delete(sm.sessions, id)
	}
}

// ListSessions returns all active sessions
func (sm *SessionManager) ListSessions() []map[string]interface{} {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	result := make([]map[string]interface{}, 0, len(sm.sessions))
	for _, s := range sm.sessions {
		result = append(result, map[string]interface{}{
			"id":         s.ID,
			"created_at": s.CreatedAt,
			"last_used":  s.LastUsed,
			"running":    s.running,
			"messages":   len(s.Messages),
		})
	}
	return result
}

func (sm *SessionManager) cleanExpiredLocked() {
	now := time.Now()
	for id, s := range sm.sessions {
		if now.Sub(s.LastUsed) > sm.timeout {
			s.Stop()
			delete(sm.sessions, id)
		}
	}
}

// SendMessage sends a message to the openclaw process and streams the response
func (s *Session) SendMessage(ctx context.Context, userMsg string) (<-chan Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.LastUsed = time.Now()

	// Record user message
	userMessage := Message{
		ID:        fmt.Sprintf("msg_%d", time.Now().UnixNano()),
		Role:      "user",
		Content:   userMsg,
		Timestamp: time.Now(),
		Done:      true,
	}
	s.Messages = append(s.Messages, userMessage)

	ch := make(chan Message, 100)

	// Send the user message first
	go func() {
		ch <- userMessage
	}()

	// Run claude command with the message as a prompt
	go func() {
		defer close(ch)

		cmdCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()

		args := []string{
			"-p",                           // Non-interactive print mode
			"--output-format", "stream-json",
			"--verbose",                    // Required for stream-json
			"--no-session-persistence",     // Don't persist sessions to disk
			userMsg,
		}

		cmd := exec.CommandContext(cmdCtx, s.Binary, args...)
		cmd.Dir = s.WorkDir
		devNull, _ := os.Open(os.DevNull)
		if devNull != nil {
			cmd.Stdin = devNull
			defer devNull.Close()
		}

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			ch <- Message{
				ID:        fmt.Sprintf("err_%d", time.Now().UnixNano()),
				Role:      "assistant",
				Content:   fmt.Sprintf("Error starting process: %v", err),
				Timestamp: time.Now(),
				Done:      true,
			}
			return
		}

		if err := cmd.Start(); err != nil {
			ch <- Message{
				ID:        fmt.Sprintf("err_%d", time.Now().UnixNano()),
				Role:      "assistant",
				Content:   fmt.Sprintf("Error starting openclaw: %v", err),
				Timestamp: time.Now(),
				Done:      true,
			}
			return
		}

		msgID := fmt.Sprintf("resp_%d", time.Now().UnixNano())
		fullContent := ""

		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB buffer

		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}

			// Parse stream-json format from claude CLI
			var event map[string]interface{}
			if err := json.Unmarshal([]byte(line), &event); err != nil {
				// Not JSON, treat as plain text
				fullContent += line + "\n"
				ch <- Message{
					ID:        msgID,
					Role:      "assistant",
					Content:   fullContent,
					Timestamp: time.Now(),
					Done:      false,
				}
				continue
			}

			eventType, _ := event["type"].(string)
			switch eventType {
			case "assistant":
				// Claude CLI emits {"type":"assistant","message":{...}} with content blocks
				if msg, ok := event["message"].(map[string]interface{}); ok {
					if content, ok := msg["content"].([]interface{}); ok {
						for _, block := range content {
							if b, ok := block.(map[string]interface{}); ok {
								blockType, _ := b["type"].(string)
								if blockType == "text" {
									if text, ok := b["text"].(string); ok {
										fullContent += text
									}
								}
							}
						}
					}
				}
				if fullContent != "" {
					ch <- Message{
						ID:        msgID,
						Role:      "assistant",
						Content:   fullContent,
						Timestamp: time.Now(),
						Done:      false,
					}
				}

			case "result":
				// Final result event: {"type":"result","result":"..."}
				if result, ok := event["result"].(string); ok && result != "" {
					if fullContent == "" {
						fullContent = result
					}
				}
			}
		}

		cmd.Wait()

		if fullContent == "" {
			fullContent = "(No response from OpenClaw)"
		}

		// Final message
		finalMsg := Message{
			ID:        msgID,
			Role:      "assistant",
			Content:   fullContent,
			Timestamp: time.Now(),
			Done:      true,
		}
		s.mu.Lock()
		s.Messages = append(s.Messages, finalMsg)
		s.mu.Unlock()
		ch <- finalMsg
	}()

	return ch, nil
}

// Stop stops the session's process
func (s *Session) Stop() {
	if s.cancel != nil {
		s.cancel()
	}
	if s.cmd != nil && s.cmd.Process != nil {
		s.cmd.Process.Kill()
	}
	s.running = false
}

// GetHistory returns message history
func (s *Session) GetHistory() []Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make([]Message, len(s.Messages))
	copy(result, s.Messages)
	return result
}
