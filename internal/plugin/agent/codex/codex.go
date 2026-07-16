// Package codex implements the Codex agent plugin: launching new sessions,
// resuming hook-tracked sessions, and installing workspace-local hooks.
//
// yyork-managed sessions derive native session identity and display
// metadata from Codex hooks instead of transcript/cache scans.
package codex

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/yyopc/yyork/internal/plugin"
	"github.com/yyopc/yyork/internal/plugin/agent"
	"github.com/yyopc/yyork/internal/utils"
)

const (
	codexAgentSessionIDMetadataKey = "agentSessionId"
	codexNoAltScreenFlag           = "--no-alt-screen"
	codexBypassHookTrustFlag       = "--dangerously-bypass-hook-trust"
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
var _ agent.Forker = (*Plugin)(nil)

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
	cmd = append(cmd, codexNoAltScreenFlag)
	cmd = append(cmd, codexBypassHookTrustFlag)
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

func (p *Plugin) GetSessionTitleCommand(ctx context.Context, cfg agent.TitleConfig) (cmd []string, err error) {
	return p.getSessionMetadataCommand(ctx, agent.TitleGenerationPrompt(cfg.Prompt))
}

func (p *Plugin) GetSessionRecapCommand(ctx context.Context, cfg agent.RecapConfig) (cmd []string, err error) {
	return p.getSessionMetadataCommand(ctx, agent.RecapGenerationPrompt(cfg.LastAssistantMessage))
}

func (p *Plugin) getSessionMetadataCommand(ctx context.Context, prompt string) (cmd []string, err error) {
	binary, err := p.codexBinary(ctx)
	if err != nil {
		return nil, err
	}

	cmd = []string{binary, "exec"}
	appendNoUpdateCheckFlag(&cmd)
	cmd = append(cmd, "-c", `approval_policy="never"`)
	cmd = append(cmd,
		"--skip-git-repo-check",
		"--ephemeral",
		"--ignore-user-config",
		"--ignore-rules",
		"--sandbox", "read-only",
		"--color", "never",
		"--cd", os.TempDir(),
		prompt,
	)
	return cmd, nil
}

// GetRestoreCommand rebuilds the argv that continues an existing Codex
// session from the hook-captured native session id in session metadata.
// ok is false when that id has not landed yet, so callers can fall back
// to fresh launch behavior. We do not scan ~/.codex/sessions transcripts:
// SessionStart hooks already persist the resume id as agentSessionId.
func (p *Plugin) GetRestoreCommand(ctx context.Context, cfg agent.RestoreConfig) (cmd []string, ok bool, err error) {
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	agentSessionID := codexAgentSessionID(cfg.Session)
	if agentSessionID == "" {
		return nil, false, nil
	}

	binary, err := p.codexBinary(ctx)
	if err != nil {
		return nil, false, err
	}

	cmd = []string{binary, "resume"}
	appendNoUpdateCheckFlag(&cmd)
	appendApprovalFlags(&cmd, cfg.Permissions)
	cmd = append(cmd, "--all", codexNoAltScreenFlag)
	cmd = append(cmd, codexBypassHookTrustFlag)
	cmd = append(cmd, agentSessionID)
	return cmd, true, nil
}

// GetForkCommand rebuilds argv for a native Codex conversation fork in a
// yyork-created worktree. Uses the same hook-captured agentSessionId as
// GetRestoreCommand — no transcript scan.
func (p *Plugin) GetForkCommand(ctx context.Context, cfg agent.ForkConfig) (cmd []string, ok bool, err error) {
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	agentSessionID := codexAgentSessionID(cfg.Session)
	if agentSessionID == "" {
		return nil, false, nil
	}
	workspacePath := strings.TrimSpace(cfg.WorkspacePath)
	if workspacePath == "" {
		return nil, false, nil
	}

	binary, err := p.codexBinary(ctx)
	if err != nil {
		return nil, false, err
	}

	cmd = []string{binary, "fork"}
	appendNoUpdateCheckFlag(&cmd)
	appendApprovalFlags(&cmd, cfg.Permissions)
	cmd = append(cmd, "--all", codexNoAltScreenFlag)
	cmd = append(cmd, codexBypassHookTrustFlag)
	if cfg.SystemPromptFile != "" {
		cmd = append(cmd, "-c", "model_instructions_file="+cfg.SystemPromptFile)
	} else if cfg.SystemPrompt != "" {
		cmd = append(cmd, "-c", "developer_instructions="+cfg.SystemPrompt)
	}
	cmd = append(cmd, "-C", workspacePath, agentSessionID)
	if prompt := strings.TrimSpace(cfg.Prompt); prompt != "" {
		cmd = append(cmd, prompt)
	}
	return cmd, true, nil
}

// codexAgentSessionID returns the native Codex session id persisted by the
// SessionStart hook. Empty means restore/fork is not available yet.
func codexAgentSessionID(ref agent.SessionRef) string {
	return strings.TrimSpace(ref.Metadata[codexAgentSessionIDMetadataKey])
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
		// No flag: defer to the user's Codex config/default behavior.
	case agent.PermissionModeAcceptEdits:
		*cmd = append(*cmd, "--ask-for-approval", "on-request")
	case agent.PermissionModeAuto:
		*cmd = append(*cmd, "--ask-for-approval", "on-request", "-c", `approvals_reviewer="auto_review"`)
	case agent.PermissionModeBypassPermissions:
		*cmd = append(*cmd, "--dangerously-bypass-approvals-and-sandbox")
	}
}

func normalizePermissionMode(mode agent.PermissionMode) agent.PermissionMode {
	switch mode {
	case agent.PermissionModeDefault,
		agent.PermissionModeAcceptEdits,
		agent.PermissionModeAuto,
		agent.PermissionModeBypassPermissions:
		return mode
	default:
		return agent.PermissionModeDefault
	}
}
