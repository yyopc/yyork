package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/store"
)

func TestRunCodexHookPersistsSessionInfoMetadata(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-1"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	insertHookTestSession(t, ctx, sessionID)

	runHook := func(event string, payload string) {
		t.Helper()
		var stdout, stderr bytes.Buffer
		code := runCodexHook(ctx, event, strings.NewReader(payload), &stdout, &stderr)
		if code != 0 {
			t.Fatalf("%s exit = %d, stderr: %s", event, code, stderr.String())
		}
		if stdout.String() != "{}\n" {
			t.Fatalf("%s stdout = %q, want hook response", event, stdout.String())
		}
		if stderr.Len() != 0 {
			t.Fatalf("%s stderr = %s", event, stderr.String())
		}
	}

	runHook("session-start", `{"session_id":"codex-native-1"}`)
	runHook("user-prompt-submit", `{"prompt":"Fix the login redirect after OAuth callback."}`)
	runHook("user-prompt-submit", `{"prompt":"A later prompt should not retitle the session."}`)
	runHook("stop", `{"last_assistant_message":"Implemented the callback redirect fix and added a regression test."}`)

	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataAgentSessionID]; got != "codex-native-1" {
		t.Fatalf("agentSessionId = %#v, want native id", got)
	}
	if got := row.Metadata[hookMetadataTitle]; got != "Fix the login redirect after OAuth callback." {
		t.Fatalf("title = %#v, want first user prompt", got)
	}
	if got := row.Metadata[hookMetadataRecap]; got != "Implemented the callback redirect fix and added a regression test." {
		t.Fatalf("recap = %#v, want stop assistant message", got)
	}
}

func TestRunCodexHookNoopsWithoutAOSession(t *testing.T) {
	t.Setenv("YYORK_SESSION_ID", "")

	var stdout, stderr bytes.Buffer
	code := runCodexHook(context.Background(), "stop", strings.NewReader(`{"last_assistant_message":"done"}`), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("exit = %d, stderr: %s", code, stderr.String())
	}
	if stdout.String() != "{}\n" {
		t.Fatalf("stdout = %q, want hook response", stdout.String())
	}
	if stderr.Len() != 0 {
		t.Fatalf("stderr = %s", stderr.String())
	}
}

func TestRunClaudeHookPersistsSessionInfoMetadata(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-claude-1"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	insertHookTestSession(t, ctx, sessionID)

	runHook := func(event string, payload string) {
		t.Helper()
		var stdout, stderr bytes.Buffer
		code := runClaudeHook(ctx, event, strings.NewReader(payload), &stdout, &stderr)
		if code != 0 {
			t.Fatalf("%s exit = %d, stderr: %s", event, code, stderr.String())
		}
		if stdout.String() != "{}\n" {
			t.Fatalf("%s stdout = %q, want hook response", event, stdout.String())
		}
		if stderr.Len() != 0 {
			t.Fatalf("%s stderr = %s", event, stderr.String())
		}
	}

	runHook("session-start", `{"session_id":"claude-native-1"}`)
	runHook("user-prompt-submit", `{"prompt":"Fix the login redirect after OAuth callback."}`)
	runHook("user-prompt-submit", `{"prompt":"A later prompt should not retitle the session."}`)
	runHook("stop", `{"last_assistant_message":"Implemented the callback redirect fix and added a regression test."}`)

	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataAgentSessionID]; got != "claude-native-1" {
		t.Fatalf("agentSessionId = %#v, want native id", got)
	}
	if got := row.Metadata[hookMetadataTitle]; got != "Fix the login redirect after OAuth callback." {
		t.Fatalf("title = %#v, want first user prompt", got)
	}
	if got := row.Metadata[hookMetadataRecap]; got != "Implemented the callback redirect fix and added a regression test." {
		t.Fatalf("recap = %#v, want last assistant message", got)
	}
}

func TestRunHooksUninstallRemovesClaudeHooks(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, ".claude", "settings.local.json")
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatal(err)
	}
	// A yyork hook alongside the user's own hook under the same event.
	existing := `{"hooks":{"Stop":[{"hooks":[` +
		`{"type":"command","command":"yyork hooks claude-code stop","timeout":30},` +
		`{"type":"command","command":"my own stop hook"}]}]}}`
	if err := os.WriteFile(settingsPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)

	var stdout, stderr bytes.Buffer
	if code := runHooks(context.Background(), []string{"claude-code", "uninstall"}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit = %d, stderr: %s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "Removed yyork claude-code hooks") {
		t.Fatalf("stdout = %q, want removal message", stdout.String())
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "yyork hooks claude-code") {
		t.Fatalf("yyork hook not removed: %s", data)
	}
	if !strings.Contains(string(data), "my own stop hook") {
		t.Fatalf("user hook not preserved: %s", data)
	}

	// A second uninstall finds nothing and reports so.
	stdout.Reset()
	stderr.Reset()
	if code := runHooks(context.Background(), []string{"claude-code", "uninstall"}, &stdout, &stderr); code != 0 {
		t.Fatalf("second uninstall exit = %d, stderr: %s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "No yyork claude-code hooks found") {
		t.Fatalf("second uninstall stdout = %q, want not-found message", stdout.String())
	}
}

func insertHookTestSession(t *testing.T, ctx context.Context, id string) {
	t.Helper()
	dbPath, err := store.DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = dataStore.Close() }()

	err = dataStore.Sessions().Insert(ctx, store.Session{
		ID:            id,
		ProjectPath:   filepath.Join(t.TempDir(), "project"),
		ProjectName:   "project",
		AgentPlugin:   "codex",
		WorkspacePath: filepath.Join(t.TempDir(), "worktree"),
		ZellijSession: id,
		Metadata:      map[string]any{"prompt": "stored launch prompt"},
	})
	if err != nil {
		t.Fatal(err)
	}
}

func readHookTestSession(t *testing.T, ctx context.Context, id string) store.Session {
	t.Helper()
	dbPath, err := store.DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = dataStore.Close() }()

	row, err := dataStore.Sessions().Get(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	return row
}
