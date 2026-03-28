package relay

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	OpenClaw OpenClawConfig `yaml:"openclaw"`
	Auth     AuthConfig     `yaml:"auth"`
}

type ServerConfig struct {
	Host string `yaml:"host"`
	Port int    `yaml:"port"`
}

type OpenClawConfig struct {
	Binary         string `yaml:"binary"`
	WorkDir        string `yaml:"workdir"`
	MaxSessions    int    `yaml:"max_sessions"`
	SessionTimeout int    `yaml:"session_timeout"`
}

type AuthConfig struct {
	Enabled bool   `yaml:"enabled"`
	Token   string `yaml:"token"`
}

func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	cfg := &Config{
		Server: ServerConfig{
			Host: "0.0.0.0",
			Port: 8080,
		},
		OpenClaw: OpenClawConfig{
			Binary:         "claude",
			WorkDir:        "/tmp/openclaw-sessions",
			MaxSessions:    10,
			SessionTimeout: 30,
		},
	}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}
