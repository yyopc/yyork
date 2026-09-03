package cursor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/yyopc/yyork/internal/plugin/agent"
	"github.com/yyopc/yyork/internal/plugin/agent/hookexec"
)

const (
	cursorHooksDirName  = ".cursor"
	cursorHooksFileName = "hooks.json"
	cursorHookTimeout   = 30

	cursorLegacyHookCommandPrefix = "yyork hooks cursor "
	cursorHookCommandInfix        = " hooks cursor "
)

type cursorHookEntry struct {
	Command    string `json:"command"`
	Type       string `json:"type"`
	Timeout    int    `json:"timeout"`
	FailClosed bool   `json:"failClosed"`
	Matcher    string `json:"matcher"`
}

type cursorHookSpec struct {
	Event     string
	HookEvent string
}

var cursorManagedHooks = []cursorHookSpec{
	{Event: "sessionStart", HookEvent: "session-start"},
	{Event: "beforeSubmitPrompt", HookEvent: "user-prompt-submit"},
	{Event: "preToolUse", HookEvent: "pre-tool-use"},
	{Event: "postToolUse", HookEvent: "post-tool-use"},
	{Event: "postToolUseFailure", HookEvent: "post-tool-use"},
	{Event: "afterAgentResponse", HookEvent: "assistant-response"},
	{Event: "stop", HookEvent: "stop"},
}

func (p *Plugin) GetAgentHooks(ctx context.Context, cfg agent.WorkspaceHookConfig) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if strings.TrimSpace(cfg.WorkspacePath) == "" {
		return errors.New("cursor.GetAgentHooks: WorkspacePath is required")
	}

	hooksPath := cursorHooksPath(cfg.WorkspacePath)
	topLevel, rawHooks, err := readCursorHooks(hooksPath)
	if err != nil {
		return fmt.Errorf("cursor.GetAgentHooks: %w", err)
	}

	for _, spec := range cursorManagedHooks {
		entries, err := parseCursorHookEntries(rawHooks, spec.Event)
		if err != nil {
			return fmt.Errorf("cursor.GetAgentHooks: %w", err)
		}
		entries = removeCursorManagedHooks(entries)
		entries = append(entries, cursorHookEntry{
			Command:    cursorHookCommand(spec.HookEvent),
			Type:       "command",
			Timeout:    cursorHookTimeout,
			FailClosed: false,
			Matcher:    "",
		})
		if err := marshalCursorHookEntries(rawHooks, spec.Event, entries); err != nil {
			return fmt.Errorf("cursor.GetAgentHooks: %w", err)
		}
	}

	if err := writeCursorHooks(hooksPath, topLevel, rawHooks); err != nil {
		return fmt.Errorf("cursor.GetAgentHooks: %w", err)
	}
	return nil
}

func (p *Plugin) UninstallHooks(ctx context.Context, workspacePath string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if strings.TrimSpace(workspacePath) == "" {
		return errors.New("cursor.UninstallHooks: workspacePath is required")
	}

	hooksPath := cursorHooksPath(workspacePath)
	if _, err := os.Stat(hooksPath); errors.Is(err, os.ErrNotExist) {
		return nil
	}
	topLevel, rawHooks, err := readCursorHooks(hooksPath)
	if err != nil {
		return fmt.Errorf("cursor.UninstallHooks: %w", err)
	}

	for event := range rawHooks {
		entries, err := parseCursorHookEntries(rawHooks, event)
		if err != nil {
			return fmt.Errorf("cursor.UninstallHooks: %w", err)
		}
		if err := marshalCursorHookEntries(rawHooks, event, removeCursorManagedHooks(entries)); err != nil {
			return fmt.Errorf("cursor.UninstallHooks: %w", err)
		}
	}
	if err := writeCursorHooks(hooksPath, topLevel, rawHooks); err != nil {
		return fmt.Errorf("cursor.UninstallHooks: %w", err)
	}
	return nil
}

func (p *Plugin) AreHooksInstalled(ctx context.Context, workspacePath string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	if strings.TrimSpace(workspacePath) == "" {
		return false, errors.New("cursor.AreHooksInstalled: workspacePath is required")
	}

	hooksPath := cursorHooksPath(workspacePath)
	if _, err := os.Stat(hooksPath); errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	_, rawHooks, err := readCursorHooks(hooksPath)
	if err != nil {
		return false, fmt.Errorf("cursor.AreHooksInstalled: %w", err)
	}
	for event := range rawHooks {
		entries, err := parseCursorHookEntries(rawHooks, event)
		if err != nil {
			return false, fmt.Errorf("cursor.AreHooksInstalled: %w", err)
		}
		for _, entry := range entries {
			if isCursorManagedHook(entry.Command) {
				return true, nil
			}
		}
	}
	return false, nil
}

func cursorHooksPath(workspacePath string) string {
	return filepath.Join(workspacePath, cursorHooksDirName, cursorHooksFileName)
}

func readCursorHooks(hooksPath string) (map[string]json.RawMessage, map[string]json.RawMessage, error) {
	topLevel := map[string]json.RawMessage{}
	rawHooks := map[string]json.RawMessage{}
	data, err := os.ReadFile(hooksPath)
	if errors.Is(err, os.ErrNotExist) {
		return topLevel, rawHooks, nil
	}
	if err != nil {
		return nil, nil, fmt.Errorf("read %s: %w", hooksPath, err)
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return topLevel, rawHooks, nil
	}
	if err := json.Unmarshal(data, &topLevel); err != nil {
		return nil, nil, fmt.Errorf("parse %s: %w", hooksPath, err)
	}
	if hooksRaw, ok := topLevel["hooks"]; ok {
		if err := json.Unmarshal(hooksRaw, &rawHooks); err != nil {
			return nil, nil, fmt.Errorf("parse hooks in %s: %w", hooksPath, err)
		}
	}
	return topLevel, rawHooks, nil
}

func writeCursorHooks(hooksPath string, topLevel, rawHooks map[string]json.RawMessage) error {
	version, err := json.Marshal(1)
	if err != nil {
		return err
	}
	topLevel["version"] = version
	hooksJSON, err := json.Marshal(rawHooks)
	if err != nil {
		return fmt.Errorf("encode hooks: %w", err)
	}
	topLevel["hooks"] = hooksJSON

	if err := os.MkdirAll(filepath.Dir(hooksPath), 0o750); err != nil {
		return fmt.Errorf("create hook dir: %w", err)
	}
	data, err := json.MarshalIndent(topLevel, "", "  ")
	if err != nil {
		return fmt.Errorf("encode %s: %w", hooksPath, err)
	}
	if err := os.WriteFile(hooksPath, append(data, '\n'), 0o600); err != nil {
		return fmt.Errorf("write %s: %w", hooksPath, err)
	}
	return nil
}

func parseCursorHookEntries(rawHooks map[string]json.RawMessage, event string) ([]cursorHookEntry, error) {
	raw, ok := rawHooks[event]
	if !ok || len(raw) == 0 {
		return nil, nil
	}
	var entries []cursorHookEntry
	if err := json.Unmarshal(raw, &entries); err != nil {
		return nil, fmt.Errorf("parse %s hooks: %w", event, err)
	}
	return entries, nil
}

func marshalCursorHookEntries(rawHooks map[string]json.RawMessage, event string, entries []cursorHookEntry) error {
	if len(entries) == 0 {
		delete(rawHooks, event)
		return nil
	}
	data, err := json.Marshal(entries)
	if err != nil {
		return fmt.Errorf("encode %s hooks: %w", event, err)
	}
	rawHooks[event] = data
	return nil
}

func removeCursorManagedHooks(entries []cursorHookEntry) []cursorHookEntry {
	kept := make([]cursorHookEntry, 0, len(entries))
	for _, entry := range entries {
		if !isCursorManagedHook(entry.Command) {
			kept = append(kept, entry)
		}
	}
	return kept
}

func isCursorManagedHook(command string) bool {
	return strings.HasPrefix(command, cursorLegacyHookCommandPrefix) ||
		strings.Contains(command, cursorHookCommandInfix)
}

func cursorHookCommand(event string) string {
	return hookexec.Executable() + " hooks cursor " + event
}
