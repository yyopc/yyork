package zellijconfig

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnsureWritesConfigUnderHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	path, err := Ensure()
	if err != nil {
		t.Fatalf("Ensure: %v", err)
	}

	want := filepath.Join(home, ".yyork", "zellij", "config.kdl")
	if path != want {
		t.Fatalf("path = %q, want %q", path, want)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	content := string(data)
	if !strings.Contains(content, `theme "yyork"`) {
		t.Errorf("config missing theme selection:\n%s", content)
	}
	// The invisibility contract: no zellij keybindings, no pane frames, no
	// startup floating panes, no zellij-owned mouse handling or hover effects.
	// The user must not be able to tell the agent runs inside zellij.
	for _, frag := range []string{
		"keybinds clear-defaults=true",
		"pane_frames false",
		"show_startup_tips false",
		"show_release_notes false",
		"advanced_mouse_actions false",
		"mouse_mode false",
	} {
		if !strings.Contains(content, frag) {
			t.Errorf("config missing %q:\n%s", frag, content)
		}
	}
	// Index-based mappings the web terminal recolors. Spot-check a few.
	for _, frag := range []string{"themes {", "yyork {", "fg 15", "bg 0", "red 1", "green 2"} {
		if !strings.Contains(content, frag) {
			t.Errorf("config missing %q:\n%s", frag, content)
		}
	}
}

func TestEnsureIsIdempotent(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	path, err := Ensure()
	if err != nil {
		t.Fatalf("first Ensure: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	first := info.ModTime()

	again, err := Ensure()
	if err != nil {
		t.Fatalf("second Ensure: %v", err)
	}
	if again != path {
		t.Fatalf("path changed: %q != %q", again, path)
	}
	info2, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat after second Ensure: %v", err)
	}
	// Unchanged content must not be rewritten, so the mtime stays put.
	if !info2.ModTime().Equal(first) {
		t.Errorf("config rewritten despite matching content: %v -> %v", first, info2.ModTime())
	}
}

func TestEnsureOverwritesStaleContent(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	path, err := Path()
	if err != nil {
		t.Fatalf("Path: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte("// stale\ntheme \"other\"\n"), 0o644); err != nil {
		t.Fatalf("seed stale: %v", err)
	}

	if _, err := Ensure(); err != nil {
		t.Fatalf("Ensure: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if string(data) != configKDL {
		t.Errorf("stale config not overwritten:\n%s", string(data))
	}
}
