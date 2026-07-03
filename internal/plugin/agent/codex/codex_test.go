package codex

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/plugin/agent"
	"github.com/yyopc/yyork/internal/plugin/agent/hookexec"
)

func TestGetLaunchCommandBuildsCrossPlatformArgv(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	cmd, err := plugin.GetLaunchCommand(context.Background(), agent.LaunchConfig{
		Permissions:      agent.PermissionModeBypassPermissions,
		Prompt:           "-fix this",
		SystemPromptFile: filepath.Join("tmp", "prompt with spaces.md"),
		SystemPrompt:     "ignored",
	})
	if err != nil {
		t.Fatal(err)
	}

	want := []string{
		"codex",
		"-c", "check_for_update_on_startup=false",
		"--no-alt-screen",
		"--dangerously-bypass-hook-trust",
		"--dangerously-bypass-approvals-and-sandbox",
		"-c", "model_instructions_file=" + filepath.Join("tmp", "prompt with spaces.md"),
		"--", "-fix this",
	}
	if !reflect.DeepEqual(cmd, want) {
		t.Fatalf("unexpected command\nwant: %#v\n got: %#v", want, cmd)
	}
}

func TestGetLaunchCommandMapsApprovalModes(t *testing.T) {
	tests := []struct {
		name        string
		permission  agent.PermissionMode
		want        []string
		notExpected string
	}{
		{
			name:        "default",
			permission:  agent.PermissionModeDefault,
			notExpected: "--ask-for-approval",
		},
		{
			name:       "accept-edits",
			permission: agent.PermissionModeAcceptEdits,
			want:       []string{"--ask-for-approval", "on-request"},
		},
		{
			name:       "auto",
			permission: agent.PermissionModeAuto,
			want:       []string{"--ask-for-approval", "on-request", "-c", `approvals_reviewer="auto_review"`},
		},
		{
			name:       "bypass-permissions",
			permission: agent.PermissionModeBypassPermissions,
			want:       []string{"--dangerously-bypass-approvals-and-sandbox"},
		},
		{
			name:        "empty",
			permission:  "",
			notExpected: "--ask-for-approval",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			plugin := &Plugin{resolvedBinary: "codex"}
			cmd, err := plugin.GetLaunchCommand(context.Background(), agent.LaunchConfig{
				Permissions: tt.permission,
			})
			if err != nil {
				t.Fatal(err)
			}
			if len(tt.want) > 0 && !containsSubsequence(cmd, tt.want) {
				t.Fatalf("command %#v does not contain %#v", cmd, tt.want)
			}
			if !contains(cmd, "--no-alt-screen") {
				t.Fatalf("command %#v missing --no-alt-screen", cmd)
			}
			if !contains(cmd, "--dangerously-bypass-hook-trust") {
				t.Fatalf("command %#v missing --dangerously-bypass-hook-trust", cmd)
			}
			if tt.notExpected != "" && contains(cmd, tt.notExpected) {
				t.Fatalf("command %#v contains %q", cmd, tt.notExpected)
			}
		})
	}
}

func TestGetPromptDeliveryStrategyIsInCommand(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	got, err := plugin.GetPromptDeliveryStrategy(context.Background(), agent.LaunchConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if got != agent.PromptDeliveryInCommand {
		t.Fatalf("unexpected strategy: %q", got)
	}
}

func TestGetSessionTitleCommandBuildsExecArgv(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	cmd, err := plugin.GetSessionTitleCommand(context.Background(), agent.TitleConfig{
		Prompt: "Explain the current state of agent hooks. Scope: do not modify files.",
	})
	if err != nil {
		t.Fatal(err)
	}

	wantPrefix := []string{
		"codex",
		"exec",
		"-c",
		"check_for_update_on_startup=false",
		"-c",
		`approval_policy="never"`,
	}
	if !reflect.DeepEqual(cmd[:len(wantPrefix)], wantPrefix) {
		t.Fatalf("cmd prefix = %#v, want %#v", cmd[:len(wantPrefix)], wantPrefix)
	}
	for _, want := range []string{
		"--skip-git-repo-check",
		"--ephemeral",
		"--ignore-user-config",
		"--ignore-rules",
		"--sandbox",
		"read-only",
		"--color",
		"never",
		"--cd",
		os.TempDir(),
	} {
		if !contains(cmd, want) {
			t.Fatalf("cmd %#v missing %q", cmd, want)
		}
	}
	if contains(cmd, "--ask-for-approval") {
		t.Fatalf("cmd %#v includes --ask-for-approval, which codex exec rejects", cmd)
	}
	prompt := cmd[len(cmd)-1]
	if !strings.Contains(prompt, "Use 3 to 5 words.") ||
		!strings.Contains(prompt, "Use 60 characters or fewer.") ||
		!strings.Contains(prompt, "Explain the current state of agent hooks") {
		t.Fatalf("title prompt = %q", prompt)
	}
}

func TestGetSessionRecapCommandBuildsExecArgv(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	cmd, err := plugin.GetSessionRecapCommand(context.Background(), agent.RecapConfig{
		LastAssistantMessage: "Implemented the hook title fix and paused for release validation.",
	})
	if err != nil {
		t.Fatal(err)
	}

	wantPrefix := []string{
		"codex",
		"exec",
		"-c",
		"check_for_update_on_startup=false",
		"-c",
		`approval_policy="never"`,
	}
	if !reflect.DeepEqual(cmd[:len(wantPrefix)], wantPrefix) {
		t.Fatalf("cmd prefix = %#v, want %#v", cmd[:len(wantPrefix)], wantPrefix)
	}
	for _, want := range []string{
		"--skip-git-repo-check",
		"--ephemeral",
		"--ignore-user-config",
		"--ignore-rules",
		"--sandbox",
		"read-only",
		"--color",
		"never",
		"--cd",
		os.TempDir(),
	} {
		if !contains(cmd, want) {
			t.Fatalf("cmd %#v missing %q", cmd, want)
		}
	}
	prompt := cmd[len(cmd)-1]
	if !strings.Contains(prompt, "Use 240 characters or fewer.") ||
		!strings.Contains(prompt, "Implemented the hook title fix") {
		t.Fatalf("recap prompt = %q", prompt)
	}
}

func TestGetConfigSpecHasNoCustomFieldsYet(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	spec, err := plugin.GetConfigSpec(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(spec.Fields) != 0 {
		t.Fatalf("unexpected config fields: %#v", spec.Fields)
	}
}

func TestGetAgentHooksInstallsCodexHooks(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}
	workspace := t.TempDir()
	hooksDir := filepath.Join(workspace, ".codex")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		t.Fatal(err)
	}
	hooksPath := filepath.Join(hooksDir, "hooks.json")
	existing := `{"hooks":{"Stop":[{"matcher":null,"hooks":[{"type":"command","command":"custom stop hook","timeout":3}]}]}}`
	if err := os.WriteFile(hooksPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := agent.WorkspaceHookConfig{
		DataDir:       t.TempDir(),
		SessionID:     "sess-1",
		WorkspacePath: workspace,
	}
	if err := plugin.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}
	// A second install must not duplicate yyork hook commands.
	if err := plugin.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(hooksPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "cmd/yyork") {
		t.Fatalf("hook command still points at deleted cmd/yyork package: %s", data)
	}
	var config codexHookFile
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	if config.Hooks == nil {
		t.Fatalf("hooks config missing hooks object: %#v", config)
	}
	for _, spec := range codexManagedHooks {
		entries := config.Hooks[spec.Event]
		if count := countCodexHookCommand(entries, spec.command()); count != 1 {
			t.Fatalf("%s command count = %d, want 1 in %#v", spec.Event, count, entries)
		}
	}
	stopEntries := config.Hooks["Stop"]
	if countCodexHookCommand(stopEntries, "custom stop hook") != 1 {
		t.Fatalf("existing Stop hook was not preserved: %#v", stopEntries)
	}

	configData, err := os.ReadFile(filepath.Join(workspace, ".codex", "config.toml"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(configData), codexHooksFeatureLine) {
		t.Fatalf("config.toml missing hooks feature flag: %s", configData)
	}
}

func TestGetAgentHooksResolvesCodexHookCommandAtInstallTime(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}
	workspace := t.TempDir()
	cfg := agent.WorkspaceHookConfig{
		DataDir:       t.TempDir(),
		SessionID:     "sess-1",
		WorkspacePath: workspace,
	}

	t.Setenv(hookexec.CommandEnv, "first-yyork")
	if err := plugin.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}

	t.Setenv(hookexec.CommandEnv, "second-yyork")
	if err := plugin.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(filepath.Join(workspace, ".codex", "hooks.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "first-yyork hooks codex") {
		t.Fatalf("install preserved stale hook command: %s", data)
	}

	var config codexHookFile
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	for _, spec := range codexManagedHooks {
		command := spec.command()
		if !strings.HasPrefix(command, "second-yyork hooks codex ") {
			t.Fatalf("resolved command = %q, want second resolver", command)
		}
		if count := countCodexHookCommand(config.Hooks[spec.Event], command); count != 1 {
			t.Fatalf("%s command count = %d, want 1 in %#v", spec.Event, count, config.Hooks[spec.Event])
		}
	}
}

func TestGetAgentHooksReplacesStaleManagedCodexHooks(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}
	workspace := t.TempDir()
	hooksPath := filepath.Join(workspace, ".codex", "hooks.json")
	if err := os.MkdirAll(filepath.Dir(hooksPath), 0o755); err != nil {
		t.Fatal(err)
	}
	existing := `{"hooks":{"SessionStart":[{"matcher":null,"hooks":[{"type":"command","command":"entire hooks codex session-start","timeout":30}]}],"PreToolCall":[{"matcher":"","hooks":[{"type":"command","command":"entire hooks codex pre-tool-use","timeout":30}]}],"PostToolCall":[{"matcher":"","hooks":[{"type":"command","command":"entire hooks codex post-tool-use","timeout":30}]}],"Stop":[{"matcher":null,"hooks":[{"type":"command","command":"entire hooks codex stop","timeout":30},{"type":"command","command":"custom stop hook","timeout":3}]}],"UserPromptSubmit":[{"matcher":null,"hooks":[{"type":"command","command":"entire hooks codex user-prompt-submit","timeout":30}]}]}}`
	if err := os.WriteFile(hooksPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := agent.WorkspaceHookConfig{
		DataDir:       t.TempDir(),
		SessionID:     "sess-1",
		WorkspacePath: workspace,
	}
	if err := plugin.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(hooksPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "entire hooks codex") {
		t.Fatalf("stale managed hook command was preserved: %s", data)
	}
	if strings.Contains(string(data), "cmd/yyork") {
		t.Fatalf("replacement hook command still points at deleted cmd/yyork package: %s", data)
	}

	var config codexHookFile
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	for _, spec := range codexManagedHooks {
		entries := config.Hooks[spec.Event]
		if count := countCodexHookCommand(entries, spec.command()); count != 1 {
			t.Fatalf("%s command count = %d, want 1 in %#v", spec.Event, count, entries)
		}
	}
	for _, event := range codexStaleManagedEvents {
		if entries := config.Hooks[event]; len(entries) != 0 {
			t.Fatalf("stale %s entries were preserved: %#v", event, entries)
		}
	}
	if countCodexHookCommand(config.Hooks["Stop"], "custom stop hook") != 1 {
		t.Fatalf("existing Stop hook was not preserved: %#v", config.Hooks["Stop"])
	}
}

func TestUninstallHooksRemovesCodexHooks(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}
	workspace := t.TempDir()
	hooksPath := filepath.Join(workspace, ".codex", "hooks.json")

	ctx := context.Background()
	cfg := agent.WorkspaceHookConfig{DataDir: t.TempDir(), SessionID: "sess-1", WorkspacePath: workspace}

	// Pre-seed a user's own Stop hook; it must survive uninstall.
	if err := os.MkdirAll(filepath.Dir(hooksPath), 0o755); err != nil {
		t.Fatal(err)
	}
	existing := `{"hooks":{"Stop":[{"matcher":null,"hooks":[{"type":"command","command":"custom stop hook","timeout":3}]}]}}`
	if err := os.WriteFile(hooksPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := plugin.GetAgentHooks(ctx, cfg); err != nil {
		t.Fatal(err)
	}
	if installed, err := plugin.AreHooksInstalled(ctx, workspace); err != nil || !installed {
		t.Fatalf("AreHooksInstalled after install = (%v, %v), want (true, nil)", installed, err)
	}

	if err := plugin.UninstallHooks(ctx, workspace); err != nil {
		t.Fatal(err)
	}
	if installed, err := plugin.AreHooksInstalled(ctx, workspace); err != nil || installed {
		t.Fatalf("AreHooksInstalled after uninstall = (%v, %v), want (false, nil)", installed, err)
	}

	data, err := os.ReadFile(hooksPath)
	if err != nil {
		t.Fatal(err)
	}
	var config codexHookFile
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	for _, spec := range codexManagedHooks {
		command := spec.command()
		if got := countCodexHookCommand(config.Hooks[spec.Event], command); got != 0 {
			t.Fatalf("%s command %q count = %d after uninstall, want 0", spec.Event, command, got)
		}
	}
	if countCodexHookCommand(config.Hooks["Stop"], "custom stop hook") != 1 {
		t.Fatalf("user Stop hook not preserved: %#v", config.Hooks["Stop"])
	}

	// The shared hooks feature flag in config.toml is left in place — it enables
	// every Codex hook, not just yyork's.
	configData, err := os.ReadFile(filepath.Join(workspace, ".codex", "config.toml"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(configData), codexHooksFeatureLine) {
		t.Fatalf("config.toml hooks feature flag removed by uninstall: %s", configData)
	}
}

func TestGetRestoreCommandReadsAgentSessionID(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	cmd, ok, err := plugin.GetRestoreCommand(context.Background(), agent.RestoreConfig{
		Permissions: agent.PermissionModeAuto,
		Session: agent.SessionRef{
			Metadata: map[string]string{codexAgentSessionIDMetadataKey: "thread-123"},
		},
	})
	if err != nil {
		t.Fatalf("err = %v, want nil", err)
	}
	if !ok {
		t.Fatal("ok = false, want true")
	}
	want := []string{
		"codex",
		"resume",
		"-c", "check_for_update_on_startup=false",
		"--ask-for-approval", "on-request",
		"-c", `approvals_reviewer="auto_review"`,
		"--no-alt-screen",
		"--dangerously-bypass-hook-trust",
		"thread-123",
	}
	if !reflect.DeepEqual(cmd, want) {
		t.Fatalf("restore cmd\nwant: %#v\n got: %#v", want, cmd)
	}
}

func TestGetRestoreCommandFalseWithoutAgentSessionID(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	cases := []struct {
		name string
		ref  agent.SessionRef
	}{
		{"empty session ref", agent.SessionRef{}},
		{"empty metadata", agent.SessionRef{Metadata: map[string]string{}}},
		{"blank agent session metadata", agent.SessionRef{Metadata: map[string]string{codexAgentSessionIDMetadataKey: "   "}}},
		{"workspace path only", agent.SessionRef{WorkspacePath: "/some/path"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cmd, ok, err := plugin.GetRestoreCommand(context.Background(), agent.RestoreConfig{
				Permissions: agent.PermissionModeAuto,
				Session:     tc.ref,
			})
			if err != nil {
				t.Fatalf("err = %v, want nil", err)
			}
			if ok {
				t.Fatalf("ok = true, want false")
			}
			if cmd != nil {
				t.Fatalf("cmd = %#v, want nil", cmd)
			}
		})
	}
}

func TestGetForkCommandReadsAgentSessionID(t *testing.T) {
	plugin := &Plugin{resolvedBinary: "codex"}

	cmd, ok, err := plugin.GetForkCommand(context.Background(), agent.ForkConfig{
		Permissions:   agent.PermissionModeBypassPermissions,
		Prompt:        "Start implementation.",
		SystemPrompt:  "Use the forked worktree.",
		WorkspacePath: "/tmp/worktree",
		Session: agent.SessionRef{
			Metadata: map[string]string{codexAgentSessionIDMetadataKey: "thread-123"},
		},
	})
	if err != nil {
		t.Fatalf("err = %v, want nil", err)
	}
	if !ok {
		t.Fatal("ok = false, want true")
	}
	want := []string{
		"codex",
		"fork",
		"-c", "check_for_update_on_startup=false",
		"--dangerously-bypass-approvals-and-sandbox",
		"--no-alt-screen",
		"--dangerously-bypass-hook-trust",
		"-c", "developer_instructions=Use the forked worktree.",
		"-C", "/tmp/worktree",
		"thread-123",
		"Start implementation.",
	}
	if !reflect.DeepEqual(cmd, want) {
		t.Fatalf("fork cmd\nwant: %#v\n got: %#v", want, cmd)
	}
}

func contains(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func containsSubsequence(values []string, needle []string) bool {
	if len(needle) == 0 {
		return true
	}

	for start := range values {
		if start+len(needle) > len(values) {
			return false
		}
		ok := true
		for offset, want := range needle {
			if values[start+offset] != want {
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

func countCodexHookCommand(entries []codexMatcherGroup, command string) int {
	count := 0
	for _, entry := range entries {
		for _, hook := range entry.Hooks {
			if hook.Command == command {
				count++
			}
		}
	}
	return count
}
