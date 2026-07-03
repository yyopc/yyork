package claudecode

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/yyopc/yyork/internal/plugin/agent"
	"github.com/yyopc/yyork/internal/plugin/agent/hookexec"
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

func TestGetSessionTitleCommandBuildsPrintArgv(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}

	cmd, err := p.GetSessionTitleCommand(context.Background(), agent.TitleConfig{
		Prompt: "Explain the current state of agent hooks. Scope: do not modify files.",
	})
	if err != nil {
		t.Fatal(err)
	}

	wantPrefix := []string{
		"claude",
		"--safe-mode",
		"-p",
		"--output-format",
		"text",
		"--no-session-persistence",
	}
	if !reflect.DeepEqual(cmd[:len(wantPrefix)], wantPrefix) {
		t.Fatalf("cmd prefix = %#v, want %#v", cmd[:len(wantPrefix)], wantPrefix)
	}
	prompt := cmd[len(cmd)-1]
	if !strings.Contains(prompt, "Use 3 to 5 words.") ||
		!strings.Contains(prompt, "Use 60 characters or fewer.") ||
		!strings.Contains(prompt, "Explain the current state of agent hooks") {
		t.Fatalf("title prompt = %q", prompt)
	}
}

func TestGetSessionRecapCommandBuildsPrintArgv(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}

	cmd, err := p.GetSessionRecapCommand(context.Background(), agent.RecapConfig{
		LastAssistantMessage: "Implemented the hook title fix and paused for release validation.",
	})
	if err != nil {
		t.Fatal(err)
	}

	wantPrefix := []string{
		"claude",
		"--safe-mode",
		"-p",
		"--output-format",
		"text",
		"--no-session-persistence",
	}
	if !reflect.DeepEqual(cmd[:len(wantPrefix)], wantPrefix) {
		t.Fatalf("cmd prefix = %#v, want %#v", cmd[:len(wantPrefix)], wantPrefix)
	}
	prompt := cmd[len(cmd)-1]
	if !strings.Contains(prompt, "Use 240 characters or fewer.") ||
		!strings.Contains(prompt, "Implemented the hook title fix") {
		t.Fatalf("recap prompt = %q", prompt)
	}
}

func TestGetLaunchCommandInjectsSessionID(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}
	cmd, err := p.GetLaunchCommand(context.Background(), agent.LaunchConfig{
		SessionID: "e0tt49",
		Prompt:    "do the thing",
	})
	if err != nil {
		t.Fatal(err)
	}
	wantUUID := claudeSessionUUID("e0tt49")
	if !containsSubsequence(cmd, []string{"--session-id", wantUUID}) {
		t.Fatalf("command %#v missing --session-id %q", cmd, wantUUID)
	}

	// No SessionID → no --session-id flag.
	cmd, err = p.GetLaunchCommand(context.Background(), agent.LaunchConfig{Prompt: "x"})
	if err != nil {
		t.Fatal(err)
	}
	if contains(cmd, "--session-id") {
		t.Fatalf("command %#v unexpectedly contains --session-id", cmd)
	}
}

func TestClaudeSessionUUIDDeterministicAndUnique(t *testing.T) {
	a1 := claudeSessionUUID("alpha")
	a2 := claudeSessionUUID("alpha")
	b := claudeSessionUUID("beta")
	if a1 != a2 {
		t.Fatalf("derivation not deterministic: %q != %q", a1, a2)
	}
	if a1 == b {
		t.Fatalf("distinct ids collided: both %q", a1)
	}
	if _, err := uuid.Parse(a1); err != nil {
		t.Fatalf("derived value is not a valid UUID: %q (%v)", a1, err)
	}
}

func TestGetAgentHooksInstallsClaudeHooks(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}
	workspace := t.TempDir()
	settingsDir := filepath.Join(workspace, ".claude")
	if err := os.MkdirAll(settingsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	settingsPath := filepath.Join(settingsDir, "settings.local.json")
	// Pre-seed a user's own Stop hook + an unrelated setting; both must survive.
	existing := `{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"my own stop hook","timeout":5}]}]},"permissions":{"defaultMode":"plan"}}`
	if err := os.WriteFile(settingsPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := agent.WorkspaceHookConfig{DataDir: t.TempDir(), SessionID: "sess-1", WorkspacePath: workspace}
	if err := p.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}
	// A second install must not duplicate yyork hook commands.
	if err := p.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "cmd/yyork") {
		t.Fatalf("hook command still points at deleted cmd/yyork package: %s", data)
	}
	var config struct {
		Hooks       map[string][]claudeMatcherGroup `json:"hooks"`
		Permissions json.RawMessage                 `json:"permissions"`
	}
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	if config.Hooks == nil {
		t.Fatalf("hooks object missing: %s", data)
	}

	// Every managed command is installed exactly once under its event.
	for _, spec := range claudeManagedHooks {
		command := spec.command()
		if got := countClaudeHookCommand(config.Hooks[spec.Event], command); got != 1 {
			t.Fatalf("%s command %q count = %d, want 1", spec.Event, command, got)
		}
	}
	// Existing user hook preserved.
	if countClaudeHookCommand(config.Hooks["Stop"], "my own stop hook") != 1 {
		t.Fatalf("existing Stop hook not preserved: %#v", config.Hooks["Stop"])
	}
	// Unrelated settings preserved.
	if len(config.Permissions) == 0 {
		t.Fatalf("unrelated settings clobbered: %s", data)
	}
	// SessionStart carries the required matcher; UserPromptSubmit omits it.
	if m := matcherForCommand(config.Hooks["SessionStart"], claudeHookCommand("session-start")); m == nil || *m != "startup" {
		t.Fatalf("SessionStart matcher = %v, want startup", m)
	}
	if m := matcherForCommand(config.Hooks["UserPromptSubmit"], claudeHookCommand("user-prompt-submit")); m != nil {
		t.Fatalf("UserPromptSubmit matcher = %v, want none", m)
	}
}

func TestGetAgentHooksResolvesClaudeHookCommandAtInstallTime(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}
	workspace := t.TempDir()
	cfg := agent.WorkspaceHookConfig{DataDir: t.TempDir(), SessionID: "sess-1", WorkspacePath: workspace}

	t.Setenv(hookexec.CommandEnv, "first-yyork")
	if err := p.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}

	t.Setenv(hookexec.CommandEnv, "second-yyork")
	if err := p.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(filepath.Join(workspace, ".claude", "settings.local.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "first-yyork hooks claude-code") {
		t.Fatalf("install preserved stale hook command: %s", data)
	}

	var config struct {
		Hooks map[string][]claudeMatcherGroup `json:"hooks"`
	}
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	for _, spec := range claudeManagedHooks {
		command := spec.command()
		if !strings.HasPrefix(command, "second-yyork hooks claude-code ") {
			t.Fatalf("resolved command = %q, want second resolver", command)
		}
		if got := countClaudeHookCommand(config.Hooks[spec.Event], command); got != 1 {
			t.Fatalf("%s command %q count = %d, want 1", spec.Event, command, got)
		}
	}
}

func TestGetAgentHooksReplacesStaleManagedClaudeHooks(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}
	workspace := t.TempDir()
	settingsPath := filepath.Join(workspace, ".claude", "settings.local.json")
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatal(err)
	}
	existing := `{"hooks":{"SessionStart":[{"matcher":"startup","hooks":[{"type":"command","command":"go run ./cmd/yyork hooks claude-code session-start","timeout":30}]}],"Stop":[{"hooks":[{"type":"command","command":"go run ./cmd/yyork hooks claude-code stop","timeout":30},{"type":"command","command":"my own stop hook","timeout":5}]}],"UserPromptSubmit":[{"hooks":[{"type":"command","command":"go run ./cmd/yyork hooks claude-code user-prompt-submit","timeout":30}]}]},"permissions":{"defaultMode":"plan"}}`
	if err := os.WriteFile(settingsPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := agent.WorkspaceHookConfig{DataDir: t.TempDir(), SessionID: "sess-1", WorkspacePath: workspace}
	if err := p.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "cmd/yyork") {
		t.Fatalf("stale managed hook command was preserved: %s", data)
	}

	var config struct {
		Hooks       map[string][]claudeMatcherGroup `json:"hooks"`
		Permissions json.RawMessage                 `json:"permissions"`
	}
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	for _, spec := range claudeManagedHooks {
		command := spec.command()
		if got := countClaudeHookCommand(config.Hooks[spec.Event], command); got != 1 {
			t.Fatalf("%s command %q count = %d, want 1", spec.Event, command, got)
		}
	}
	if countClaudeHookCommand(config.Hooks["Stop"], "my own stop hook") != 1 {
		t.Fatalf("user Stop hook not preserved: %#v", config.Hooks["Stop"])
	}
	if len(config.Permissions) == 0 {
		t.Fatalf("unrelated settings clobbered: %s", data)
	}
}

func TestUninstallHooksRemovesClaudeHooks(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}
	workspace := t.TempDir()
	settingsPath := filepath.Join(workspace, ".claude", "settings.local.json")

	ctx := context.Background()
	cfg := agent.WorkspaceHookConfig{DataDir: t.TempDir(), SessionID: "sess-1", WorkspacePath: workspace}

	// Pre-seed a user's own Stop hook + an unrelated setting; both must survive.
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatal(err)
	}
	existing := `{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"my own stop hook","timeout":5}]}]},"permissions":{"defaultMode":"plan"}}`
	if err := os.WriteFile(settingsPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := p.GetAgentHooks(ctx, cfg); err != nil {
		t.Fatal(err)
	}
	if installed, err := p.AreHooksInstalled(ctx, workspace); err != nil || !installed {
		t.Fatalf("AreHooksInstalled after install = (%v, %v), want (true, nil)", installed, err)
	}

	if err := p.UninstallHooks(ctx, workspace); err != nil {
		t.Fatal(err)
	}
	if installed, err := p.AreHooksInstalled(ctx, workspace); err != nil || installed {
		t.Fatalf("AreHooksInstalled after uninstall = (%v, %v), want (false, nil)", installed, err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}
	var config struct {
		Hooks       map[string][]claudeMatcherGroup `json:"hooks"`
		Permissions json.RawMessage                 `json:"permissions"`
	}
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	// No managed command survives; the SessionStart/UserPromptSubmit events,
	// which held only yyork hooks, are removed entirely.
	for _, spec := range claudeManagedHooks {
		command := spec.command()
		if got := countClaudeHookCommand(config.Hooks[spec.Event], command); got != 0 {
			t.Fatalf("%s command %q count = %d after uninstall, want 0", spec.Event, command, got)
		}
	}
	// The user's own Stop hook and unrelated settings are preserved.
	if countClaudeHookCommand(config.Hooks["Stop"], "my own stop hook") != 1 {
		t.Fatalf("user Stop hook not preserved: %#v", config.Hooks["Stop"])
	}
	if len(config.Permissions) == 0 {
		t.Fatalf("unrelated settings clobbered: %s", data)
	}

	// Uninstall is idempotent: a second call is a clean no-op.
	if err := p.UninstallHooks(ctx, workspace); err != nil {
		t.Fatalf("second uninstall: %v", err)
	}
}

func TestUninstallHooksNoSettingsFile(t *testing.T) {
	p := &Plugin{resolvedBinary: "claude"}
	workspace := t.TempDir()
	if err := p.UninstallHooks(context.Background(), workspace); err != nil {
		t.Fatalf("uninstall with no settings file: %v", err)
	}
	if installed, err := p.AreHooksInstalled(context.Background(), workspace); err != nil || installed {
		t.Fatalf("AreHooksInstalled = (%v, %v), want (false, nil)", installed, err)
	}
}

// countClaudeHookCommand counts how many hook entries under one event register
// the given command — used to prove no duplicate yyork hooks.
func countClaudeHookCommand(groups []claudeMatcherGroup, command string) int {
	count := 0
	for _, group := range groups {
		for _, hook := range group.Hooks {
			if hook.Command == command {
				count++
			}
		}
	}
	return count
}

// matcherForCommand returns the matcher on the group that registers the given
// command (nil if the group has no matcher).
func matcherForCommand(groups []claudeMatcherGroup, command string) *string {
	for _, group := range groups {
		for _, hook := range group.Hooks {
			if hook.Command == command {
				return group.Matcher
			}
		}
	}
	return nil
}

func TestGetRestoreCommandReadsAgentSessionID(t *testing.T) {
	cmd, ok, err := (&Plugin{resolvedBinary: "claude"}).GetRestoreCommand(context.Background(), agent.RestoreConfig{
		Permissions: agent.PermissionModeBypassPermissions,
		Session: agent.SessionRef{
			ID:       "sess-r",
			Metadata: map[string]string{claudeAgentSessionIDMetadataKey: "claude-native-1"},
		},
	})
	if err != nil || !ok {
		t.Fatalf("restore = (ok=%v, err=%v), want ok", ok, err)
	}
	// The hook-captured native id wins over the derived fallback.
	want := []string{"claude", "--permission-mode", "bypassPermissions", "--resume", "claude-native-1"}
	if !reflect.DeepEqual(cmd, want) {
		t.Fatalf("restore cmd\nwant: %#v\n got: %#v", want, cmd)
	}
}

func TestGetRestoreCommandFallsBackToDerivedUUID(t *testing.T) {
	// No agentSessionId captured (pre-hook session) → derive deterministically
	// from the yyork session id, the explicit fallback.
	cmd, ok, err := (&Plugin{resolvedBinary: "claude"}).GetRestoreCommand(context.Background(), agent.RestoreConfig{
		Permissions: agent.PermissionModeBypassPermissions,
		Session:     agent.SessionRef{ID: "sess-r"},
	})
	if err != nil || !ok {
		t.Fatalf("restore = (ok=%v, err=%v), want ok", ok, err)
	}
	want := []string{"claude", "--permission-mode", "bypassPermissions", "--resume", claudeSessionUUID("sess-r")}
	if !reflect.DeepEqual(cmd, want) {
		t.Fatalf("restore cmd\nwant: %#v\n got: %#v", want, cmd)
	}
}

func TestGetRestoreCommandFalseWithoutSessionID(t *testing.T) {
	cases := []struct {
		name string
		ref  agent.SessionRef
	}{
		{"empty ref", agent.SessionRef{}},
		{"blank agent session, no id", agent.SessionRef{Metadata: map[string]string{claudeAgentSessionIDMetadataKey: "   "}}},
		{"workspace path only", agent.SessionRef{WorkspacePath: "/some/path"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cmd, ok, err := (&Plugin{resolvedBinary: "claude"}).GetRestoreCommand(context.Background(),
				agent.RestoreConfig{Permissions: agent.PermissionModeBypassPermissions, Session: tc.ref})
			if err != nil || ok || cmd != nil {
				t.Fatalf("restore = (%#v, %v, %v), want (nil,false,nil)", cmd, ok, err)
			}
		})
	}
}

func TestGetForkCommandReadsAgentSessionID(t *testing.T) {
	cmd, ok, err := (&Plugin{resolvedBinary: "claude"}).GetForkCommand(context.Background(), agent.ForkConfig{
		Permissions:  agent.PermissionModeBypassPermissions,
		Prompt:       "Start implementation.",
		SystemPrompt: "Use the forked worktree.",
		Session: agent.SessionRef{
			ID:       "sess-r",
			Metadata: map[string]string{claudeAgentSessionIDMetadataKey: "claude-native-1"},
		},
	})
	if err != nil || !ok {
		t.Fatalf("fork = (ok=%v, err=%v), want ok", ok, err)
	}
	want := []string{
		"claude",
		"--permission-mode", "bypassPermissions",
		"--append-system-prompt", "Use the forked worktree.",
		"--resume", "claude-native-1",
		"--fork-session",
		"--", "Start implementation.",
	}
	if !reflect.DeepEqual(cmd, want) {
		t.Fatalf("fork cmd\nwant: %#v\n got: %#v", want, cmd)
	}
}

func TestGetForkCommandFallsBackToDerivedUUID(t *testing.T) {
	cmd, ok, err := (&Plugin{resolvedBinary: "claude"}).GetForkCommand(context.Background(), agent.ForkConfig{
		Permissions: agent.PermissionModeBypassPermissions,
		Session:     agent.SessionRef{ID: "sess-r"},
	})
	if err != nil || !ok {
		t.Fatalf("fork = (ok=%v, err=%v), want ok", ok, err)
	}
	want := []string{"claude", "--permission-mode", "bypassPermissions", "--resume", claudeSessionUUID("sess-r"), "--fork-session"}
	if !reflect.DeepEqual(cmd, want) {
		t.Fatalf("fork cmd\nwant: %#v\n got: %#v", want, cmd)
	}
}

func TestManifestID(t *testing.T) {
	if got := New().Manifest().ID; got != "claude-code" {
		t.Fatalf("manifest id = %q, want claude-code", got)
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

	work := "/Users/me/.yyork/worktrees/01ABC"
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
