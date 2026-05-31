package claudecode

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/yyovil/better-ao/internal/plugin/agent"
)

func TestGetLaunchCommandBypassWithPrompt(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}

	cmd, err := p.GetLaunchCommand(context.Background(), agent.LaunchConfig{
		Permissions: agent.PermissionModeBypassPermissions,
		Prompt:      "-add a health check",
	})
	if err != nil {
		t.Fatal(err)
	}

	want := []string{
		"claude",
		"--permission-mode", "bypassPermissions",
		"--", "-add a health check",
	}
	if !reflect.DeepEqual(cmd, want) {
		t.Fatalf("unexpected command\nwant: %#v\n got: %#v", want, cmd)
	}
}

func TestGetLaunchCommandMapsPermissionModes(t *testing.T) {
	tests := []struct {
		name        string
		permission  agent.PermissionMode
		want        []string
		notExpected string
	}{
		{"default omits flag (defers to settings.json)", agent.PermissionModeDefault, nil, "--permission-mode"},
		{"accept-edits", agent.PermissionModeAcceptEdits, []string{"--permission-mode", "acceptEdits"}, ""},
		{"auto", agent.PermissionModeAuto, []string{"--permission-mode", "auto"}, ""},
		{"bypass-permissions", agent.PermissionModeBypassPermissions, []string{"--permission-mode", "bypassPermissions"}, ""},
		{"legacy auto-review alias", agent.PermissionModeAutoReview, []string{"--permission-mode", "acceptEdits"}, ""},
		{"legacy full-access alias", agent.PermissionModeFullAccess, []string{"--permission-mode", "bypassPermissions"}, ""},
		{"legacy skip alias", agent.PermissionMode("skip"), []string{"--permission-mode", "bypassPermissions"}, ""},
		{"empty omits permission flags", "", nil, "--permission-mode"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := &Plugin{resolvedBinary: "claude"}
			cmd, err := p.GetLaunchCommand(context.Background(), agent.LaunchConfig{
				Permissions: tt.permission,
			})
			if err != nil {
				t.Fatal(err)
			}
			if len(tt.want) > 0 && !containsSubsequence(cmd, tt.want) {
				t.Fatalf("command %#v does not contain %#v", cmd, tt.want)
			}
			if tt.notExpected != "" && contains(cmd, tt.notExpected) {
				t.Fatalf("command %#v unexpectedly contains %q", cmd, tt.notExpected)
			}
		})
	}
}

func TestGetLaunchCommandAppendsSystemPromptFromFile(t *testing.T) {
	dir := t.TempDir()
	promptFile := filepath.Join(dir, "system.md")
	if err := os.WriteFile(promptFile, []byte("You are an orchestrator.\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	p := &Plugin{resolvedBinary: "claude"}
	cmd, err := p.GetLaunchCommand(context.Background(), agent.LaunchConfig{
		SystemPromptFile: promptFile,
		Prompt:           "do the thing",
	})
	if err != nil {
		t.Fatal(err)
	}

	want := []string{
		"claude",
		"--append-system-prompt", "You are an orchestrator.",
		"--", "do the thing",
	}
	if !reflect.DeepEqual(cmd, want) {
		t.Fatalf("unexpected command\nwant: %#v\n got: %#v", want, cmd)
	}
}

func TestGetLaunchCommandInlineSystemPrompt(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}
	cmd, err := p.GetLaunchCommand(context.Background(), agent.LaunchConfig{
		SystemPrompt: "inline instructions",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !containsSubsequence(cmd, []string{"--append-system-prompt", "inline instructions"}) {
		t.Fatalf("command %#v does not append inline system prompt", cmd)
	}
}

func TestGetLaunchCommandMissingSystemPromptFileErrors(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}
	_, err := p.GetLaunchCommand(context.Background(), agent.LaunchConfig{
		SystemPromptFile: filepath.Join(t.TempDir(), "does-not-exist.md"),
	})
	if err == nil {
		t.Fatal("expected error for missing system prompt file")
	}
}

func TestManifestID(t *testing.T) {
	if got := New().Manifest().ID; got != "claude-code" {
		t.Fatalf("manifest id = %q, want claude-code", got)
	}
}

func TestRestoreAndSessionInfoAreNoops(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}

	cmd, ok, err := p.GetRestoreCommand(context.Background(), agent.RestoreConfig{
		Session: agent.SessionRef{Metadata: map[string]string{claudeSessionUUIDMetadataKey: "uuid"}},
	})
	if err != nil || ok || cmd != nil {
		t.Fatalf("GetRestoreCommand = (%#v, %v, %v), want (nil, false, nil)", cmd, ok, err)
	}

	info, ok, err := p.SessionInfo(context.Background(), agent.SessionRef{})
	if err != nil || ok || !reflect.DeepEqual(info, agent.SessionInfo{}) {
		t.Fatalf("SessionInfo = (%#v, %v, %v), want (zero, false, nil)", info, ok, err)
	}
}

func TestEnsureWorkspaceTrustedCreatesEntry(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, ".claude.json")
	// Seed an existing config with another project + a top-level key, to
	// prove we preserve unrelated state.
	seed := `{"userID":"abc","projects":{"/existing/proj":{"hasTrustDialogAccepted":true,"lastCost":1.5}}}`
	if err := os.WriteFile(cfgPath, []byte(seed), 0o600); err != nil {
		t.Fatal(err)
	}

	work := "/Users/me/.better-ao/worktrees/01ABC"
	if err := ensureWorkspaceTrusted(cfgPath, work); err != nil {
		t.Fatalf("ensureWorkspaceTrusted: %v", err)
	}

	root := readJSON(t, cfgPath)
	projects := root["projects"].(map[string]any)

	// New entry trusted.
	newEntry := projects[work].(map[string]any)
	if newEntry["hasTrustDialogAccepted"] != true {
		t.Fatalf("new entry not trusted: %#v", newEntry)
	}
	// Existing project preserved (including its other fields).
	existing := projects["/existing/proj"].(map[string]any)
	if existing["hasTrustDialogAccepted"] != true || existing["lastCost"].(float64) != 1.5 {
		t.Fatalf("existing project clobbered: %#v", existing)
	}
	// Top-level key preserved.
	if root["userID"] != "abc" {
		t.Fatalf("top-level key clobbered: %#v", root["userID"])
	}
}

func TestEnsureWorkspaceTrustedIsIdempotentAndNoWriteWhenAlreadyTrusted(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, ".claude.json")
	work := "/w"
	if err := os.WriteFile(cfgPath, []byte(`{"projects":{"/w":{"hasTrustDialogAccepted":true}}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	info1, err := os.Stat(cfgPath)
	if err != nil {
		t.Fatal(err)
	}

	if err := ensureWorkspaceTrusted(cfgPath, work); err != nil {
		t.Fatalf("ensureWorkspaceTrusted: %v", err)
	}

	// Already trusted → no rewrite → mtime unchanged.
	info2, err := os.Stat(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if !info1.ModTime().Equal(info2.ModTime()) {
		t.Fatal("expected no rewrite when already trusted")
	}
}

func TestEnsureWorkspaceTrustedCreatesMissingConfig(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, ".claude.json") // does not exist yet
	work := "/fresh/worktree"

	if err := ensureWorkspaceTrusted(cfgPath, work); err != nil {
		t.Fatalf("ensureWorkspaceTrusted: %v", err)
	}

	root := readJSON(t, cfgPath)
	projects := root["projects"].(map[string]any)
	entry := projects[work].(map[string]any)
	if entry["hasTrustDialogAccepted"] != true {
		t.Fatalf("entry not trusted in freshly-created config: %#v", entry)
	}
}

func readJSON(t *testing.T, path string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	return m
}

func contains(values []string, needle string) bool {
	for _, v := range values {
		if v == needle {
			return true
		}
	}
	return false
}

func containsSubsequence(values, needle []string) bool {
	if len(needle) == 0 {
		return true
	}
	for start := 0; start+len(needle) <= len(values); start++ {
		ok := true
		for i, w := range needle {
			if values[start+i] != w {
				ok = false
				break
			}
		}
		if ok {
			return true
		}
	}
	return false
}
