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

	"github.com/yyopc/yyork/internal/plugin/agent"
	sessionpkg "github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/store"
)

func TestRunMetadataCommandScrubsYYORKSessionID(t *testing.T) {
	t.Setenv("YYORK_METADATA_ENV_PROBE", "1")
	t.Setenv("YYORK_SESSION_ID", "parent-session")

	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := runMetadataCommand(context.Background(), []string{
		executable,
		"-test.run=^TestMetadataCommandEnvironmentProbe$",
	}); err != nil {
		t.Fatalf("metadata subprocess inherited YYORK_SESSION_ID: %v", err)
	}
}

func TestMetadataCommandEnvironmentProbe(t *testing.T) {
	if os.Getenv("YYORK_METADATA_ENV_PROBE") != "1" {
		return
	}
	if os.Getenv("YYORK_SESSION_ID") != "" {
		os.Exit(3)
	}
	os.Exit(0)
}

func TestHookMetadataCommandsReceiveAgentConfig(t *testing.T) {
	ctx := context.Background()
	home := t.TempDir()
	configDir := filepath.Join(home, ".yyork")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(configDir, "config.yaml"), []byte("agents:\n  codex:\n    model: configured-model\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)
	t.Setenv("YYORK_SESSION_ID", "configured-hook-session")
	insertHookTestSession(t, ctx, "configured-hook-session")

	previousBuildTitle := buildHookTitleCommand
	previousRunTitle := runHookTitleCommand
	previousBuildRecap := buildHookRecapCommand
	previousRunRecap := runHookRecapCommand
	var titleConfig agent.TitleConfig
	var recapConfig agent.RecapConfig
	buildHookTitleCommand = func(_ context.Context, _ string, cfg agent.TitleConfig) ([]string, error) {
		titleConfig = cfg
		return []string{"fake-title"}, nil
	}
	runHookTitleCommand = func(context.Context, []string) (string, error) {
		return "Configured title\n", nil
	}
	buildHookRecapCommand = func(_ context.Context, _ string, cfg agent.RecapConfig) ([]string, error) {
		recapConfig = cfg
		return []string{"fake-recap"}, nil
	}
	runHookRecapCommand = func(context.Context, []string) (string, error) {
		return "Configured recap\n", nil
	}
	t.Cleanup(func() {
		buildHookTitleCommand = previousBuildTitle
		runHookTitleCommand = previousRunTitle
		buildHookRecapCommand = previousBuildRecap
		runHookRecapCommand = previousRunRecap
	})

	for event, payload := range map[string]string{
		"user-prompt-submit": `{"prompt":"Configure this session."}`,
		"stop":               `{"last_assistant_message":"Configured."}`,
	} {
		var stdout, stderr bytes.Buffer
		if code := runCodexHook(ctx, event, strings.NewReader(payload), &stdout, &stderr); code != 0 {
			t.Fatalf("%s exit = %d, stderr: %s", event, code, stderr.String())
		}
	}

	if got := titleConfig.Config["model"]; got != "configured-model" {
		t.Fatalf("title config model = %#v, want configured-model", got)
	}
	if got := recapConfig.Config["model"]; got != "configured-model" {
		t.Fatalf("recap config model = %#v, want configured-model", got)
	}
}

func TestRunCodexHookPersistsHookMetadata(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-1"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	stubHookTitleCommand(t, "Generated login redirect title")
	stubHookRecapCommand(t, "Generated callback redirect recap")
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
	if got := row.Metadata[hookMetadataTitle]; got != "Generated login redirect title" {
		t.Fatalf("title = %#v, want generated title", got)
	}
	if got := row.Metadata[hookMetadataRecap]; got != "Generated callback redirect recap" {
		t.Fatalf("recap = %#v, want generated recap", got)
	}
	if got := row.Metadata[hookMetadataLastAssistantMessageAt]; got == "" {
		t.Fatalf("lastAssistantMessageAt not set: %#v", row.Metadata)
	} else if _, err := time.Parse(time.RFC3339Nano, got.(string)); err != nil {
		t.Fatalf("lastAssistantMessageAt = %#v, want RFC3339Nano timestamp: %v", got, err)
	}
	if got := row.Metadata["prompt"]; got != "stored launch prompt" {
		t.Fatalf("prompt metadata = %#v, want preserved launch prompt", got)
	}
}

func TestRunCodexHookPreservesFirstAgentSessionID(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-stable-native-id"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	insertHookTestSession(t, ctx, sessionID)

	runSessionStart := func(agentSessionID string) {
		t.Helper()
		var stdout, stderr bytes.Buffer
		payload := `{"session_id":"` + agentSessionID + `"}`
		code := runCodexHook(ctx, "session-start", strings.NewReader(payload), &stdout, &stderr)
		if code != 0 {
			t.Fatalf("session-start exit = %d, stderr: %s", code, stderr.String())
		}
	}

	runSessionStart("codex-canonical-1")
	runSessionStart("codex-transient-2")

	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataAgentSessionID]; got != "codex-canonical-1" {
		t.Fatalf("agentSessionId = %#v, want first native id", got)
	}
}

func TestRunCodexHookPersistsKanbanActivityMetadata(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-activity"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	stubHookRecapCommand(t, "Generated kanban activity recap")
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
	if got := row.Metadata[hookMetadataRecap]; got != "Generated kanban activity recap" {
		t.Fatalf("recap = %#v", got)
	}
	if got := row.Metadata[hookMetadataLastAssistantMessageAt]; got == "" {
		t.Fatalf("lastAssistantMessageAt not set after stop: %#v", row.Metadata)
	} else if _, err := time.Parse(time.RFC3339Nano, got.(string)); err != nil {
		t.Fatalf("lastAssistantMessageAt = %#v, want RFC3339Nano timestamp: %v", got, err)
	}
}

func TestRunAgentHookIgnoresForeignHookOwner(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-owned-by-codex"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	insertHookTestSessionWithAgent(t, ctx, sessionID, "codex")
	payload := `{"tool_name":"Shell","tool_input":{"command":"echo probe"}}`

	run := func(agentName string) {
		t.Helper()
		var stdout, stderr bytes.Buffer
		code := runAgentHook(ctx, agentName, "pre-tool-use", strings.NewReader(payload), &stdout, &stderr)
		if code != 0 {
			t.Fatalf("%s hook exit = %d, stderr: %s", agentName, code, stderr.String())
		}
		if stdout.String() != "{}\n" {
			t.Fatalf("%s stdout = %q, want empty hook response", agentName, stdout.String())
		}
	}

	run("claude-code")
	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataState]; got != nil {
		t.Fatalf("foreign hook changed state to %#v", got)
	}
	if got := row.Metadata[hookMetadataCurrentTool]; got != nil {
		t.Fatalf("foreign hook changed current tool to %#v", got)
	}

	run("codex")
	row = readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataState]; got != hookStateWorking {
		t.Fatalf("owning hook state = %#v, want working", got)
	}
	if got := row.Metadata[hookMetadataCurrentTool]; got != "Running shell command: echo probe" {
		t.Fatalf("owning hook current tool = %#v, want shell bulletin", got)
	}
}

func TestRunAgentPreToolUseClassifiesHumanInputTools(t *testing.T) {
	tests := []struct {
		name            string
		agentName       string
		payload         string
		wantState       string
		wantCurrentTool string
		wantReason      string
		wantBulletin    string
	}{
		{
			name:         "Codex flat question",
			agentName:    "codex",
			payload:      `{"tool_name":"request_user_input","tool_input":{"question":"Which environment should I deploy to?"}}`,
			wantState:    hookStateTriage,
			wantReason:   "Needs your input: Which environment should I deploy to?",
			wantBulletin: "Needs your input: Which environment should I deploy to?",
		},
		{
			name:         "Codex flat prompt",
			agentName:    "codex",
			payload:      `{"tool_name":"request_user_input","tool_input":{"prompt":"Choose a release channel."}}`,
			wantState:    hookStateTriage,
			wantReason:   "Needs your input: Choose a release channel.",
			wantBulletin: "Needs your input: Choose a release channel.",
		},
		{
			name:         "Claude questions array",
			agentName:    "claude-code",
			payload:      `{"tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Which database should this use?","header":"Database","options":[]}]}}`,
			wantState:    hookStateTriage,
			wantReason:   "Needs your input: Which database should this use?",
			wantBulletin: "Needs your input: Which database should this use?",
		},
		{
			name:         "empty input fallback",
			agentName:    "claude-code",
			payload:      `{"tool_name":"AskUserQuestion","tool_input":{}}`,
			wantState:    hookStateTriage,
			wantReason:   "Waiting for your input.",
			wantBulletin: "Waiting for your input.",
		},
		{
			name:            "unrelated tool stays working",
			agentName:       "codex",
			payload:         `{"tool_name":"bash","tool_input":{"command":"go test ./internal/cli"}}`,
			wantState:       hookStateWorking,
			wantCurrentTool: "Running shell command: go test ./internal/cli",
			wantBulletin:    "Running shell command: go test ./internal/cli",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			sessionID := "ao-session-user-input-" + strings.ReplaceAll(strings.ToLower(tt.name), " ", "-")
			t.Setenv("HOME", t.TempDir())
			t.Setenv("YYORK_SESSION_ID", sessionID)
			insertHookTestSessionWithAgent(t, ctx, sessionID, tt.agentName)

			var stdout, stderr bytes.Buffer
			code := runAgentHook(ctx, tt.agentName, "pre-tool-use", strings.NewReader(tt.payload), &stdout, &stderr)
			if code != 0 {
				t.Fatalf("pre-tool-use exit = %d, stderr: %s", code, stderr.String())
			}

			row := readHookTestSession(t, ctx, sessionID)
			if got := row.Metadata[hookMetadataState]; got != tt.wantState {
				t.Fatalf("state = %#v, want %q", got, tt.wantState)
			}
			if got := row.Metadata[hookMetadataCurrentTool]; got != tt.wantCurrentTool {
				t.Fatalf("currentToolCall = %#v, want %q", got, tt.wantCurrentTool)
			}
			if tt.wantReason != "" {
				if got := row.Metadata[hookMetadataTriageReason]; got != tt.wantReason {
					t.Fatalf("triageReason = %#v, want %q", got, tt.wantReason)
				}
			}
			if got := metadataStrings(row.Metadata[hookMetadataToolBulletins]); len(got) != 1 || got[0] != tt.wantBulletin {
				t.Fatalf("toolCallBulletins = %#v, want first bulletin %q", got, tt.wantBulletin)
			}
		})
	}
}

func TestRunCodexPostToolUseRestoresWorkingAfterHumanInput(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-user-input-complete"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	insertHookTestSession(t, ctx, sessionID)

	runHook := func(event string) {
		t.Helper()
		var stdout, stderr bytes.Buffer
		payload := `{"tool_name":"request_user_input","tool_input":{"question":"Continue?"}}`
		code := runCodexHook(ctx, event, strings.NewReader(payload), &stdout, &stderr)
		if code != 0 {
			t.Fatalf("%s exit = %d, stderr: %s", event, code, stderr.String())
		}
	}

	runHook("pre-tool-use")
	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataState]; got != hookStateTriage {
		t.Fatalf("pre-tool-use state = %#v, want triage", got)
	}

	runHook("post-tool-use")
	row = readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataState]; got != hookStateWorking {
		t.Fatalf("post-tool-use state = %#v, want working", got)
	}
	if got := row.Metadata[hookMetadataCurrentTool]; got != "" {
		t.Fatalf("post-tool-use currentToolCall = %#v, want cleared", got)
	}
}

func TestRunCodexHookAcceptsToolCallEventAliases(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-tool-call-alias"
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

	runHook("pre-tool-call", `{"hook_event_name":"PreToolCall","tool_name":"Bash","tool_input":{"command":"echo yyork-hook-smoke"}}`)
	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataCurrentTool]; got != "Running shell command: echo yyork-hook-smoke" {
		t.Fatalf("pre-tool-call currentToolCall = %#v", got)
	}

	runHook("post-tool-call", `{"hook_event_name":"PostToolCall","tool_name":"Bash","tool_input":{"command":"echo yyork-hook-smoke"}}`)
	row = readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataCurrentTool]; got != "" {
		t.Fatalf("post-tool-call currentToolCall = %#v, want cleared", got)
	}
	if got := metadataStrings(row.Metadata[hookMetadataToolBulletins]); len(got) != 2 || got[0] != "Finished shell command: echo yyork-hook-smoke" {
		t.Fatalf("toolCallBulletins after post-tool-call = %#v", got)
	}
}

func TestRunCodexToolHooksTolerateNonObjectToolInput(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-raw-tool-input"
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

	runHook("pre-tool-use", `{"tool_name":"mcp__probe__raw","tool_input":"raw tool payload"}`)
	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataCurrentTool]; got != "Running mcp__probe__raw." {
		t.Fatalf("currentToolCall = %#v", got)
	}
	if got := metadataStrings(row.Metadata[hookMetadataToolBulletins]); len(got) != 1 || got[0] != "Running mcp__probe__raw." {
		t.Fatalf("toolCallBulletins after pre = %#v", got)
	}

	runHook("post-tool-use", `{"tool_name":"mcp__probe__raw","tool_input":["raw","tool","payload"],"tool_response":{"ok":true}}`)
	row = readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataCurrentTool]; got != "" {
		t.Fatalf("post-tool-use currentToolCall = %#v, want cleared", got)
	}
	if got := metadataStrings(row.Metadata[hookMetadataToolBulletins]); len(got) != 2 || got[0] != "Finished mcp__probe__raw." {
		t.Fatalf("toolCallBulletins after post = %#v", got)
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

func TestTitleFromCommandOutputUsesLastNonEmptyLine(t *testing.T) {
	longTitle := strings.Repeat("x", hookTitleMaxLen+20)
	got := titleFromCommandOutput("debug line\n\n`" + longTitle + "`\n")

	if len(got) != hookTitleMaxLen {
		t.Fatalf("title length = %d, want %d: %q", len(got), hookTitleMaxLen, got)
	}
	if !strings.HasSuffix(got, "...") {
		t.Fatalf("title = %q, want ellipsis after compaction", got)
	}
}

func TestRecapFromCommandOutputUsesLastNonEmptyLine(t *testing.T) {
	longRecap := strings.Repeat("x", hookRecapMaxLen+20)
	got := recapFromCommandOutput("debug line\n\n`" + longRecap + "`\n")

	if len(got) != hookRecapMaxLen {
		t.Fatalf("recap length = %d, want %d: %q", len(got), hookRecapMaxLen, got)
	}
	if !strings.HasSuffix(got, "...") {
		t.Fatalf("recap = %q, want ellipsis after compaction", got)
	}
}

func TestRunClaudeHookPersistsHookMetadata(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-claude-1"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	stubHookTitleCommand(t, "Generated Claude redirect title")
	stubHookRecapCommand(t, "Generated Claude redirect recap")
	insertHookTestSessionWithAgent(t, ctx, sessionID, "claude-code")

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
	if got := row.Metadata[hookMetadataTitle]; got != "Generated Claude redirect title" {
		t.Fatalf("title = %#v, want generated title", got)
	}
	if got := row.Metadata[hookMetadataRecap]; got != "Generated Claude redirect recap" {
		t.Fatalf("recap = %#v, want generated recap", got)
	}
	if got := row.Metadata["prompt"]; got != "stored launch prompt" {
		t.Fatalf("prompt metadata = %#v, want preserved launch prompt", got)
	}
}

func TestRunCursorAssistantResponseUpdatesRecapWithoutChangingState(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-cursor-response"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	stubHookRecapCommand(t, "Generated Cursor response recap")
	insertHookTestSessionWithAgentAndMetadata(t, ctx, sessionID, "cursor", map[string]any{
		"prompt":          "stored launch prompt",
		hookMetadataState: hookStateWorking,
	})

	var stdout, stderr bytes.Buffer
	code := runCursorHook(
		ctx,
		"assistant-response",
		strings.NewReader(`{"text":"Implemented Cursor response hooks."}`),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("assistant-response exit = %d, stderr: %s", code, stderr.String())
	}
	if stdout.String() != "{}\n" {
		t.Fatalf("assistant-response stdout = %q, want empty verdict", stdout.String())
	}

	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataRecap]; got != "Generated Cursor response recap" {
		t.Fatalf("recap = %#v, want generated Cursor recap", got)
	}
	if got := row.Metadata[hookMetadataState]; got != hookStateWorking {
		t.Fatalf("state = %#v, want unchanged working state", got)
	}
}

func TestRunCursorStopChangesStateWithoutGeneratingRecap(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-cursor-stop"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	insertHookTestSessionWithAgentAndMetadata(t, ctx, sessionID, "cursor", map[string]any{
		"prompt":          "stored launch prompt",
		hookMetadataState: hookStateWorking,
		hookMetadataRecap: "Existing response recap",
	})

	var stdout, stderr bytes.Buffer
	code := runCursorHook(ctx, "stop", strings.NewReader(`{"text":"must not be used here"}`), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("stop exit = %d, stderr: %s", code, stderr.String())
	}

	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataState]; got != hookStatePrompt {
		t.Fatalf("state = %#v, want prompt", got)
	}
	if got := row.Metadata[hookMetadataRecap]; got != "Existing response recap" {
		t.Fatalf("recap = %#v, want existing recap preserved", got)
	}
	if got := row.Metadata[hookMetadataLastAssistantMessageAt]; got == "" {
		t.Fatal("stop did not set lastAssistantMessageAt")
	}
}

func TestRunCursorSessionStartReturnsStoredSystemPrompt(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-cursor-context"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	longPrompt := strings.Repeat("Z", hookAdditionalContextMaxChars+5)
	insertHookTestSessionWithAgentAndMetadata(t, ctx, sessionID, "cursor", map[string]any{
		"systemPrompt": longPrompt,
	})

	var stdout, stderr bytes.Buffer
	code := runCursorHook(ctx, "session-start", strings.NewReader(`{"session_id":"cursor-native-context"}`), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("session-start exit = %d, stderr: %s", code, stderr.String())
	}
	var response map[string]string
	if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
		t.Fatalf("decode hook response: %v\n%s", err, stdout.String())
	}
	contextText := response["additional_context"]
	if len([]rune(contextText)) != hookAdditionalContextMaxChars {
		t.Fatalf("additional_context length = %d, want %d", len([]rune(contextText)), hookAdditionalContextMaxChars)
	}
	if !strings.Contains(stderr.String(), "additional_context truncated") {
		t.Fatalf("stderr = %q, want truncation log", stderr.String())
	}
	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataAgentSessionID]; got != "cursor-native-context" {
		t.Fatalf("agentSessionId = %#v, want cursor-native-context", got)
	}
}

func TestRunCursorPreToolUseReturnsApprovalVerdictAndTriage(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-cursor-approval"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	t.Setenv("YYORK_PERMISSION_MODE", string(agent.PermissionModeDefault))
	insertHookTestSessionWithAgent(t, ctx, sessionID, "cursor")

	var stdout, stderr bytes.Buffer
	payload := `{"tool_name":"Shell","tool_input":{"command":"git push origin main"}}`
	code := runCursorHook(ctx, "pre-tool-use", strings.NewReader(payload), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("pre-tool-use exit = %d, stderr: %s", code, stderr.String())
	}
	if stdout.String() != "{\"permission\":\"ask\"}\n" {
		t.Fatalf("pre-tool-use stdout = %q, want ask verdict", stdout.String())
	}
	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataState]; got != hookStateTriage {
		t.Fatalf("state = %#v, want triage", got)
	}
	if got := row.Metadata[hookMetadataTriageReason]; got != "Needs approval for shell command: git push origin main" {
		t.Fatalf("triageReason = %#v", got)
	}

	stdout.Reset()
	stderr.Reset()
	code = runCursorHook(ctx, "post-tool-use", strings.NewReader(payload), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("post-tool-use-failure mapping exit = %d, stderr: %s", code, stderr.String())
	}
	row = readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataState]; got != hookStateWorking {
		t.Fatalf("state after failure mapping = %#v, want working", got)
	}
}

func TestRunCursorPreToolUseDoesNotSynthesizeQuestionTriage(t *testing.T) {
	ctx := context.Background()
	sessionID := "ao-session-cursor-question"
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_SESSION_ID", sessionID)
	t.Setenv("YYORK_PERMISSION_MODE", string(agent.PermissionModeDefault))
	insertHookTestSessionWithAgent(t, ctx, sessionID, "cursor")

	var stdout, stderr bytes.Buffer
	payload := `{"tool_name":"AskQuestion","tool_input":{"questions":[{"prompt":"Which option?"}]}}`
	code := runCursorHook(ctx, "pre-tool-use", strings.NewReader(payload), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("pre-tool-use exit = %d, stderr: %s", code, stderr.String())
	}
	if stdout.String() != "{}\n" {
		t.Fatalf("pre-tool-use stdout = %q, want empty verdict", stdout.String())
	}
	row := readHookTestSession(t, ctx, sessionID)
	if got := row.Metadata[hookMetadataState]; got != hookStateWorking {
		t.Fatalf("state = %#v, want working", got)
	}
	if got := row.Metadata[hookMetadataTriageReason]; got != nil {
		t.Fatalf("triageReason = %#v, want absent", got)
	}
}

func TestRunCursorAcceptEditsOnlyAsksForShellAndMcp(t *testing.T) {
	ctx := context.Background()
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_PERMISSION_MODE", string(agent.PermissionModeAcceptEdits))

	tests := []struct {
		name       string
		tool       string
		wantOutput string
		wantState  string
	}{
		{name: "edit is silent", tool: "Edit", wantOutput: "{}\n", wantState: hookStateWorking},
		{name: "shell asks", tool: "Shell", wantOutput: "{\"permission\":\"ask\"}\n", wantState: hookStateTriage},
		{name: "mcp asks", tool: "Mcp", wantOutput: "{\"permission\":\"ask\"}\n", wantState: hookStateTriage},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sessionID := "ao-cursor-accept-edits-" + strings.ReplaceAll(tt.name, " ", "-")
			t.Setenv("YYORK_SESSION_ID", sessionID)
			insertHookTestSessionWithAgent(t, ctx, sessionID, "cursor")
			var stdout, stderr bytes.Buffer
			payload := `{"tool_name":"` + tt.tool + `","tool_input":{}}`
			code := runCursorHook(ctx, "pre-tool-use", strings.NewReader(payload), &stdout, &stderr)
			if code != 0 {
				t.Fatalf("exit = %d, stderr: %s", code, stderr.String())
			}
			if stdout.String() != tt.wantOutput {
				t.Fatalf("stdout = %q, want %q", stdout.String(), tt.wantOutput)
			}
			row := readHookTestSession(t, ctx, sessionID)
			if got := row.Metadata[hookMetadataState]; got != tt.wantState {
				t.Fatalf("state = %#v, want %s", got, tt.wantState)
			}
		})
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
	fakeMetadataBin := installFakeMetadataBinaries(t)
	t.Setenv("PATH", fakeMetadataBin+string(os.PathListSeparator)+os.Getenv("PATH"))

	ctx := context.Background()
	home := t.TempDir()
	t.Setenv("HOME", home)

	cases := []struct {
		agent          string
		sessionID      string
		agentSessionID string
		prompt         string
		assistantReply string
		title          string
		recap          string
	}{
		{
			agent:          "codex",
			sessionID:      "ao-cli-codex",
			agentSessionID: "codex-native-cli",
			prompt:         "Wire Codex hook metadata into the dashboard.",
			title:          "Generated Codex dashboard title",
			assistantReply: "Codex hook metadata reached the dashboard projection.",
			recap:          "Generated Codex dashboard recap",
		},
		{
			agent:          "claude-code",
			sessionID:      "ao-cli-claude",
			agentSessionID: "claude-native-cli",
			prompt:         "Wire Claude hook metadata into the dashboard.",
			title:          "Generated Claude dashboard title",
			assistantReply: "Claude hook metadata reached the dashboard projection.",
			recap:          "Generated Claude dashboard recap",
		},
	}

	for _, tc := range cases {
		insertHookTestSessionWithAgent(t, ctx, tc.sessionID, tc.agent)
		runHookBinary(t, bin, home, tc.sessionID, tc.agent, "session-start", `{"session_id":"`+tc.agentSessionID+`"}`)
		runHookBinary(t, bin, home, tc.sessionID, tc.agent, "user-prompt-submit", `{"prompt":"`+tc.prompt+`"}`)
		runHookBinary(t, bin, home, tc.sessionID, tc.agent, "stop", `{"last_assistant_message":"`+tc.assistantReply+`"}`)
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

func TestRunHooksInstallCreatesCodexHooks(t *testing.T) {
	dir := t.TempDir()
	hooksPath := filepath.Join(dir, ".codex", "hooks.json")
	if err := os.MkdirAll(filepath.Dir(hooksPath), 0o755); err != nil {
		t.Fatal(err)
	}
	existing := `{"hooks":{"Stop":[{"matcher":null,"hooks":[{"type":"command","command":"my own stop hook","timeout":3}]}]}}`
	if err := os.WriteFile(hooksPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)

	var stdout, stderr bytes.Buffer
	if code := runHooks(context.Background(), []string{"codex", "install"}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit = %d, stderr: %s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "Installed yyork codex hooks") {
		t.Fatalf("stdout = %q, want install message", stdout.String())
	}

	// A second install must replace managed entries without duplicating them.
	stdout.Reset()
	stderr.Reset()
	if code := runHooks(context.Background(), []string{"codex", "install"}, &stdout, &stderr); code != 0 {
		t.Fatalf("second install exit = %d, stderr: %s", code, stderr.String())
	}

	data, err := os.ReadFile(hooksPath)
	if err != nil {
		t.Fatal(err)
	}
	var config testCodexHookFile
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	for _, event := range []string{"SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop"} {
		if got := countHookCommands(config.Hooks[event], " hooks codex "); got != 1 {
			t.Fatalf("%s yyork hook count = %d, want 1 in %#v", event, got, config.Hooks[event])
		}
	}
	if got := countHookCommands(config.Hooks["Stop"], "my own stop hook"); got != 1 {
		t.Fatalf("user Stop hook count = %d, want 1 in %#v", got, config.Hooks["Stop"])
	}

	configData, err := os.ReadFile(filepath.Join(dir, ".codex", "config.toml"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(configData), "hooks = true") {
		t.Fatalf("config.toml missing hooks feature flag: %s", configData)
	}
}

func TestRunHooksInstallCreatesClaudeHooks(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, ".claude", "settings.local.json")
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatal(err)
	}
	existing := `{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"my own stop hook"}]}]}}`
	if err := os.WriteFile(settingsPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)

	var stdout, stderr bytes.Buffer
	if code := runHooks(context.Background(), []string{"claude-code", "install"}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit = %d, stderr: %s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "Installed yyork claude-code hooks") {
		t.Fatalf("stdout = %q, want install message", stdout.String())
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(string(data), " hooks claude-code "); got != 6 {
		t.Fatalf("yyork Claude hook count = %d, want 6 in %s", got, data)
	}
	if !strings.Contains(string(data), "my own stop hook") {
		t.Fatalf("user hook not preserved: %s", data)
	}
}

func TestRunHooksInstallCreatesCursorHooks(t *testing.T) {
	dir := t.TempDir()
	hooksPath := filepath.Join(dir, ".cursor", "hooks.json")
	if err := os.MkdirAll(filepath.Dir(hooksPath), 0o755); err != nil {
		t.Fatal(err)
	}
	existing := `{"version":1,"hooks":{"stop":[{"command":"my own stop hook","type":"command","timeout":3,"failClosed":false,"matcher":""}]}}`
	if err := os.WriteFile(hooksPath, []byte(existing), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)

	var stdout, stderr bytes.Buffer
	if code := runHooks(context.Background(), []string{"cursor", "install"}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit = %d, stderr: %s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "Installed yyork cursor hooks") {
		t.Fatalf("stdout = %q, want install message", stdout.String())
	}
	data, err := os.ReadFile(hooksPath)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(string(data), " hooks cursor "); got != 7 {
		t.Fatalf("yyork Cursor hook count = %d, want 7 in %s", got, data)
	}
	if !strings.Contains(string(data), "my own stop hook") {
		t.Fatalf("user hook not preserved: %s", data)
	}
}

type testCodexHookFile struct {
	Hooks map[string][]testCodexHookGroup `json:"hooks"`
}

type testCodexHookGroup struct {
	Hooks []testCodexHookEntry `json:"hooks"`
}

type testCodexHookEntry struct {
	Command string `json:"command"`
}

func countHookCommands(groups []testCodexHookGroup, needle string) int {
	count := 0
	for _, group := range groups {
		for _, hook := range group.Hooks {
			if strings.Contains(hook.Command, needle) {
				count++
			}
		}
	}
	return count
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

func stubHookTitleCommand(t *testing.T, title string) {
	t.Helper()
	previousBuild := buildHookTitleCommand
	previousRun := runHookTitleCommand
	buildHookTitleCommand = func(context.Context, string, agent.TitleConfig) ([]string, error) {
		return []string{"fake-title-command"}, nil
	}
	runHookTitleCommand = func(context.Context, []string) (string, error) {
		return title + "\n", nil
	}
	t.Cleanup(func() {
		buildHookTitleCommand = previousBuild
		runHookTitleCommand = previousRun
	})
}

func stubHookRecapCommand(t *testing.T, recap string) {
	t.Helper()
	previousBuild := buildHookRecapCommand
	previousRun := runHookRecapCommand
	buildHookRecapCommand = func(context.Context, string, agent.RecapConfig) ([]string, error) {
		return []string{"fake-recap-command"}, nil
	}
	runHookRecapCommand = func(context.Context, []string) (string, error) {
		return recap + "\n", nil
	}
	t.Cleanup(func() {
		buildHookRecapCommand = previousBuild
		runHookRecapCommand = previousRun
	})
}

func installFakeMetadataBinaries(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	script := `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "--ask-for-approval" ]; then
    printf '%s\n' "unexpected argument '--ask-for-approval' found" >&2
    exit 2
  fi
done
prompt="$*"
case "$(basename "$0"):$prompt" in
  codex:*"Generate a concise recap"*) printf '%s\n' "Generated Codex dashboard recap" ;;
  claude:*"Generate a concise recap"*) printf '%s\n' "Generated Claude dashboard recap" ;;
  codex:*) printf '%s\n' "Generated Codex dashboard title" ;;
  claude:*) printf '%s\n' "Generated Claude dashboard title" ;;
  *) exit 1 ;;
esac
`
	for _, name := range []string{"codex", "claude"} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func insertHookTestSessionWithAgent(t *testing.T, ctx context.Context, id string, agent string) {
	t.Helper()
	insertHookTestSessionWithAgentAndMetadata(t, ctx, id, agent, map[string]any{"prompt": "stored launch prompt"})
}

func insertHookTestSessionWithAgentAndMetadata(t *testing.T, ctx context.Context, id string, agent string, metadata map[string]any) {
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
		Metadata:      metadata,
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
