// Package codex implements the Codex agent plugin: launching new sessions
// and (eventually) resuming existing ones.
//
// In v1, this plugin is a pure command builder. SessionInfo and
// GetRestoreCommand are no-ops; resume is deferred to a future slice.
// The ~300 lines of code that previously scanned ~/.codex/sessions/ to
// discover Codex's native thread id have been removed — they existed only
// to support restore, which isn't wired today. When the resume slice lands,
// thread-id discovery will return via a `ListResumableThreads()` method
// rather than the implicit file-scan-on-restore pattern.
package codex

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/yyovil/better-ao/internal/plugin"
	"github.com/yyovil/better-ao/internal/plugin/agent"
	"github.com/yyovil/better-ao/internal/utils"
)

const (
	// codexThreadIDMetadataKey is the key under which we'd persist Codex's
	// native thread id in a session's metadata blob. Unused in v1 (no
	// capture, no resume) but kept defined so the future hook slice can
	// adopt it without choosing a new name.
	codexThreadIDMetadataKey = "codexThreadId"
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
		ID:          "codex",
		Name:        "Codex",
		Description: "Run Codex worker sessions.",
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

func (p *Plugin) GetLaunchCommand(ctx context.Context, cfg agent.LaunchConfig) (cmd []string, err error) {
	binary, err := p.codexBinary(ctx)
	if err != nil {
		return nil, err
	}

	cmd = []string{binary}
	appendNoUpdateCheckFlag(&cmd)
	appendApprovalFlags(&cmd, cfg.Permissions)

	if cfg.SystemPromptFile != "" {
		cmd = append(cmd, "-c", "model_instructions_file="+cfg.SystemPromptFile)
	} else if cfg.SystemPrompt != "" {
		cmd = append(cmd, "-c", "developer_instructions="+cfg.SystemPrompt)
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

// GetAgentHooks is a no-op in v1. Hook infrastructure is dormant — the
// engine doesn't call this method during spawn. When hooks land in a
// future slice, this is where Codex would install its workspace-local
// hook config.
func (p *Plugin) GetAgentHooks(ctx context.Context, cfg agent.WorkspaceHookConfig) error {
	return ctx.Err()
}

// GetRestoreCommand is a no-op in v1. Resume is out of scope; the engine
// never calls this. When the resume slice lands, this returns the argv to
// continue an existing Codex thread referenced by cfg.Session.Metadata.
func (p *Plugin) GetRestoreCommand(ctx context.Context, cfg agent.RestoreConfig) (cmd []string, ok bool, err error) {
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	return nil, false, nil
}

// SessionInfo is a no-op in v1. Codex's native thread id, transcript path,
// and summary are not surfaced through better-ao yet. The future hook
// slice will populate session metadata with the thread id directly,
// removing any need to discover it via file scanning.
func (p *Plugin) SessionInfo(ctx context.Context, session agent.SessionRef) (agent.SessionInfo, bool, error) {
	if err := ctx.Err(); err != nil {
		return agent.SessionInfo{}, false, err
	}
	return agent.SessionInfo{}, false, nil
}

// ResolveCodexBinary returns the path to the codex binary on this machine,
// searching PATH then a handful of well-known install locations
// (Homebrew, Cargo, npm global). Returns "codex" as a last-ditch fallback
// so callers see a clear "command not found" rather than an empty argv.
func ResolveCodexBinary(ctx context.Context) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}

	if runtime.GOOS == "windows" {
		for _, name := range []string{"codex.cmd", "codex.exe", "codex"} {
			path, err := exec.LookPath(name)
			if err == nil && path != "" {
				return path, nil
			}
			if err := ctx.Err(); err != nil {
				return "", err
			}
		}

		candidates := []string{}
		if appData := os.Getenv("APPDATA"); appData != "" {
			candidates = append(candidates,
				filepath.Join(appData, "npm", "codex.cmd"),
				filepath.Join(appData, "npm", "codex.exe"),
			)
		}
		if home, err := os.UserHomeDir(); err == nil {
			candidates = append(candidates, filepath.Join(home, ".cargo", "bin", "codex.exe"))
		}
		for _, candidate := range candidates {
			if utils.FileExists(candidate) {
				return candidate, nil
			}
			if err := ctx.Err(); err != nil {
				return "", err
			}
		}

		return "codex", nil
	}

	if path, err := exec.LookPath("codex"); err == nil && path != "" {
		return path, nil
	}

	candidates := []string{
		"/usr/local/bin/codex",
		"/opt/homebrew/bin/codex",
	}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates,
			filepath.Join(home, ".cargo", "bin", "codex"),
			filepath.Join(home, ".npm", "bin", "codex"),
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

	return "codex", nil
}

func (p *Plugin) codexBinary(ctx context.Context) (string, error) {
	p.binaryMu.Lock()
	defer p.binaryMu.Unlock()

	if p.resolvedBinary != "" {
		return p.resolvedBinary, nil
	}

	binary, err := ResolveCodexBinary(ctx)
	if err != nil {
		return "", err
	}
	p.resolvedBinary = binary
	return binary, nil
}

func appendNoUpdateCheckFlag(cmd *[]string) {
	*cmd = append(*cmd, "-c", "check_for_update_on_startup=false")
}

func appendApprovalFlags(cmd *[]string, permissions agent.PermissionMode) {
	switch normalizePermissionMode(permissions) {
	case agent.PermissionModeDefault:
		*cmd = append(*cmd, "--ask-for-approval", "on-request")
	case agent.PermissionModeAutoReview:
		*cmd = append(*cmd, "--ask-for-approval", "on-request", "-c", `approvals_reviewer="auto_review"`)
	case agent.PermissionModeFullAccess:
		*cmd = append(*cmd, "--ask-for-approval", "never")
	}
}

func normalizePermissionMode(mode agent.PermissionMode) agent.PermissionMode {
	switch mode {
	case "":
		return ""
	case "auto":
		return agent.PermissionModeDefault
	case "skip", "yolo", "permissionless", "full":
		return agent.PermissionModeFullAccess
	case agent.PermissionModeDefault, agent.PermissionModeAutoReview, agent.PermissionModeFullAccess:
		return mode
	default:
		return ""
	}
}
