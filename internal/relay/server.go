package relay

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/clawx/relay/internal/openclaw"
	"github.com/clawx/relay/internal/ws"
)

// Server is the main relay server
type Server struct {
	cfg      *Config
	sessions *openclaw.SessionManager
	hub      *ws.Hub
	webDir   string
}

// NewServer creates a new relay server
func NewServer(cfg *Config, webDir string) *Server {
	sessions := openclaw.NewSessionManager(
		cfg.OpenClaw.Binary,
		cfg.OpenClaw.WorkDir,
		cfg.OpenClaw.MaxSessions,
		cfg.OpenClaw.SessionTimeout,
	)
	hub := ws.NewHub(sessions)

	return &Server{
		cfg:      cfg,
		sessions: sessions,
		hub:      hub,
		webDir:   webDir,
	}
}

// Start starts the HTTP server
func (s *Server) Start(ctx context.Context) error {
	mux := http.NewServeMux()

	// WebSocket endpoint
	mux.HandleFunc("/ws", s.corsMiddleware(s.authMiddleware(s.hub.HandleWebSocket)))

	// REST API endpoints
	mux.HandleFunc("/api/health", s.corsMiddleware(s.handleHealth))
	mux.HandleFunc("/api/sessions", s.corsMiddleware(s.authMiddleware(s.handleSessions)))
	mux.HandleFunc("/api/send", s.corsMiddleware(s.authMiddleware(s.handleSend)))

	// Serve static web files
	mux.Handle("/", http.FileServer(http.Dir(s.webDir)))

	addr := fmt.Sprintf("%s:%d", s.cfg.Server.Host, s.cfg.Server.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 300 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdownCtx)
	}()

	log.Println("========================================")
	log.Println("  ClawX Relay Server v0.1.0")
	log.Println("========================================")
	log.Printf("  Web UI:    http://localhost:%d", s.cfg.Server.Port)
	log.Printf("  WebSocket: ws://localhost:%d/ws", s.cfg.Server.Port)
	log.Printf("  REST API:  http://localhost:%d/api/", s.cfg.Server.Port)
	log.Printf("  OpenClaw:  %s", s.cfg.OpenClaw.Binary)
	log.Println("========================================")

	return server.ListenAndServe()
}

func (s *Server) corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func (s *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.Auth.Enabled {
			token := r.Header.Get("Authorization")
			query := r.URL.Query().Get("token")
			if token != "Bearer "+s.cfg.Auth.Token && query != s.cfg.Auth.Token {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
		}
		next(w, r)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "ok",
		"version":  "0.1.0",
		"sessions": len(s.sessions.ListSessions()),
	})
}

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		json.NewEncoder(w).Encode(s.sessions.ListSessions())
	case http.MethodPost:
		var req struct {
			ID string `json:"id"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.ID == "" {
			req.ID = fmt.Sprintf("session_%d", time.Now().UnixNano())
		}
		session, err := s.sessions.CreateSession(req.ID)
		if err != nil {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":         session.ID,
			"created_at": session.CreatedAt,
		})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleSend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		SessionID string `json:"session_id"`
		Content   string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.SessionID == "" || req.Content == "" {
		http.Error(w, `{"error":"session_id and content required"}`, http.StatusBadRequest)
		return
	}

	session, ok := s.sessions.GetSession(req.SessionID)
	if !ok {
		var err error
		session, err = s.sessions.CreateSession(req.SessionID)
		if err != nil {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
	}

	ctx := r.Context()
	ch, err := session.SendMessage(ctx, req.Content)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Server-Sent Events for streaming
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, canFlush := w.(http.Flusher)

	for msg := range ch {
		data, _ := json.Marshal(msg)
		fmt.Fprintf(w, "data: %s\n\n", data)
		if canFlush {
			flusher.Flush()
		}
	}
}
