# ClawX Relay Server

A lightweight message relay server that lets you remotely interact with OpenClaw (Claude Code) from any web or mobile device. Similar to Claude Dispatch — send tasks, receive streaming responses.

## Architecture

```
Browser/Mobile  <-->  ClawX Relay Server  <-->  OpenClaw (Claude CLI)
  (WebSocket)          (Go HTTP Server)          (subprocess)
```

- **Web UI** — Single-page chat interface, mobile-friendly
- **WebSocket API** — Real-time bidirectional messaging with streaming
- **REST API (SSE)** — HTTP POST with Server-Sent Events for streaming responses
- **Session Management** — Multiple concurrent sessions with auto-cleanup

## Quick Start

```bash
# Build
make build

# Run
make run

# Or run directly
go run ./cmd/clawx-relay/ -config config/config.yaml -web web/static
```

Open http://localhost:8080 in your browser or mobile device.

## API

### WebSocket (`/ws`)

```json
// Create session
{"type": "create_session", "session_id": "my-session"}

// Send message
{"type": "message", "session_id": "my-session", "content": "Hello OpenClaw"}

// List sessions
{"type": "list_sessions"}

// Get history
{"type": "history", "session_id": "my-session"}
```

### REST

```bash
# Health check
GET /api/health

# List sessions
GET /api/sessions

# Create session
POST /api/sessions  {"id": "my-session"}

# Send message (returns SSE stream)
POST /api/send  {"session_id": "my-session", "content": "Hello"}
```

## Configuration

Edit `config/config.yaml`:

```yaml
server:
  host: "0.0.0.0"
  port: 8080

openclaw:
  binary: "claude"           # Path to claude CLI
  workdir: "/tmp/openclaw-sessions"
  max_sessions: 10
  session_timeout: 30        # minutes

auth:
  enabled: false
  token: "changeme"
```

## Project Structure

```
cmd/clawx-relay/     — Entry point
internal/
  relay/             — HTTP server, config
  ws/                — WebSocket hub and client handling
  openclaw/          — Claude CLI session management
web/static/          — Web UI (single HTML file)
config/              — Configuration files
```
