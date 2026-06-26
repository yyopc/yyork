package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/yyopc/yyork/internal/control"
	"github.com/yyopc/yyork/internal/events"
	"github.com/yyopc/yyork/internal/plugin/agent"
	"github.com/yyopc/yyork/internal/plugin/agent/claudecode"
	"github.com/yyopc/yyork/internal/plugin/agent/codex"
	"github.com/yyopc/yyork/internal/store"
)

const (
	hookMetadataAgentSessionID         = "agentSessionId"
	hookMetadataTitle                  = "title"
	hookMetadataRecap                  = "recap"
	hookMetadataState                  = "state"
	hookMetadataLastActivityAt         = "lastActivityAt"
	hookMetadataLastAssistantMessageAt = "lastAssistantMessageAt"
	hookMetadataCurrentTool            = "currentToolCall"
	hookMetadataToolBulletins          = "toolCallBulletins"
	hookMetadataTriageReason           = "triageReason"

	hookStateWorking = "working"
	hookStatePrompt  = "prompt"
	hookStateTriage  = "triage"

	hookTitleMaxLen        = 60
	hookRecapMaxLen        = 240
	hookToolBulletinMaxLen = 160
	hookToolBulletinCount  = 3

	hookMetadataCommandTimeout = 20 * time.Second
	hookMetadataOutputMaxBytes = 32 << 10
)

var buildHookTitleCommand = defaultHookTitleCommand
var runHookTitleCommand = runMetadataCommand
var buildHookRecapCommand = defaultHookRecapCommand
var runHookRecapCommand = runMetadataCommand

func runHooks(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer) int {
	if len(args) != 2 {
		fmt.Fprintln(stderr, "hooks: expected `yyork hooks <codex|claude-code> <session-start|user-prompt-submit|pre-tool-use|post-tool-use|permission-request|stop|uninstall>`")
		return 1
	}
	agentName, sub := args[0], args[1]
	if sub == "uninstall" {
		return runUninstallHooks(ctx, agentName, stdout, stderr)
	}
	switch agentName {
	case "codex":
		return runCodexHook(ctx, sub, os.Stdin, stdout, stderr)
	case "claude-code":
		return runClaudeHook(ctx, sub, os.Stdin, stdout, stderr)
	default:
		fmt.Fprintf(stderr, "hooks: unknown agent %q (want codex|claude-code)\n", agentName)
		return 1
	}
}

// hookManager is the subset of an agent plugin the uninstall command needs. It
// is defined at the consumer (mirroring the engine's preLauncher capability)
// rather than on the frozen agent.Agent interface.
type hookManager interface {
	UninstallHooks(ctx context.Context, workspacePath string) error
	AreHooksInstalled(ctx context.Context, workspacePath string) (bool, error)
}

// runUninstallHooks removes the selected agent's yyork hooks from the
// current working directory's workspace-local hook config.
func runUninstallHooks(ctx context.Context, agentName string, stdout io.Writer, stderr io.Writer) int {
	var manager hookManager
	switch agentName {
	case "codex":
		manager = codex.New()
	case "claude-code":
		manager = claudecode.New()
	default:
		fmt.Fprintf(stderr, "hooks: unknown agent %q (want codex|claude-code)\n", agentName)
		return 1
	}

	workspace, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(stderr, "hooks %s uninstall: resolve workspace: %v\n", agentName, err)
		return 1
	}

	installed, err := manager.AreHooksInstalled(ctx, workspace)
	if err != nil {
		fmt.Fprintf(stderr, "hooks %s uninstall: %v\n", agentName, err)
		return 1
	}
	if err := manager.UninstallHooks(ctx, workspace); err != nil {
		fmt.Fprintf(stderr, "hooks %s uninstall: %v\n", agentName, err)
		return 1
	}

	if installed {
		fmt.Fprintf(stdout, "Removed yyork %s hooks from %s\n", agentName, workspace)
	} else {
		fmt.Fprintf(stdout, "No yyork %s hooks found in %s\n", agentName, workspace)
	}
	return 0
}

func runCodexHook(ctx context.Context, event string, stdin io.Reader, stdout io.Writer, stderr io.Writer) int {
	return runAgentHook(ctx, "codex", event, stdin, stdout, stderr)
}

func runClaudeHook(ctx context.Context, event string, stdin io.Reader, stdout io.Writer, stderr io.Writer) int {
	return runAgentHook(ctx, "claude-code", event, stdin, stdout, stderr)
}

// runAgentHook is the shared hook driver for every agent: it reads
// YYORK_SESSION_ID, parses the payload, merges any normalized session
// metadata into the yyork store, and publishes session.updated. It always writes
// the empty `{}` hook response and exits 0 when run outside a yyork session or
// when the row is missing, so a hook firing in a non-yyork `claude`/`codex`
// session is a harmless no-op. agentName is used only for diagnostics.
func runAgentHook(ctx context.Context, agentName, event string, stdin io.Reader, stdout io.Writer, stderr io.Writer) int {
	if err := ctx.Err(); err != nil {
		fmt.Fprintf(stderr, "hooks %s %s: %v\n", agentName, event, err)
		return 1
	}

	aoSessionID := strings.TrimSpace(os.Getenv("YYORK_SESSION_ID"))
	if aoSessionID == "" {
		writeHookResponse(stdout)
		return 0
	}

	raw, err := io.ReadAll(io.LimitReader(stdin, 1<<20))
	if err != nil {
		fmt.Fprintf(stderr, "hooks %s %s: read payload: %v\n", agentName, event, err)
		return 1
	}

	dbPath, err := store.DefaultPath()
	if err != nil {
		fmt.Fprintf(stderr, "hooks %s %s: %v\n", agentName, event, err)
		return 1
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		fmt.Fprintf(stderr, "hooks %s %s: open store: %v\n", agentName, event, err)
		return 1
	}
	defer func() { _ = dataStore.Close() }()

	repo := dataStore.Sessions()
	fields, err := hookFields(ctx, repo, agentName, aoSessionID, event, raw)
	if errors.Is(err, store.ErrSessionNotFound) {
		writeHookResponse(stdout)
		return 0
	}
	if err != nil {
		fmt.Fprintf(stderr, "hooks %s %s: %v\n", agentName, event, err)
		return 1
	}

	if len(fields) > 0 {
		if err := repo.MergeMetadata(ctx, aoSessionID, fields); errors.Is(err, store.ErrSessionNotFound) {
			writeHookResponse(stdout)
			return 0
		} else if err != nil {
			fmt.Fprintf(stderr, "hooks %s %s: merge metadata: %v\n", agentName, event, err)
			return 1
		}
		control.NewForwardingPublisher().Publish(events.NewSessionUpdated(aoSessionID))
	}

	writeHookResponse(stdout)
	return 0
}

// hookPayload projects the fields yyork reads from a hook's stdin JSON.
// Codex and Claude Code expose these under identical names (session_id, prompt,
// last_assistant_message — the latter verified present in Claude's Stop payload
// despite older docs omitting it), so one shape serves both. Agent-specific
// extras are ignored.
type hookPayload struct {
	HookEventName        string        `json:"hook_event_name"`
	SessionID            string        `json:"session_id"`
	Prompt               string        `json:"prompt"`
	LastAssistantMessage *string       `json:"last_assistant_message"`
	ToolInput            hookToolInput `json:"tool_input"`
	ToolName             string        `json:"tool_name"`
}

type hookToolInput map[string]any

func (h *hookToolInput) UnmarshalJSON(raw []byte) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		*h = nil
		return nil
	}

	var object map[string]any
	if err := json.Unmarshal(trimmed, &object); err == nil {
		*h = hookToolInput(object)
		return nil
	}

	var value any
	if err := json.Unmarshal(trimmed, &value); err != nil {
		return err
	}
	*h = nil
	return nil
}

// hookFields computes the normalized session-metadata fields to merge for one
// hook event: agentSessionId at session start, title from the first user
// prompt, activity bulletins from tool hooks, triage reason from permission
// prompts, and recap from the latest assistant message at stop. Returning
// store.ErrSessionNotFound makes the driver no-op cleanly.
func hookFields(ctx context.Context, repo store.SessionRepo, agentName, aoSessionID, event string, raw []byte) (map[string]any, error) {
	var payload hookPayload
	if err := unmarshalHookPayload(raw, &payload); err != nil {
		return nil, fmt.Errorf("decode payload: %w", err)
	}

	fields := hookActivityFields(hookStateWorking)
	switch event {
	case "session-start":
		if sessionID := strings.TrimSpace(payload.SessionID); sessionID != "" {
			fields[hookMetadataAgentSessionID] = sessionID
		}
	case "user-prompt-submit":
		title, err := titleFields(ctx, repo, agentName, aoSessionID, payload.Prompt)
		if err != nil {
			return nil, err
		}
		for key, value := range title {
			fields[key] = value
		}
		fields[hookMetadataCurrentTool] = ""
		fields[hookMetadataToolBulletins] = []string{}
	case "pre-tool-use":
		return toolCallFields(ctx, repo, aoSessionID, payload, "Running", true)
	case "post-tool-use":
		return toolCallFields(ctx, repo, aoSessionID, payload, "Finished", false)
	case "permission-request":
		return permissionRequestFields(ctx, repo, aoSessionID, payload)
	case "stop":
		fields = hookActivityFields(hookStatePrompt)
		if lastActivityAt, ok := fields[hookMetadataLastActivityAt].(string); ok && lastActivityAt != "" {
			fields[hookMetadataLastAssistantMessageAt] = lastActivityAt
		}
		fields[hookMetadataCurrentTool] = ""
		if payload.LastAssistantMessage == nil {
			return fields, nil
		}
		recap, err := recapFields(ctx, repo, agentName, aoSessionID, *payload.LastAssistantMessage)
		if err != nil {
			return nil, err
		}
		for key, value := range recap {
			fields[key] = value
		}
	default:
		return nil, fmt.Errorf("unknown hook event %q", event)
	}
	return fields, nil
}

func hookActivityFields(state string) map[string]any {
	return map[string]any{
		hookMetadataState:          state,
		hookMetadataLastActivityAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
}

func toolCallFields(ctx context.Context, repo store.SessionRepo, aoSessionID string, payload hookPayload, action string, current bool) (map[string]any, error) {
	row, err := repo.Get(ctx, aoSessionID)
	if err != nil {
		return nil, err
	}

	bulletin := summarizeToolCall(action, payload.ToolName, payload.ToolInput)
	fields := hookActivityFields(hookStateWorking)
	if current {
		fields[hookMetadataCurrentTool] = bulletin
	} else {
		fields[hookMetadataCurrentTool] = ""
	}
	fields[hookMetadataToolBulletins] = prependToolBulletin(
		stringSliceMetadata(row.Metadata, hookMetadataToolBulletins),
		bulletin,
	)
	return fields, nil
}

func permissionRequestFields(ctx context.Context, repo store.SessionRepo, aoSessionID string, payload hookPayload) (map[string]any, error) {
	row, err := repo.Get(ctx, aoSessionID)
	if err != nil {
		return nil, err
	}

	toolSummary := summarizeToolCall("Needs approval for", payload.ToolName, payload.ToolInput)
	reason := compactHookText(toolSummary, hookToolBulletinMaxLen)
	fields := hookActivityFields(hookStateTriage)
	fields[hookMetadataCurrentTool] = ""
	fields[hookMetadataTriageReason] = reason
	fields[hookMetadataToolBulletins] = prependToolBulletin(
		stringSliceMetadata(row.Metadata, hookMetadataToolBulletins),
		reason,
	)
	return fields, nil
}

// titleFields sets the title from the first user prompt by asking the selected
// agent plugin to generate a concise title. Later prompts don't retitle it.
func titleFields(ctx context.Context, repo store.SessionRepo, agentName, aoSessionID, prompt string) (map[string]any, error) {
	fields := map[string]any{}
	if strings.TrimSpace(prompt) == "" {
		return fields, nil
	}
	row, err := repo.Get(ctx, aoSessionID)
	if err != nil {
		return nil, err
	}
	if stringMetadata(row.Metadata, hookMetadataTitle) != "" {
		return fields, nil
	}

	title, ok := generatedSessionTitle(ctx, agentName, row, prompt)
	if ok {
		fields[hookMetadataTitle] = title
	}
	return fields, nil
}

// recapFields refreshes the recap at each completed assistant turn by asking
// the selected agent plugin to summarize the latest assistant message.
func recapFields(ctx context.Context, repo store.SessionRepo, agentName, aoSessionID, lastAssistantMessage string) (map[string]any, error) {
	fields := map[string]any{}
	if strings.TrimSpace(lastAssistantMessage) == "" {
		return fields, nil
	}
	row, err := repo.Get(ctx, aoSessionID)
	if err != nil {
		return nil, err
	}

	recap, ok := generatedSessionRecap(ctx, agentName, row, lastAssistantMessage)
	if ok {
		fields[hookMetadataRecap] = recap
	}
	return fields, nil
}

func generatedSessionTitle(ctx context.Context, agentName string, row store.Session, prompt string) (string, bool) {
	cmd, err := buildHookTitleCommand(ctx, agentName, agent.TitleConfig{
		Prompt:        prompt,
		SessionID:     row.ID,
		WorkspacePath: row.WorkspacePath,
	})
	if err != nil || len(cmd) == 0 {
		return "", false
	}

	output, err := runHookTitleCommand(ctx, cmd)
	if err != nil {
		return "", false
	}
	title := titleFromCommandOutput(output)
	if title == "" {
		return "", false
	}
	return title, true
}

func generatedSessionRecap(ctx context.Context, agentName string, row store.Session, lastAssistantMessage string) (string, bool) {
	cmd, err := buildHookRecapCommand(ctx, agentName, agent.RecapConfig{
		LastAssistantMessage: lastAssistantMessage,
		SessionID:            row.ID,
		WorkspacePath:        row.WorkspacePath,
	})
	if err != nil || len(cmd) == 0 {
		return "", false
	}

	output, err := runHookRecapCommand(ctx, cmd)
	if err != nil {
		return "", false
	}
	recap := recapFromCommandOutput(output)
	if recap == "" {
		return "", false
	}
	return recap, true
}

func defaultHookTitleCommand(ctx context.Context, agentName string, cfg agent.TitleConfig) ([]string, error) {
	switch agentName {
	case "codex":
		return codex.New().GetSessionTitleCommand(ctx, cfg)
	case "claude-code":
		return claudecode.New().GetSessionTitleCommand(ctx, cfg)
	default:
		return nil, fmt.Errorf("unknown agent %q", agentName)
	}
}

func defaultHookRecapCommand(ctx context.Context, agentName string, cfg agent.RecapConfig) ([]string, error) {
	switch agentName {
	case "codex":
		return codex.New().GetSessionRecapCommand(ctx, cfg)
	case "claude-code":
		return claudecode.New().GetSessionRecapCommand(ctx, cfg)
	default:
		return nil, fmt.Errorf("unknown agent %q", agentName)
	}
}

func runMetadataCommand(ctx context.Context, cmd []string) (string, error) {
	if len(cmd) == 0 {
		return "", errors.New("empty metadata command")
	}

	runCtx, cancel := context.WithTimeout(ctx, hookMetadataCommandTimeout)
	defer cancel()

	command := exec.CommandContext(runCtx, cmd[0], cmd[1:]...)
	var stdout limitedBuffer
	var stderr limitedBuffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		return "", fmt.Errorf("run metadata command: %w: %s", err, stderr.String())
	}
	return stdout.String(), nil
}

func titleFromCommandOutput(output string) string {
	return metadataTextFromCommandOutput(output, hookTitleMaxLen)
}

func recapFromCommandOutput(output string) string {
	return metadataTextFromCommandOutput(output, hookRecapMaxLen)
}

func metadataTextFromCommandOutput(output string, maxLen int) string {
	lines := strings.Split(output, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		text := cleanGeneratedMetadataLine(lines[i])
		if text != "" {
			return compactHookText(text, maxLen)
		}
	}
	return ""
}

func cleanGeneratedMetadataLine(text string) string {
	text = strings.TrimSpace(text)
	text = strings.TrimPrefix(text, "-")
	text = strings.TrimPrefix(text, "•")
	text = strings.TrimSpace(text)
	text = strings.Trim(text, `"'`+"`")
	return strings.TrimSpace(text)
}

// unmarshalHookPayload decodes a hook payload, tolerating an empty body (a hook
// invoked with no stdin leaves the zero-valued payload).
func unmarshalHookPayload(raw []byte, v any) error {
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil
	}
	return json.Unmarshal(raw, v)
}

func compactHookText(text string, maxLen int) string {
	compact := strings.Join(strings.Fields(text), " ")
	if maxLen <= 0 || len(compact) <= maxLen {
		return compact
	}
	if maxLen <= 3 {
		return compact[:maxLen]
	}
	return strings.TrimSpace(compact[:maxLen-3]) + "..."
}

type limitedBuffer struct {
	buf bytes.Buffer
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	remaining := hookMetadataOutputMaxBytes - b.buf.Len()
	if remaining > 0 {
		if len(p) > remaining {
			_, _ = b.buf.Write(p[:remaining])
		} else {
			_, _ = b.buf.Write(p)
		}
	}
	return len(p), nil
}

func (b *limitedBuffer) String() string {
	return b.buf.String()
}

func summarizeToolCall(action string, toolName string, input hookToolInput) string {
	tool := compactHookText(toolName, 48)
	if tool == "" {
		return action + " agent tool."
	}

	lowerTool := strings.ToLower(tool)
	switch lowerTool {
	case "bash", "shell", "exec_command":
		if command := metadataInputString(input, "command", "cmd"); command != "" {
			return compactHookText(action+" shell command: "+command, hookToolBulletinMaxLen)
		}
		return action + " shell command."
	case "read":
		if path := metadataInputString(input, "file_path", "path", "filename"); path != "" {
			return compactHookText(action+" file read: "+path, hookToolBulletinMaxLen)
		}
	case "write", "edit", "multiedit", "applypatch", "apply_patch":
		if path := metadataInputString(input, "file_path", "path", "filename"); path != "" {
			return compactHookText(action+" file edit: "+path, hookToolBulletinMaxLen)
		}
		return action + " file edit."
	case "grep", "glob":
		if pattern := metadataInputString(input, "pattern", "query", "path"); pattern != "" {
			return compactHookText(action+" search: "+pattern, hookToolBulletinMaxLen)
		}
		return action + " search."
	case "webfetch", "web_fetch":
		if url := metadataInputString(input, "url"); url != "" {
			return compactHookText(action+" web fetch: "+url, hookToolBulletinMaxLen)
		}
	case "websearch", "web_search":
		if query := metadataInputString(input, "query", "q"); query != "" {
			return compactHookText(action+" web search: "+query, hookToolBulletinMaxLen)
		}
	case "todowrite", "todo_write":
		return action + " task checklist."
	}

	return compactHookText(action+" "+tool+".", hookToolBulletinMaxLen)
}

func metadataInputString(input hookToolInput, keys ...string) string {
	for _, key := range keys {
		value, ok := input[key]
		if !ok {
			continue
		}
		if text, ok := value.(string); ok {
			if compact := compactHookText(text, hookToolBulletinMaxLen); compact != "" {
				return compact
			}
		}
	}
	return ""
}

func stringSliceMetadata(metadata map[string]any, key string) []string {
	value, ok := metadata[key]
	if !ok {
		return nil
	}
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			text, ok := item.(string)
			if !ok {
				continue
			}
			if compact := compactHookText(text, hookToolBulletinMaxLen); compact != "" {
				out = append(out, compact)
			}
		}
		return out
	default:
		return nil
	}
}

func prependToolBulletin(existing []string, bulletin string) []string {
	bulletin = compactHookText(bulletin, hookToolBulletinMaxLen)
	if bulletin == "" {
		return existing
	}

	out := []string{bulletin}
	for _, item := range existing {
		item = compactHookText(item, hookToolBulletinMaxLen)
		if item == "" || item == bulletin {
			continue
		}
		out = append(out, item)
		if len(out) >= hookToolBulletinCount {
			break
		}
	}
	return out
}

func stringMetadata(metadata map[string]any, key string) string {
	if value, ok := metadata[key].(string); ok {
		return value
	}
	return ""
}

func writeHookResponse(stdout io.Writer) {
	fmt.Fprintln(stdout, "{}")
}
