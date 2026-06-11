package agent

import (
	"context"

	"github.com/yyopc/yyork/internal/config"
)

// Agent defines the behavior every CLI coding agent plugin must provide.
type Agent interface {
	// GetConfigSpec describes the agent-specific config keys yyork can
	// expose to users in ~/.yyork/config.yaml.
	GetConfigSpec(ctx context.Context) (ConfigSpec, error)

	// GetLaunchCommand builds the command yyork should run to start this agent.
	GetLaunchCommand(ctx context.Context, cfg LaunchConfig) (cmd []string, err error)

	// GetPromptDeliveryStrategy tells yyork whether the prompt is included in
	// the launch command or must be sent after the agent process starts.
	GetPromptDeliveryStrategy(ctx context.Context, cfg LaunchConfig) (PromptDeliveryStrategy, error)

	// GetAgentHooks installs or merges yyork hooks into the agent's
	// native workspace-local hook config. It must preserve user-defined hooks.
	GetAgentHooks(ctx context.Context, cfg WorkspaceHookConfig) error

	// GetRestoreCommand builds a command that continues an existing native agent
	// session. ok=false means no existing native session can be continued.
	GetRestoreCommand(ctx context.Context, cfg RestoreConfig) (cmd []string, ok bool, err error)

	// SessionInfo reads agent-owned session metadata such as native session id,
	// display title, or recap. ok=false means no info is available.
	SessionInfo(ctx context.Context, session SessionRef) (info SessionInfo, ok bool, err error)
}

// Config contains values loaded from the selected agent's section in
// ~/.yyork/config.yaml. Agent plugins own validation for their custom keys.
type Config = config.AgentConfig

// ConfigSpec describes the agent-specific config keys yyork can expose to
// users in ~/.yyork/config.yaml.
type ConfigSpec struct {
	Fields []ConfigField
}

// ConfigField describes one user-facing agent config key.
type ConfigField struct {
	Key         string
	Type        ConfigFieldType
	Description string
	Required    bool
	Default     any
	Enum        []string
}

// ConfigFieldType is the primitive value kind yyork expects for a field.
type ConfigFieldType string

const (
	ConfigFieldString     ConfigFieldType = "string"
	ConfigFieldBool       ConfigFieldType = "bool"
	ConfigFieldNumber     ConfigFieldType = "number"
	ConfigFieldStringList ConfigFieldType = "string_list"
	ConfigFieldEnum       ConfigFieldType = "enum"
)

// LaunchConfig carries inputs needed to build a new agent launch command.
type LaunchConfig struct {
	Config           Config
	IssueID          string
	Permissions      PermissionMode
	Prompt           string
	SessionID        string
	SystemPrompt     string
	SystemPromptFile string
	WorkspacePath    string
}

// WorkspaceHookConfig carries inputs needed to install workspace-local agent hooks.
type WorkspaceHookConfig struct {
	Config        Config
	DataDir       string
	SessionID     string
	WorkspacePath string
}

// RestoreConfig carries inputs needed to continue an existing native agent session.
type RestoreConfig struct {
	Config      Config
	Permissions PermissionMode
	Session     SessionRef
}

// SessionRef identifies a yyork session whose agent-owned metadata may be read.
type SessionRef struct {
	ID            string
	Metadata      map[string]string
	WorkspacePath string
}

// SessionInfo contains agent-owned session metadata.
type SessionInfo struct {
	AgentSessionID string
	Metadata       map[string]string
	Title          string
	Recap          string
}

// PermissionMode controls how much review an agent requires before acting.
type PermissionMode string

const (
	// "default" is special: plugins emit no flag for it so the agent resolves
	// its starting mode from the user's own config (e.g. Claude's TUI reading
	// ~/.claude/settings.json defaultMode).
	PermissionModeDefault           PermissionMode = "default"
	PermissionModeAcceptEdits       PermissionMode = "accept-edits"
	PermissionModeAuto              PermissionMode = "auto"
	PermissionModeBypassPermissions PermissionMode = "bypass-permissions"
)

// PromptDeliveryStrategy describes how yyork should deliver the initial prompt.
type PromptDeliveryStrategy string

const (
	PromptDeliveryInCommand  PromptDeliveryStrategy = "in_command"
	PromptDeliveryAfterStart PromptDeliveryStrategy = "after_start"
)
