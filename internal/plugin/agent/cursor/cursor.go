// Package cursor implements the Cursor Agent CLI plugin.
package cursor

import (
	"context"
	"errors"
	"fmt"
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
	pluginID                        = "cursor"
	cursorAgentSessionIDMetadataKey = "agentSessionId"
)

type Plugin struct {
	binaryMu       sync.Mutex
	resolvedBinary string
	modelsOnce     sync.Once
	models         []string
}

func New() *Plugin {
	return &Plugin{}
}

var _ plugin.Plugin = (*Plugin)(nil)
var _ agent.Agent = (*Plugin)(nil)
var _ agent.Forker = (*Plugin)(nil)

func (p *Plugin) Manifest() plugin.Manifest {
	return plugin.Manifest{
		ID:          pluginID,
		Name:        "Cursor",
		Description: "Run Cursor Agent worker sessions.",
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

	p.modelsOnce.Do(func() {
		binary, err := p.cursorBinary(ctx)
		if err != nil {
			return
		}
		output, err := exec.CommandContext(ctx, binary, "--list-models").Output()
		if err != nil {
			return
		}
		p.models = parseCursorModels(string(output))
	})

	models := append([]string(nil), p.models...)
	return agent.ConfigSpec{Fields: []agent.ConfigField{
		{
			Key:         "model",
			Type:        agent.ConfigFieldEnum,
			Description: "Cursor model id (see `agent --list-models`)",
			Default:     "auto",
			Enum:        models,
		},
	}}, nil
}

func parseCursorModels(output string) []string {
	models := make([]string, 0)
	for _, line := range strings.Split(output, "\n") {
		id, _, ok := strings.Cut(line, " - ")
		if !ok {
			continue
		}
		id = strings.TrimSpace(id)
		if id != "" {
			models = append(models, id)
		}
	}
	return models
}

func (p *Plugin) GetLaunchCommand(ctx context.Context, cfg agent.LaunchConfig) ([]string, error) {
	binary, err := p.cursorBinary(ctx)
	if err != nil {
		return nil, err
	}
	model, err := cursorModel(cfg.Config)
	if err != nil {
		return nil, err
	}

	cmd := []string{binary}
	appendCursorModel(&cmd, model)
	appendCursorPermissionFlags(&cmd, cfg.Permissions)
	cmd = append(cmd, "--trust")
	if cfg.Prompt != "" {
		cmd = append(cmd, "--", cfg.Prompt)
	}
	return cmd, nil
}

func (p *Plugin) GetPromptDeliveryStrategy(ctx context.Context, _ agent.LaunchConfig) (agent.PromptDeliveryStrategy, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	return agent.PromptDeliveryInCommand, nil
}

func (p *Plugin) GetSessionTitleCommand(ctx context.Context, cfg agent.TitleConfig) ([]string, error) {
	return p.getSessionMetadataCommand(ctx, cfg.Config, agent.TitleGenerationPrompt(cfg.Prompt))
}

func (p *Plugin) GetSessionRecapCommand(ctx context.Context, cfg agent.RecapConfig) ([]string, error) {
	return p.getSessionMetadataCommand(ctx, cfg.Config, agent.RecapGenerationPrompt(cfg.LastAssistantMessage))
}

func (p *Plugin) getSessionMetadataCommand(ctx context.Context, cfg agent.Config, prompt string) ([]string, error) {
	binary, err := p.cursorBinary(ctx)
	if err != nil {
		return nil, err
	}
	model, err := cursorModel(cfg)
	if err != nil {
		return nil, err
	}

	cmd := []string{binary, "-p", "--output-format", "text", "--mode", "ask", "--trust"}
	appendCursorModel(&cmd, model)
	cmd = append(cmd, "--workspace", os.TempDir(), prompt)
	return cmd, nil
}

func (p *Plugin) GetRestoreCommand(ctx context.Context, cfg agent.RestoreConfig) ([]string, bool, error) {
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	agentSessionID := cursorAgentSessionID(cfg.Session)
	if agentSessionID == "" {
		return nil, false, nil
	}

	binary, err := p.cursorBinary(ctx)
	if err != nil {
		return nil, false, err
	}
	model, err := cursorModel(cfg.Config)
	if err != nil {
		return nil, false, err
	}

	cmd := []string{binary, "--resume", agentSessionID}
	appendCursorModel(&cmd, model)
	appendCursorPermissionFlags(&cmd, cfg.Permissions)
	return cmd, true, nil
}

func (p *Plugin) GetForkCommand(ctx context.Context, cfg agent.ForkConfig) ([]string, bool, error) {
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	agentSessionID := cursorAgentSessionID(cfg.Session)
	workspacePath := strings.TrimSpace(cfg.WorkspacePath)
	if agentSessionID == "" || workspacePath == "" {
		return nil, false, nil
	}

	binary, err := p.cursorBinary(ctx)
	if err != nil {
		return nil, false, err
	}
	model, err := cursorModel(cfg.Config)
	if err != nil {
		return nil, false, err
	}

	cmd := []string{binary, "--resume", agentSessionID, "--workspace", workspacePath}
	appendCursorModel(&cmd, model)
	appendCursorPermissionFlags(&cmd, cfg.Permissions)
	return cmd, true, nil
}

func cursorAgentSessionID(ref agent.SessionRef) string {
	return strings.TrimSpace(ref.Metadata[cursorAgentSessionIDMetadataKey])
}

func cursorModel(cfg agent.Config) (string, error) {
	value, configured := cfg["model"]
	if !configured {
		return "", nil
	}
	model, ok := value.(string)
	if !ok {
		return "", errors.New("cursor model must be a string")
	}
	if strings.TrimSpace(model) == "" {
		return "", errors.New("cursor model must not be empty")
	}
	if model == "auto" {
		return "", nil
	}
	return model, nil
}

func appendCursorModel(cmd *[]string, model string) {
	if model != "" {
		*cmd = append(*cmd, "--model", model)
	}
}

func appendCursorPermissionFlags(cmd *[]string, permissions agent.PermissionMode) {
	switch permissions {
	case agent.PermissionModeAuto:
		*cmd = append(*cmd, "--auto-review")
	case agent.PermissionModeBypassPermissions:
		*cmd = append(*cmd, "--force")
	}
}

// ResolveCursorBinary locates Cursor's CLI, whose executable is named
// "agent". It falls back to that name so launch failures remain explicit.
func ResolveCursorBinary(ctx context.Context) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}

	if runtime.GOOS == "windows" {
		for _, name := range []string{"agent.cmd", "agent.exe", "agent"} {
			if path, err := exec.LookPath(name); err == nil && path != "" {
				return path, nil
			}
			if err := ctx.Err(); err != nil {
				return "", err
			}
		}
		if home, err := os.UserHomeDir(); err == nil {
			for _, candidate := range []string{
				filepath.Join(home, ".local", "bin", "agent.exe"),
				filepath.Join(home, ".local", "bin", "agent.cmd"),
			} {
				if utils.FileExists(candidate) {
					return candidate, nil
				}
			}
		}
		return "agent", nil
	}

	if path, err := exec.LookPath("agent"); err == nil && path != "" {
		return path, nil
	}

	candidates := []string{"/usr/local/bin/agent", "/opt/homebrew/bin/agent"}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates, filepath.Join(home, ".local", "bin", "agent"))
	}
	for _, candidate := range candidates {
		if utils.FileExists(candidate) {
			return candidate, nil
		}
		if err := ctx.Err(); err != nil {
			return "", err
		}
	}
	return "agent", nil
}

func (p *Plugin) cursorBinary(ctx context.Context) (string, error) {
	p.binaryMu.Lock()
	defer p.binaryMu.Unlock()
	if p.resolvedBinary != "" {
		return p.resolvedBinary, nil
	}
	binary, err := ResolveCursorBinary(ctx)
	if err != nil {
		return "", fmt.Errorf("resolve Cursor agent binary: %w", err)
	}
	p.resolvedBinary = binary
	return binary, nil
}
