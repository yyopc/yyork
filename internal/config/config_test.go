package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadFileReadsAgentConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(`agents:
  codex:
    binary: /opt/bin/codex
    auto_review: true
    extra_args:
      - --model
      - gpt-5
`), 0o600); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	codex := cfg.Agents["codex"]
	if got := codex["binary"]; got != "/opt/bin/codex" {
		t.Fatalf("unexpected binary: %#v", got)
	}
	if got := codex["auto_review"]; got != true {
		t.Fatalf("unexpected auto_review: %#v", got)
	}
	args, ok := codex["extra_args"].([]any)
	if !ok {
		t.Fatalf("unexpected extra_args type: %#v", codex["extra_args"])
	}
	if len(args) != 2 || args[0] != "--model" || args[1] != "gpt-5" {
		t.Fatalf("unexpected extra_args: %#v", args)
	}
}

func TestLoadFileMissingReturnsEmptyConfig(t *testing.T) {
	cfg, err := LoadFile(filepath.Join(t.TempDir(), "missing.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Agents == nil {
		t.Fatal("expected initialized agents map")
	}
	if len(cfg.Agents) != 0 {
		t.Fatalf("unexpected agents: %#v", cfg.Agents)
	}
}
