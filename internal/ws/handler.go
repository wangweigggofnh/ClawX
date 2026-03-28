package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/clawx/relay/internal/openclaw"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// ClientMessage is what the client sends
type ClientMessage struct {
	Type      string `json:"type"`       // "message", "create_session", "list_sessions", "history"
	SessionID string `json:"session_id"` // Target session
	Content   string `json:"content"`    // Message content
}

// ServerMessage is what the server sends
type ServerMessage struct {
	Type      string      `json:"type"`                // "message", "session_created", "sessions", "history", "error"
	SessionID string      `json:"session_id,omitempty"`
	Message   interface{} `json:"message,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	Error     string      `json:"error,omitempty"`
}

// Hub manages websocket connections
type Hub struct {
	sessions *openclaw.SessionManager
	clients  map[*Client]bool
	mu       sync.RWMutex
}

// Client represents a websocket connection
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
	mu   sync.Mutex
}

// NewHub creates a new Hub
func NewHub(sessions *openclaw.SessionManager) *Hub {
	return &Hub{
		sessions: sessions,
		clients:  make(map[*Client]bool),
	}
}

// HandleWebSocket handles websocket upgrade
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{
		hub:  h,
		conn: conn,
		send: make(chan []byte, 256),
	}

	h.mu.Lock()
	h.clients[client] = true
	h.mu.Unlock()

	go client.writePump()
	go client.readPump()

	log.Printf("New WebSocket client connected (%d total)", len(h.clients))
}

func (c *Client) readPump() {
	defer func() {
		c.hub.mu.Lock()
		delete(c.hub.clients, c)
		c.hub.mu.Unlock()
		c.conn.Close()
		log.Printf("WebSocket client disconnected")
	}()

	c.conn.SetReadLimit(512 * 1024) // 512KB
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		c.handleMessage(message)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.mu.Lock()
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			c.conn.WriteMessage(websocket.TextMessage, message)
			c.mu.Unlock()
		case <-ticker.C:
			c.mu.Lock()
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			err := c.conn.WriteMessage(websocket.PingMessage, nil)
			c.mu.Unlock()
			if err != nil {
				return
			}
		}
	}
}

func (c *Client) sendJSON(msg ServerMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("JSON marshal error: %v", err)
		return
	}
	select {
	case c.send <- data:
	default:
		log.Printf("Client send buffer full, dropping message")
	}
}

func (c *Client) handleMessage(raw []byte) {
	var msg ClientMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		c.sendJSON(ServerMessage{Type: "error", Error: "invalid message format"})
		return
	}

	switch msg.Type {
	case "create_session":
		c.handleCreateSession(msg)
	case "list_sessions":
		c.handleListSessions()
	case "message":
		c.handleChatMessage(msg)
	case "history":
		c.handleHistory(msg)
	default:
		c.sendJSON(ServerMessage{Type: "error", Error: "unknown message type: " + msg.Type})
	}
}

func (c *Client) handleCreateSession(msg ClientMessage) {
	sessionID := msg.SessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("session_%d", time.Now().UnixNano())
	}

	session, err := c.hub.sessions.CreateSession(sessionID)
	if err != nil {
		c.sendJSON(ServerMessage{Type: "error", Error: err.Error()})
		return
	}

	c.sendJSON(ServerMessage{
		Type:      "session_created",
		SessionID: session.ID,
		Data: map[string]interface{}{
			"id":         session.ID,
			"created_at": session.CreatedAt,
		},
	})
}

func (c *Client) handleListSessions() {
	sessions := c.hub.sessions.ListSessions()
	c.sendJSON(ServerMessage{
		Type: "sessions",
		Data: sessions,
	})
}

func (c *Client) handleHistory(msg ClientMessage) {
	session, ok := c.hub.sessions.GetSession(msg.SessionID)
	if !ok {
		c.sendJSON(ServerMessage{Type: "error", Error: "session not found"})
		return
	}
	c.sendJSON(ServerMessage{
		Type:      "history",
		SessionID: msg.SessionID,
		Data:      session.GetHistory(),
	})
}

func (c *Client) handleChatMessage(msg ClientMessage) {
	if msg.SessionID == "" {
		c.sendJSON(ServerMessage{Type: "error", Error: "session_id is required"})
		return
	}
	if msg.Content == "" {
		c.sendJSON(ServerMessage{Type: "error", Error: "content is required"})
		return
	}

	session, ok := c.hub.sessions.GetSession(msg.SessionID)
	if !ok {
		// Auto-create session
		var err error
		session, err = c.hub.sessions.CreateSession(msg.SessionID)
		if err != nil {
			c.sendJSON(ServerMessage{Type: "error", Error: err.Error()})
			return
		}
		c.sendJSON(ServerMessage{
			Type:      "session_created",
			SessionID: session.ID,
		})
	}

	ctx := context.Background()
	ch, err := session.SendMessage(ctx, msg.Content)
	if err != nil {
		c.sendJSON(ServerMessage{Type: "error", Error: err.Error()})
		return
	}

	// Stream responses back to client
	for response := range ch {
		c.sendJSON(ServerMessage{
			Type:      "message",
			SessionID: msg.SessionID,
			Message:   response,
		})
	}
}
