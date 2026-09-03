package cursor

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/plugin/agent"
	"github.com/yyopc/yyork/internal/plugin/agent/hookexec"
)

func TestGetConfigSpecParsesCursorModelIDs(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("test helper is a POSIX shell script")
	}

	dir := t.TempDir()
	binary := filepath.Join(dir, "agent")
	script := "#!/bin/sh\nprintf '%s\\n' 'auto - Auto' 'kimi-k3-high - Kimi K3 High (current)' 'claude-opus-5-thinking-xhigh-fast - Claude Opus - Fast' 'not a model line'\n"
	if err := os.WriteFile(binary, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	p := &Plugin{resolvedBinary: binary}
	spec, err := p.GetConfigSpec(context.Background())
	if err != nil {
		t.Fatalf("GetConfigSpec: %v", err)
	}
	if len(spec.Fields) != 1 {
		t.Fatalf("fields = %#v, want one model field", spec.Fields)
	}
	field := spec.Fields[0]
	if field.Key != "model" || field.Type != agent.ConfigFieldEnum || field.Default != "auto" {
		t.Fatalf("model field = %#v", field)
	}
	want := []string{"auto", "kimi-k3-high", "claude-opus-5-thinking-xhigh-fast"}
	if !reflect.DeepEqual(field.Enum, want) {
		t.Fatalf("model enum = %#v, want %#v", field.Enum, want)
	}
}

func TestGetConfigSpecKeepsAdvisoryEnumEmptyWhenDiscoveryFails(t *testing.T) {
	p := &Plugin{resolvedBinary: filepath.Join(t.TempDir(), "missing-agent")}
	spec, err := p.GetConfigSpec(context.Background())
	if err != nil {
		t.Fatalf("GetConfigSpec: %v", err)
	}
	if len(spec.Fields) != 1 || len(spec.Fields[0].Enum) != 0 {
		t.Fatalf("fields = %#v, want one model field with an empty advisory enum", spec.Fields)
	}
}

func TestGetLaunchCommandPassesParameterizedModelVerbatim(t *testing.T) {
	p := &Plugin{resolvedBinary: "/opt/cursor/agent"}
	model := "claude-opus-4-8[context=1m,effort=high,fast=false]"
	got, err := p.GetLaunchCommand(context.Background(), agent.LaunchConfig{
		Config:      agent.Config{"model": model},
		Permissions: agent.PermissionModeAuto,
		Prompt:      "-fix the failing test",
	})
	if err != nil {
		t.Fatalf("GetLaunchCommand: %v", err)
	}
	want := []string{
		"/opt/cursor/agent",
		"--model", model,
		"--auto-review",
		"--trust",
		"--", "-fix the failing test",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("launch command = %#v, want %#v", got, want)
	}
}

func TestGetLaunchCommandOmitsAutoModel(t *testing.T) {
	p := &Plugin{resolvedBinary: "agent"}
	got, err := p.GetLaunchCommand(context.Background(), agent.LaunchConfig{
		Config:      agent.Config{"model": "auto"},
		Permissions: agent.PermissionModeBypassPermissions,
		Prompt:      "ship it",
	})
	if err != nil {
		t.Fatalf("GetLaunchCommand: %v", err)
	}
	want := []string{"agent", "--force", "--trust", "--", "ship it"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("launch command = %#v, want %#v", got, want)
	}
}

func TestGetLaunchCommandRejectsEmptyConfiguredModel(t *testing.T) {
	p := &Plugin{resolvedBinary: "agent"}
	if _, err := p.GetLaunchCommand(context.Background(), agent.LaunchConfig{
		Config: agent.Config{"model": "   "},
	}); err == nil {
		t.Fatal("GetLaunchCommand accepted an empty configured model")
	}
}

func TestGetRestoreCommandUsesHookSessionIDModelAndPermissions(t *testing.T) {
	p := &Plugin{resolvedBinary: "agent"}
	got, ok, err := p.GetRestoreCommand(context.Background(), agent.RestoreConfig{
		Config:      agent.Config{"model": "kimi-k3-high"},
		Permissions: agent.PermissionModeAuto,
		Session: agent.SessionRef{Metadata: map[string]string{
			"agentSessionId": "cursor-native-1",
		}},
	})
	if err != nil {
		t.Fatalf("GetRestoreCommand: %v", err)
	}
	if !ok {
		t.Fatal("GetRestoreCommand ok = false, want true")
	}
	want := []string{"agent", "--resume", "cursor-native-1", "--model", "kimi-k3-high", "--auto-review"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("restore command = %#v, want %#v", got, want)
	}
}

func TestGetRestoreCommandWithoutHookSessionIDIsUnavailable(t *testing.T) {
	p := &Plugin{resolvedBinary: "agent"}
	got, ok, err := p.GetRestoreCommand(context.Background(), agent.RestoreConfig{})
	if err != nil {
		t.Fatalf("GetRestoreCommand: %v", err)
	}
	if ok || got != nil {
		t.Fatalf("restore = %#v, %v; want nil, false", got, ok)
	}
}

func TestGetForkCommandResumesInTargetWorkspace(t *testing.T) {
	p := &Plugin{resolvedBinary: "agent"}
	model := "claude-opus-4-8[context=1m,effort=high]"
	got, ok, err := p.GetForkCommand(context.Background(), agent.ForkConfig{
		Config:        agent.Config{"model": model},
		Permissions:   agent.PermissionModeBypassPermissions,
		WorkspacePath: "/tmp/cursor-fork",
		Session: agent.SessionRef{Metadata: map[string]string{
			"agentSessionId": "cursor-native-2",
		}},
	})
	if err != nil {
		t.Fatalf("GetForkCommand: %v", err)
	}
	if !ok {
		t.Fatal("GetForkCommand ok = false, want true")
	}
	want := []string{
		"agent", "--resume", "cursor-native-2",
		"--workspace", "/tmp/cursor-fork",
		"--model", model,
		"--force",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("fork command = %#v, want %#v", got, want)
	}
}

func TestGetMetadataCommandsUseTemporaryWorkspace(t *testing.T) {
	p := &Plugin{resolvedBinary: "agent"}
	model := "kimi-k3-high"

	title, err := p.GetSessionTitleCommand(context.Background(), agent.TitleConfig{
		Config: agent.Config{"model": model},
		Prompt: "Implement Cursor support",
	})
	if err != nil {
		t.Fatalf("GetSessionTitleCommand: %v", err)
	}
	wantTitle := []string{
		"agent", "-p", "--output-format", "text",
		"--mode", "ask", "--trust",
		"--model", model,
		"--workspace", os.TempDir(),
		agent.TitleGenerationPrompt("Implement Cursor support"),
	}
	if !reflect.DeepEqual(title, wantTitle) {
		t.Fatalf("title command = %#v, want %#v", title, wantTitle)
	}

	recap, err := p.GetSessionRecapCommand(context.Background(), agent.RecapConfig{
		Config:               agent.Config{"model": "auto"},
		LastAssistantMessage: "Cursor support is complete.",
	})
	if err != nil {
		t.Fatalf("GetSessionRecapCommand: %v", err)
	}
	wantRecap := []string{
		"agent", "-p", "--output-format", "text",
		"--mode", "ask", "--trust",
		"--workspace", os.TempDir(),
		agent.RecapGenerationPrompt("Cursor support is complete."),
	}
	if !reflect.DeepEqual(recap, wantRecap) {
		t.Fatalf("recap command = %#v, want %#v", recap, wantRecap)
	}
}

func TestGetPromptDeliveryStrategyUsesCommand(t *testing.T) {
	p := &Plugin{}
	got, err := p.GetPromptDeliveryStrategy(context.Background(), agent.LaunchConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if got != agent.PromptDeliveryInCommand {
		t.Fatalf("strategy = %q, want %q", got, agent.PromptDeliveryInCommand)
	}
}

func TestGetAgentHooksPreservesUserHooksAndIsIdempotent(t *testing.T) {
	workspace := t.TempDir()
	hooksPath := filepath.Join(workspace, ".cursor", "hooks.json")
	if err := os.MkdirAll(filepath.Dir(hooksPath), 0o755); err != nil {
		t.Fatal(err)
	}
	existing := `{
  "version": 1,
  "userSetting": true,
  "hooks": {
    "stop": [{"command":"my stop hook","type":"command","timeout":5,"failClosed":true,"matcher":"user"}],
    "customEvent": [{"command":"my custom hook","type":"command","timeout":4,"failClosed":false,"matcher":".*"}]
  }
}`
	if err := os.WriteFile(hooksPath, []byte(existing), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv(hookexec.CommandEnv, "yyork")
	p := New()
	cfg := agent.WorkspaceHookConfig{WorkspacePath: workspace}

	if err := p.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatalf("GetAgentHooks: %v", err)
	}
	if err := p.GetAgentHooks(context.Background(), cfg); err != nil {
		t.Fatalf("second GetAgentHooks: %v", err)
	}

	config := readCursorHookConfig(t, hooksPath)
	if config.Version != 1 || !config.UserSetting {
		t.Fatalf("top-level config not preserved: %#v", config)
	}
	wantEvents := []string{
		"sessionStart",
		"beforeSubmitPrompt",
		"preToolUse",
		"postToolUse",
		"postToolUseFailure",
		"afterAgentResponse",
		"stop",
	}
	for _, event := range wantEvents {
		entries := config.Hooks[event]
		managed := 0
		for _, entry := range entries {
			if strings.HasPrefix(entry.Command, "yyork hooks cursor ") {
				managed++
				if entry.Type != "command" || entry.Timeout != 30 || entry.FailClosed || entry.Matcher != "" {
					t.Fatalf("%s managed entry = %#v", event, entry)
				}
			}
		}
		if managed != 1 {
			t.Fatalf("%s managed count = %d, want 1 in %#v", event, managed, entries)
		}
	}
	if _, ok := config.Hooks["beforeShellExecution"]; ok {
		t.Fatal("beforeShellExecution must not be registered")
	}
	if _, ok := config.Hooks["afterAgentThought"]; ok {
		t.Fatal("afterAgentThought must not be registered")
	}
	if got := countCursorCommands(config.Hooks["stop"], "my stop hook"); got != 1 {
		t.Fatalf("user stop hook count = %d, want 1", got)
	}
	if got := countCursorCommands(config.Hooks["customEvent"], "my custom hook"); got != 1 {
		t.Fatalf("custom event hook count = %d, want 1", got)
	}
}

func TestUninstallHooksRemovesOnlyManagedCursorEntries(t *testing.T) {
	workspace := t.TempDir()
	t.Setenv(hookexec.CommandEnv, "yyork")
	p := New()
	if err := p.GetAgentHooks(context.Background(), agent.WorkspaceHookConfig{WorkspacePath: workspace}); err != nil {
		t.Fatalf("GetAgentHooks: %v", err)
	}
	hooksPath := filepath.Join(workspace, ".cursor", "hooks.json")
	config := readCursorHookConfig(t, hooksPath)
	config.Hooks["stop"] = append(config.Hooks["stop"], cursorHookEntry{
		Command:    "my stop hook",
		Type:       "command",
		Timeout:    5,
		FailClosed: true,
		Matcher:    "user",
	})
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(hooksPath, append(data, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}

	installed, err := p.AreHooksInstalled(context.Background(), workspace)
	if err != nil || !installed {
		t.Fatalf("AreHooksInstalled = %v, %v; want true, nil", installed, err)
	}
	if err := p.UninstallHooks(context.Background(), workspace); err != nil {
		t.Fatalf("UninstallHooks: %v", err)
	}
	installed, err = p.AreHooksInstalled(context.Background(), workspace)
	if err != nil || installed {
		t.Fatalf("AreHooksInstalled after uninstall = %v, %v; want false, nil", installed, err)
	}

	config = readCursorHookConfig(t, hooksPath)
	for event, entries := range config.Hooks {
		for _, entry := range entries {
			if strings.Contains(entry.Command, " hooks cursor ") || strings.HasPrefix(entry.Command, "yyork hooks cursor ") {
				t.Fatalf("managed Cursor hook remains under %s: %#v", event, entry)
			}
		}
	}
	if got := countCursorCommands(config.Hooks["stop"], "my stop hook"); got != 1 {
		t.Fatalf("user stop hook count after uninstall = %d, want 1", got)
	}
}

type cursorHookConfigFixture struct {
	Version     int                          `json:"version"`
	UserSetting bool                         `json:"userSetting"`
	Hooks       map[string][]cursorHookEntry `json:"hooks"`
}

func readCursorHookConfig(t *testing.T, path string) cursorHookConfigFixture {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var config cursorHookConfigFixture
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	return config
}

func countCursorCommands(entries []cursorHookEntry, command string) int {
	count := 0
	for _, entry := range entries {
		if entry.Command == command {
			count++
		}
	}
	return count
}
