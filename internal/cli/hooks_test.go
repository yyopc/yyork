package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	sessionpkg "github.com/yyopc/yyork/internal/session"
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
	if got := row.Metadata["prompt"]; got != "stored launch prompt" {
		t.Fatalf("prompt metadata = %#v, want preserved launch prompt", got)
	}
}

func TestRunCodexHookPersistsKanbanActivityMetadata(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-activity"
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

	runHook("pre-tool-use", `{"tool_name":"Bash","tool_input":{"command":"pnpm --filter @yyork/web test:ci"}}`)
	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataState]; got != hookStateWorking {
		t.Fatalf("pre-tool-use state = %#v, want working", got)
	}
	if got := row.Metadata[hookMetadataCurrentTool]; got != "Running shell command: pnpm --filter @yyork/web test:ci" {
		t.Fatalf("currentToolCall = %#v", got)
	}
	if got := metadataStrings(row.Metadata[hookMetadataToolBulletins]); len(got) != 1 || got[0] != "Running shell command: pnpm --filter @yyork/web test:ci" {
		t.Fatalf("toolCallBulletins after pre = %#v", got)
	}
	if got := row.Metadata[hookMetadataLastActivityAt]; got == "" {
		t.Fatalf("lastActivityAt not set: %#v", row.Metadata)
	}

	runHook("post-tool-use", `{"tool_name":"Bash","tool_input":{"command":"pnpm --filter @yyork/web test:ci"}}`)
	row = readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataCurrentTool]; got != "" {
		t.Fatalf("post-tool-use currentToolCall = %#v, want cleared", got)
	}
	if got := metadataStrings(row.Metadata[hookMetadataToolBulletins]); len(got) != 2 || got[0] != "Finished shell command: pnpm --filter @yyork/web test:ci" {
		t.Fatalf("toolCallBulletins after post = %#v", got)
	}

	runHook("permission-request", `{"tool_name":"Bash","tool_input":{"command":"git push origin yyork/card-state"}}`)
	row = readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataState]; got != hookStateTriage {
		t.Fatalf("permission state = %#v, want triage", got)
	}
	if got := row.Metadata[hookMetadataTriageReason]; got != "Needs approval for shell command: git push origin yyork/card-state" {
		t.Fatalf("triageReason = %#v", got)
	}

	runHook("stop", `{"last_assistant_message":"Implemented the kanban card activity projection."}`)
	row = readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataState]; got != hookStatePrompt {
		t.Fatalf("stop state = %#v, want prompt", got)
	}
	if got := row.Metadata[hookMetadataRecap]; got != "Implemented the kanban card activity projection." {
		t.Fatalf("recap = %#v", got)
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
	if got := row.Metadata["prompt"]; got != "stored launch prompt" {
		t.Fatalf("prompt metadata = %#v, want preserved launch prompt", got)
	}
}

func TestYyorkHooksCommandPersistsDashboardMetadataForAgents(t *testing.T) {
	root := repoRoot(t)
	bin := filepath.Join(t.TempDir(), "yyork")

	buildCtx, cancelBuild := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancelBuild()
	build := exec.CommandContext(buildCtx, "go", "build", "-o", bin, ".")
	build.Dir = root
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build yyork: %v\n%s", err, output)
	}

	ctx := context.Background()
	home := t.TempDir()
	t.Setenv("HOME", home)

	cases := []struct {
		agent          string
		sessionID      string
		agentSessionID string
		title          string
		recap          string
	}{
		{
			agent:          "codex",
			sessionID:      "ao-cli-codex",
			agentSessionID: "codex-native-cli",
			title:          "Wire Codex hook metadata into the dashboard.",
			recap:          "Codex hook metadata reached the dashboard projection.",
		},
		{
			agent:          "claude-code",
			sessionID:      "ao-cli-claude",
			agentSessionID: "claude-native-cli",
			title:          "Wire Claude hook metadata into the dashboard.",
			recap:          "Claude hook metadata reached the dashboard projection.",
		},
	}

	for _, tc := range cases {
		insertHookTestSessionWithAgent(t, ctx, tc.sessionID, tc.agent)
		runHookBinary(t, bin, home, tc.sessionID, tc.agent, "session-start", `{"session_id":"`+tc.agentSessionID+`"}`)
		runHookBinary(t, bin, home, tc.sessionID, tc.agent, "user-prompt-submit", `{"prompt":"`+tc.title+`"}`)
		runHookBinary(t, bin, home, tc.sessionID, tc.agent, "stop", `{"last_assistant_message":"`+tc.recap+`"}`)
	}

	dataStore := openHookTestStore(t, ctx)
	defer func() { _ = dataStore.Close() }()

	workspace, err := sessionpkg.NewStoreWorkspaceSource(dataStore.Sessions()).Workspace(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range cases {
		got, ok := findWorkspaceSession(workspace.Sessions, tc.sessionID)
		if !ok {
			t.Fatalf("workspace session %s not found in %#v", tc.sessionID, workspace.Sessions)
		}
		if got.Agent != tc.agent {
			t.Fatalf("%s Agent = %q, want %q", tc.sessionID, got.Agent, tc.agent)
		}
		if got.Title != tc.title {
			t.Fatalf("%s Title = %q, want hook title %q", tc.sessionID, got.Title, tc.title)
		}
		if got.Recap != tc.recap || got.Description != tc.recap {
			t.Fatalf("%s recap/description = %q/%q, want %q", tc.sessionID, got.Recap, got.Description, tc.recap)
		}
		if got.State != sessionpkg.StatePrompt {
			t.Fatalf("%s State = %q, want prompt after Stop hook", tc.sessionID, got.State)
		}

		var metadata map[string]any
		if err := json.Unmarshal([]byte(got.Metadata), &metadata); err != nil {
			t.Fatalf("%s metadata is not JSON: %v\n%s", tc.sessionID, err, got.Metadata)
		}
		if metadata[hookMetadataAgentSessionID] != tc.agentSessionID {
			t.Fatalf("%s agentSessionId = %#v, want %q", tc.sessionID, metadata[hookMetadataAgentSessionID], tc.agentSessionID)
		}
		if metadata["prompt"] != "stored launch prompt" {
			t.Fatalf("%s prompt metadata = %#v, want preserved launch prompt", tc.sessionID, metadata["prompt"])
		}
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

func TestRunHooksUninstallRemovesCodexHooks(t *testing.T) {
	dir := t.TempDir()
	hooksPath := filepath.Join(dir, ".codex", "hooks.json")
	if err := os.MkdirAll(filepath.Dir(hooksPath), 0o755); err != nil {
		t.Fatal(err)
	}
	existing := `{"hooks":{"Stop":[{"matcher":null,"hooks":[` +
		`{"type":"command","command":"yyork hooks codex stop","timeout":30},` +
		`{"type":"command","command":"my own stop hook","timeout":3}]}]}}`
	if err := os.WriteFile(hooksPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}
	configPath := filepath.Join(dir, ".codex", "config.toml")
	if err := os.WriteFile(configPath, []byte("[features]\nhooks = true\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)

	var stdout, stderr bytes.Buffer
	if code := runHooks(context.Background(), []string{"codex", "uninstall"}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit = %d, stderr: %s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "Removed yyork codex hooks") {
		t.Fatalf("stdout = %q, want removal message", stdout.String())
	}

	data, err := os.ReadFile(hooksPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "yyork hooks codex") {
		t.Fatalf("yyork hook not removed: %s", data)
	}
	if !strings.Contains(string(data), "my own stop hook") {
		t.Fatalf("user hook not preserved: %s", data)
	}

	configData, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(configData), "hooks = true") {
		t.Fatalf("codex hooks feature flag should be preserved: %s", configData)
	}
}

func insertHookTestSession(t *testing.T, ctx context.Context, id string) {
	t.Helper()
	insertHookTestSessionWithAgent(t, ctx, id, "codex")
}

func insertHookTestSessionWithAgent(t *testing.T, ctx context.Context, id string, agent string) {
	t.Helper()
	dataStore := openHookTestStore(t, ctx)
	defer func() { _ = dataStore.Close() }()

	err := dataStore.Sessions().Insert(ctx, store.Session{
		ID:            id,
		ProjectPath:   filepath.Join(t.TempDir(), "project"),
		ProjectName:   "project",
		AgentPlugin:   agent,
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
	dataStore := openHookTestStore(t, ctx)
	defer func() { _ = dataStore.Close() }()

	row, err := dataStore.Sessions().Get(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	return row
}

func metadataStrings(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		text, ok := item.(string)
		if ok {
			out = append(out, text)
		}
	}
	return out
}

func openHookTestStore(t *testing.T, ctx context.Context) store.Store {
	t.Helper()
	dbPath, err := store.DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	return dataStore
}

func runHookBinary(t *testing.T, bin string, home string, sessionID string, agent string, event string, payload string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, bin, "hooks", agent, event)
	cmd.Stdin = strings.NewReader(payload)
	cmd.Env = envWith(map[string]string{
		"HOME":             home,
		"YYORK_SESSION_ID": sessionID,
	})
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("%s %s hook failed: %v\nstdout:%s\nstderr:%s", agent, event, err, stdout.String(), stderr.String())
	}
	if stdout.String() != "{}\n" {
		t.Fatalf("%s %s stdout = %q, want hook response", agent, event, stdout.String())
	}
	if stderr.Len() != 0 {
		t.Fatalf("%s %s stderr = %s", agent, event, stderr.String())
	}
}

func envWith(overrides map[string]string) []string {
	env := os.Environ()
	out := env[:0]
	for _, entry := range env {
		key, _, ok := strings.Cut(entry, "=")
		if !ok {
			out = append(out, entry)
			continue
		}
		if _, replace := overrides[key]; replace {
			continue
		}
		out = append(out, entry)
	}
	for key, value := range overrides {
		out = append(out, key+"="+value)
	}
	return out
}

func findWorkspaceSession(rows []sessionpkg.Session, id string) (sessionpkg.Session, bool) {
	for _, row := range rows {
		if row.ID == id {
			return row, true
		}
	}
	return sessionpkg.Session{}, false
}

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("could not find repo root from %s", dir)
		}
		dir = parent
	}
}
