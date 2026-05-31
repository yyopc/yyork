// Package claudecode implements the Claude Code agent plugin.
//
// Like the codex plugin, this is a pure command builder in v1: it produces
// the argv to launch `claude` as an interactive session inside a session's
// worktree. SessionInfo, GetRestoreCommand, and GetAgentHooks are no-ops —
// resume and hook capture are deferred to a later slice.
//
// Claude Code starts an interactive session by default (no -p/--print), which
// is exactly what better-ao wants: a live agent the user can attach to in the
// browser terminal or via `zellij attach`. The initial task prompt is passed
// as the positional argument; the orchestrator system prompt (if any) is
// appended to Claude's default system prompt so its built-in coding
// instructions are preserved.
package claudecode

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/yyovil/better-ao/internal/plugin"
	"github.com/yyovil/better-ao/internal/plugin/agent"
	"github.com/yyovil/better-ao/internal/utils"
)

const (
	// pluginID is the registry id and the value users pass to
	// `better-ao spawn --agent`.
	pluginID = "claude-code"

	// claudeSessionUUIDMetadataKey is where we'd persist Claude Code's
	// native session UUID for resume. Unused in v1 (no capture, no
	// resume); defined so the future hook slice adopts a stable name.
	claudeSessionUUIDMetadataKey = "claudeSessionUuid"
)

type Plugin struct {
	binaryMu       sync.Mutex
	resolvedBinary string
}

func New() *Plugin {
	return &Plugin{}
}

var _ plugin.Plugin = (*Plugin)(nil)
var _ agent.Agent = (*Plugin)(nil)

func (p *Plugin) Manifest() plugin.Manifest {
	return plugin.Manifest{
		ID:          pluginID,
		Name:        "Claude Code",
		Description: "Run Claude Code worker sessions.",
		Version:     "0.0.1",
		Capabilities: []plugin.Capability{
			plugin.CapabilityAgent,
		},
	}
}

func (p *Plugin) GetConfigSpec(ctx context.Context) (agent.ConfigSpec, error) {
	if err := ctx.Err(); err != nil {
		return agent.ConfigSpec{}, err
	}
	return agent.ConfigSpec{}, nil
}

// GetLaunchCommand builds the argv to start an interactive Claude Code
// session. Shape:
//
//	claude [--permission-mode <mode>] \
//	       [--append-system-prompt <system prompt>] \
//	       [-- <prompt>]
//
// <mode> is acceptEdits, auto, or bypassPermissions. better-ao's "default"
// mode emits no --permission-mode flag, so Claude's TUI resolves the starting
// mode from ~/.claude/settings.json exactly as a normal launch.
//
// The prompt is passed after `--` so a prompt beginning with "-" is not
// mistaken for a flag.
func (p *Plugin) GetLaunchCommand(ctx context.Context, cfg agent.LaunchConfig) (cmd []string, err error) {
	binary, err := p.claudeBinary(ctx)
	if err != nil {
		return nil, err
	}

	cmd = []string{binary}
	appendPermissionFlags(&cmd, cfg.Permissions)

	systemPrompt, err := resolveSystemPrompt(cfg)
	if err != nil {
		return nil, err
	}
	if systemPrompt != "" {
		// Append rather than replace: Claude Code's default system prompt
		// carries its tool-use and coding instructions, which we want to
		// keep. The orchestrator prompt layers on top.
		cmd = append(cmd, "--append-system-prompt", systemPrompt)
	}

	if cfg.Prompt != "" {
		cmd = append(cmd, "--", cfg.Prompt)
	}

	return cmd, nil
}

func (p *Plugin) GetPromptDeliveryStrategy(ctx context.Context, cfg agent.LaunchConfig) (agent.PromptDeliveryStrategy, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	return agent.PromptDeliveryInCommand, nil
}

// PreLaunch is an optional capability the spawn engine invokes (via type
// assertion) immediately before creating the session. Claude Code shows a
// blocking "do you trust this folder?" dialog the first time it runs in any
// directory. Every better-ao worktree is a fresh path, so without this the
// agent would hang at that prompt with no one to answer it.
//
// A better-ao worktree is derived from the repo the user is already running
// better-ao in, so it is inherently trusted. PreLaunch records that trust in
// ~/.claude.json before launch, additively and atomically, so it cannot
// clobber a concurrently-running Claude instance's config.
func (p *Plugin) PreLaunch(ctx context.Context, cfg agent.LaunchConfig) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if cfg.WorkspacePath == "" {
		return nil
	}
	cfgPath, err := claudeConfigPath()
	if err != nil {
		return err
	}
	return ensureWorkspaceTrusted(cfgPath, cfg.WorkspacePath)
}

// GetAgentHooks is a no-op in v1 (hook infrastructure is dormant; the engine
// never calls this). When hooks land, this installs Claude Code's
// workspace-local hooks under .claude/.
func (p *Plugin) GetAgentHooks(ctx context.Context, cfg agent.WorkspaceHookConfig) error {
	return ctx.Err()
}

// GetRestoreCommand is a no-op in v1. When resume lands, this returns
// `claude --resume <uuid>` built from cfg.Session.Metadata.
func (p *Plugin) GetRestoreCommand(ctx context.Context, cfg agent.RestoreConfig) (cmd []string, ok bool, err error) {
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	return nil, false, nil
}

// SessionInfo is a no-op in v1. Claude Code's native session UUID and
// transcript are not surfaced through better-ao yet.
func (p *Plugin) SessionInfo(ctx context.Context, session agent.SessionRef) (agent.SessionInfo, bool, error) {
	if err := ctx.Err(); err != nil {
		return agent.SessionInfo{}, false, err
	}
	return agent.SessionInfo{}, false, nil
}

// resolveSystemPrompt returns the system prompt text to append, preferring
// SystemPromptFile (read from disk) over an inline SystemPrompt.
func resolveSystemPrompt(cfg agent.LaunchConfig) (string, error) {
	if cfg.SystemPromptFile != "" {
		data, err := os.ReadFile(cfg.SystemPromptFile)
		if err != nil {
			return "", fmt.Errorf("claude-code: read system prompt file: %w", err)
		}
		return strings.TrimRight(string(data), "\n"), nil
	}
	return cfg.SystemPrompt, nil
}

// appendPermissionFlags maps better-ao's permission modes onto Claude Code's
// --permission-mode values:
//   - default            → no flag. Claude's TUI resolves the starting mode
//     from ~/.claude/settings.json (defaultMode), exactly as a normal launch.
//   - accept-edits       → --permission-mode acceptEdits (auto-accept edits +
//     safe filesystem bash; still prompts for network/system bash, MCP, web)
//   - auto               → --permission-mode auto (classifier-gated
//     auto-approval; auto-runs what a safety model deems safe)
//   - bypass-permissions → --permission-mode bypassPermissions (skip all
//     checks; equivalent to --dangerously-skip-permissions)
//
// Empty/unrecognized normalizes to default, so no flag is emitted.
func appendPermissionFlags(cmd *[]string, permissions agent.PermissionMode) {
	switch normalizePermissionMode(permissions) {
	case agent.PermissionModeDefault:
		// No flag: defer to the user's settings.json defaultMode.
	case agent.PermissionModeAcceptEdits:
		*cmd = append(*cmd, "--permission-mode", "acceptEdits")
	case agent.PermissionModeAuto:
		*cmd = append(*cmd, "--permission-mode", "auto")
	case agent.PermissionModeBypassPermissions:
		*cmd = append(*cmd, "--permission-mode", "bypassPermissions")
	}
}

func normalizePermissionMode(mode agent.PermissionMode) agent.PermissionMode {
	switch mode {
	case agent.PermissionModeDefault,
		agent.PermissionModeAcceptEdits,
		agent.PermissionModeAuto,
		agent.PermissionModeBypassPermissions:
		return mode
	// Back-compat aliases for the pre-redesign vocabulary.
	case agent.PermissionModeAutoReview:
		return agent.PermissionModeAcceptEdits
	case agent.PermissionModeFullAccess, "skip", "yolo", "permissionless", "full":
		return agent.PermissionModeBypassPermissions
	default:
		// Empty or unrecognized: defer to settings.json (no flag).
		return agent.PermissionModeDefault
	}
}

// ResolveClaudeBinary finds the `claude` binary, searching PATH then a few
// well-known install locations (the native installer's ~/.local/bin, npm
// global, Homebrew). Returns "claude" as a last resort so callers get a
// clear "command not found" rather than an empty argv.
func ResolveClaudeBinary(ctx context.Context) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}

	if runtime.GOOS == "windows" {
		for _, name := range []string{"claude.cmd", "claude.exe", "claude"} {
			if path, err := exec.LookPath(name); err == nil && path != "" {
				return path, nil
			}
		}
		candidates := []string{}
		if appData := os.Getenv("APPDATA"); appData != "" {
			candidates = append(candidates,
				filepath.Join(appData, "npm", "claude.cmd"),
				filepath.Join(appData, "npm", "claude.exe"),
			)
		}
		for _, candidate := range candidates {
			if utils.FileExists(candidate) {
				return candidate, nil
			}
		}
		return "claude", nil
	}

	if path, err := exec.LookPath("claude"); err == nil && path != "" {
		return path, nil
	}

	candidates := []string{
		"/usr/local/bin/claude",
		"/opt/homebrew/bin/claude",
	}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates,
			filepath.Join(home, ".local", "bin", "claude"),
			filepath.Join(home, ".npm", "bin", "claude"),
			filepath.Join(home, ".claude", "local", "claude"),
		)
	}
	for _, candidate := range candidates {
		if utils.FileExists(candidate) {
			return candidate, nil
		}
		if err := ctx.Err(); err != nil {
			return "", err
		}
	}

	return "claude", nil
}

func (p *Plugin) claudeBinary(ctx context.Context) (string, error) {
	p.binaryMu.Lock()
	defer p.binaryMu.Unlock()

	if p.resolvedBinary != "" {
		return p.resolvedBinary, nil
	}

	binary, err := ResolveClaudeBinary(ctx)
	if err != nil {
		return "", err
	}
	p.resolvedBinary = binary
	return binary, nil
}

// claudeConfigPath returns the path to Claude Code's global config file,
// ~/.claude.json.
func claudeConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("claude-code: resolve home directory: %w", err)
	}
	return filepath.Join(home, ".claude.json"), nil
}

// ensureWorkspaceTrusted records workspacePath as trusted in Claude Code's
// config so the interactive trust dialog does not block a spawned session.
//
// It is additive and concurrency-safe: it reads the existing config, sets
// only projects[workspacePath].hasTrustDialogAccepted = true (preserving the
// rest of the entry and every other project), and writes back via a
// temp-file + atomic rename. If the path is already trusted, it makes no
// write at all. A missing config file is treated as an empty one.
func ensureWorkspaceTrusted(configPath, workspacePath string) error {
	root := map[string]any{}
	data, err := os.ReadFile(configPath)
	switch {
	case err == nil:
		if len(data) > 0 {
			if err := json.Unmarshal(data, &root); err != nil {
				return fmt.Errorf("claude-code: parse %s: %w", configPath, err)
			}
		}
	case os.IsNotExist(err):
		// Treat as empty config; we'll create it.
	default:
		return fmt.Errorf("claude-code: read %s: %w", configPath, err)
	}

	projects, _ := root["projects"].(map[string]any)
	if projects == nil {
		projects = map[string]any{}
		root["projects"] = projects
	}

	entry, _ := projects[workspacePath].(map[string]any)
	if entry == nil {
		entry = map[string]any{}
		projects[workspacePath] = entry
	}

	if trusted, ok := entry["hasTrustDialogAccepted"].(bool); ok && trusted {
		// Already trusted — no write needed, so no race window at all.
		return nil
	}
	entry["hasTrustDialogAccepted"] = true

	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return fmt.Errorf("claude-code: encode %s: %w", configPath, err)
	}

	// Atomic write: temp file in the same directory, then rename. Matches
	// how Claude Code itself updates this file, so concurrent updates are
	// last-writer-wins rather than corrupting.
	dir := filepath.Dir(configPath)
	tmp, err := os.CreateTemp(dir, ".claude.json.tmp-*")
	if err != nil {
		return fmt.Errorf("claude-code: create temp config: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op once renamed

	if _, err := tmp.Write(out); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("claude-code: write temp config: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("claude-code: close temp config: %w", err)
	}
	if err := os.Rename(tmpName, configPath); err != nil {
		return fmt.Errorf("claude-code: replace config: %w", err)
	}
	return nil
}
