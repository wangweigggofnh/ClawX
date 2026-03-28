package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/clawx/relay/internal/relay"
)

func main() {
	configPath := flag.String("config", "config/config.yaml", "Path to config file")
	webDir := flag.String("web", "web/static", "Path to web static files directory")
	flag.Parse()

	cfg, err := relay.LoadConfig(*configPath)
	if err != nil {
		log.Printf("Warning: could not load config from %s: %v, using defaults", *configPath, err)
		cfg = &relay.Config{
			Server: relay.ServerConfig{Host: "0.0.0.0", Port: 8080},
			OpenClaw: relay.OpenClawConfig{
				Binary:         "claude",
				WorkDir:        "/tmp/openclaw-sessions",
				MaxSessions:    10,
				SessionTimeout: 30,
			},
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		log.Printf("Received signal %v, shutting down...", sig)
		cancel()
	}()

	server := relay.NewServer(cfg, *webDir)
	if err := server.Start(ctx); err != nil {
		log.Printf("Server stopped: %v", err)
	}
}
