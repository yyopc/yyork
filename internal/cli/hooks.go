package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/yyopc/yyork/internal/control"
	"github.com/yyopc/yyork/internal/events"
	"github.com/yyopc/yyork/internal/plugin/agent/claudecode"
	"github.com/yyopc/yyork/internal/plugin/agent/codex"
	"github.com/yyopc/yyork/internal/store"
)

const (
	hookMetadataAgentSessionID = "agentSessionId"
	hookMetadataTitle          = "title"
	hookMetadataRecap          = "recap"

	hookTitleMaxLen = 120
	hookRecapMaxLen = 500
)

func runHooks(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer) int {
	if len(args) != 2 {
		fmt.Fprintln(stderr, "hooks: expected `yyork hooks <codex|claude-code> <session-start|user-prompt-submit|stop|uninstall>`")
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
	fields, err := hookFields(ctx, repo, aoSessionID, event, raw)
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
	HookEventName        string  `json:"hook_event_name"`
	SessionID            string  `json:"session_id"`
	Prompt               string  `json:"prompt"`
	LastAssistantMessage *string `json:"last_assistant_message"`
}

// hookFields computes the normalized session-metadata fields to merge for one
// hook event: agentSessionId at session start, title from the first user
// prompt, and recap from the latest assistant message at stop. Returning
// store.ErrSessionNotFound makes the driver no-op cleanly.
func hookFields(ctx context.Context, repo store.SessionRepo, aoSessionID, event string, raw []byte) (map[string]any, error) {
	var payload hookPayload
	if err := unmarshalHookPayload(raw, &payload); err != nil {
		return nil, fmt.Errorf("decode payload: %w", err)
	}

	fields := map[string]any{}
	switch event {
	case "session-start":
		if sessionID := strings.TrimSpace(payload.SessionID); sessionID != "" {
			fields[hookMetadataAgentSessionID] = sessionID
		}
	case "user-prompt-submit":
		return titleFields(ctx, repo, aoSessionID, payload.Prompt)
	case "stop":
		if payload.LastAssistantMessage == nil {
			return fields, nil
		}
		if recap := compactHookText(*payload.LastAssistantMessage, hookRecapMaxLen); recap != "" {
			fields[hookMetadataRecap] = recap
		}
	default:
		return nil, fmt.Errorf("unknown hook event %q", event)
	}
	return fields, nil
}

// titleFields sets the title from the user prompt, but only the first time (the
// first user prompt titles the session; later prompts don't retitle it).
func titleFields(ctx context.Context, repo store.SessionRepo, aoSessionID, prompt string) (map[string]any, error) {
	fields := map[string]any{}
	title := compactHookText(prompt, hookTitleMaxLen)
	if title == "" {
		return fields, nil
	}
	row, err := repo.Get(ctx, aoSessionID)
	if err != nil {
		return nil, err
	}
	if stringMetadata(row.Metadata, hookMetadataTitle) == "" {
		fields[hookMetadataTitle] = title
	}
	return fields, nil
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

func stringMetadata(metadata map[string]any, key string) string {
	if value, ok := metadata[key].(string); ok {
		return value
	}
	return ""
}

func writeHookResponse(stdout io.Writer) {
	fmt.Fprintln(stdout, "{}")
}
