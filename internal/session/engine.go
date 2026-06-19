package session

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/yyopc/yyork/internal/events"
	"github.com/yyopc/yyork/internal/plugin"
	"github.com/yyopc/yyork/internal/plugin/agent"
	"github.com/yyopc/yyork/internal/store"
	"github.com/yyopc/yyork/internal/worktree"
)

// CreateOpts describes a durability-provider session the engine wants to
// spawn. Owned here, in the caller's package, so the durability-provider
// package does not need to import its caller for this spec — that keeps
// the dependency graph going one direction.
type CreateOpts struct {
	// Name is the durability-provider session name. In yyork this is
	// the yyork session id (a ULID), so the same string is the row's
	// primary key, the zellij session name, and the directory leaf for the
	// per-session worktree.
	Name string

	// LaunchCmd is the agent's argv as returned by Agent.GetLaunchCommand.
	// The durability provider wraps it with a keep-alive shell so the pane
	// survives agent exit.
	LaunchCmd []string

	// Cwd is the working directory of the initial pane — typically the
	// session's worktree path.
	Cwd string

	// Env are extra environment variables for the agent process. Merged on
	// top of the engine's environment by the durability provider.
	Env map[string]string
}

// DurabilityProvider is the interface the spawn engine needs from a
// session multiplexer. *durabilityprovider.ZellijProvider satisfies it.
// Tests substitute a fake.
type DurabilityProvider interface {
	CreateSession(ctx context.Context, opts CreateOpts) error
	KillSession(ctx context.Context, name string) error
	SessionExists(ctx context.Context, name string) (bool, error)
	ListSessionNames(ctx context.Context) ([]string, error)
}

// preLauncher is an optional capability an agent plugin may implement. When
// present, the engine calls PreLaunch after the worktree is created but
// before the durability session starts — the moment for agent-specific
// setup that must happen in/around the workspace (e.g. Claude Code
// pre-seeding workspace trust). Agents without this need (codex) simply
// don't implement it; the engine's type assertion skips them.
type preLauncher interface {
	PreLaunch(ctx context.Context, cfg agent.LaunchConfig) error
}

// EngineConfig configures a new Engine.
type EngineConfig struct {
	// Repo is the session repository the engine writes to. Required.
	Repo store.SessionRepo

	// Worktree manages per-session git worktrees. Required.
	Worktree worktree.Module

	// Provider runs sessions in the durability layer (Zellij). Required.
	Provider DurabilityProvider

	// Plugins is the registered plugin set. The engine looks up the agent
	// plugin named in each SpawnRequest. Required.
	Plugins *plugin.Registry

	// Bus receives session.created and session.terminated events. Required.
	// Typed as the events.Publisher interface so the server can pass the
	// in-process *events.Bus while the CLI passes a forwarding publisher that
	// relays events to a running server.
	Bus events.Publisher

	// WorktreeBase is the directory under which per-session worktrees live.
	// Defaults to ~/.yyork/worktrees if empty.
	WorktreeBase string

	// DefaultAgent is used when SpawnRequest.AgentPlugin is empty.
	// Defaults to "codex".
	DefaultAgent string

	// DefaultPermissions is the agent approval mode used when
	// SpawnRequest.Permissions is empty. Defaults to "bypass-permissions"
	// (the only mode that truly runs unattended). This is the engine-level
	// fallback; once the user-facing setting lands (web dashboard / CLI /
	// ~/.yyork/config.toml), the config loader populates this field.
	DefaultPermissions agent.PermissionMode

	// now is injected by tests; defaults to time.Now.
	now func() time.Time

	// newID is injected by tests; defaults to a short random id generator.
	newID func() string
}

// Engine is the spawn engine. It orchestrates the per-session pipeline:
// worktree creation, agent launch via the durability provider, persistence
// to the store, and lifecycle event publication. Operations are
// transactional — a failure anywhere in Spawn leaves no partial state.
type Engine struct {
	repo               store.SessionRepo
	worktree           worktree.Module
	provider           DurabilityProvider
	plugins            *plugin.Registry
	bus                events.Publisher
	worktreeBase       string
	defaultAgent       string
	defaultPermissions agent.PermissionMode
	now                func() time.Time
	newID              func() string
}

// NewEngine constructs an Engine from the given config. Missing required
// collaborators are reported as an error rather than panicking later.
func NewEngine(cfg EngineConfig) (*Engine, error) {
	if cfg.Repo == nil {
		return nil, errors.New("session.NewEngine: Repo is required")
	}
	if cfg.Worktree == nil {
		return nil, errors.New("session.NewEngine: Worktree is required")
	}
	if cfg.Provider == nil {
		return nil, errors.New("session.NewEngine: Provider is required")
	}
	if cfg.Plugins == nil {
		return nil, errors.New("session.NewEngine: Plugins is required")
	}
	if cfg.Bus == nil {
		return nil, errors.New("session.NewEngine: Bus is required")
	}

	base := cfg.WorktreeBase
	if base == "" {
		def, err := worktree.DefaultBase()
		if err != nil {
			return nil, fmt.Errorf("session.NewEngine: default worktree base: %w", err)
		}
		base = def
	}

	defaultAgent := cfg.DefaultAgent
	if defaultAgent == "" {
		defaultAgent = "codex"
	}

	defaultPermissions := cfg.DefaultPermissions
	if defaultPermissions == "" {
		defaultPermissions = agent.PermissionModeBypassPermissions
	}

	now := cfg.now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	newID := cfg.newID
	if newID == nil {
		newID = defaultNewID
	}

	return &Engine{
		repo:               cfg.Repo,
		worktree:           cfg.Worktree,
		provider:           cfg.Provider,
		plugins:            cfg.Plugins,
		bus:                cfg.Bus,
		worktreeBase:       base,
		defaultAgent:       defaultAgent,
		defaultPermissions: defaultPermissions,
		now:                now,
		newID:              newID,
	}, nil
}

// SpawnRequest carries everything the engine needs to spawn a new session.
type SpawnRequest struct {
	// ProjectPath is the absolute path of the user's project. The session's
	// worktree forks off the project's repo. Required.
	ProjectPath string

	// AgentPlugin selects which registered agent plugin runs. Defaults to
	// the Engine's DefaultAgent when empty.
	AgentPlugin string

	// Prompt is the initial prompt passed to the agent (translates to the
	// agent's `--`/positional argument in most plugins).
	Prompt string

	// Kind distinguishes worker sessions from project orchestrators. Empty
	// defaults to worker.
	Kind Kind

	// WorkspaceMode controls where worker sessions run. Empty uses the worker
	// workspace default. Orchestrator sessions always run in the main project
	// worktree regardless of this field.
	WorkspaceMode WorkerWorkspaceMode

	// SystemPrompt is inline system/developer instruction text. Optional.
	SystemPrompt string

	// SystemPromptFile is the path to a file containing the orchestrator
	// agent's system prompt. Optional.
	SystemPromptFile string

	// Permissions sets the agent's approval mode. Optional; when empty the
	// engine falls back to its DefaultPermissions ("bypass-permissions").
	Permissions agent.PermissionMode
}

// Spawn brings up a new session: creates a git worktree, asks the agent
// plugin for its launch command, installs agent hooks, persists the session
// row, and hands the launch command to the durability provider.
//
// Errors at any stage roll back partial state — no row is left behind, no
// worktree is left behind, no zellij session is left running. The session
// row is INSERTed before the durability provider starts the agent so native
// startup hooks can merge metadata into an existing row.
func (e *Engine) Spawn(ctx context.Context, req SpawnRequest) (store.Session, error) {
	if strings.TrimSpace(req.ProjectPath) == "" {
		return store.Session{}, errors.New("session.Spawn: ProjectPath is required")
	}
	if !filepath.IsAbs(req.ProjectPath) {
		return store.Session{}, fmt.Errorf("session.Spawn: ProjectPath must be absolute, got %q", req.ProjectPath)
	}
	if !e.worktree.IsGitRepo(ctx, req.ProjectPath) {
		return store.Session{}, fmt.Errorf("session.Spawn: %q is not a git repository", req.ProjectPath)
	}

	pluginID := req.AgentPlugin
	if pluginID == "" {
		pluginID = e.defaultAgent
	}
	agentPlugin, err := e.resolveAgent(pluginID)
	if err != nil {
		return store.Session{}, err
	}

	permissions := req.Permissions
	if permissions == "" {
		permissions = e.defaultPermissions
	}
	kind := req.Kind
	if kind == "" {
		kind = KindWorker
	}
	id := e.newID()
	workspaceMode, err := spawnWorkspaceMode(kind, req.WorkspaceMode)
	if err != nil {
		return store.Session{}, err
	}

	workspacePath := req.ProjectPath
	branchName := ""
	baseRef := ""
	createWorktree := workspaceMode == WorkerWorkspaceModeNewWorktree
	if createWorktree {
		baseRef, err = e.worktree.BaseRef(ctx, req.ProjectPath)
		if err != nil {
			return store.Session{}, fmt.Errorf("session.Spawn: detect base ref: %w", err)
		}
		workspacePath = filepath.Join(e.worktreeBase, id)
		branchName = branchNameFor(id)
	}

	// The built-in default prompts render per-session facts (workspace,
	// branch), so they can only be resolved once those are derived.
	systemPrompt := req.SystemPrompt
	if strings.TrimSpace(systemPrompt) == "" && strings.TrimSpace(req.SystemPromptFile) == "" {
		pc := PromptContext{
			SessionID:     id,
			ProjectPath:   req.ProjectPath,
			ProjectName:   filepath.Base(req.ProjectPath),
			WorkspacePath: workspacePath,
			Branch:        branchName,
			BaseRef:       baseRef,
		}
		applyWorkspacePromptInstructions(&pc, kind, workspaceMode)
		switch kind {
		case KindOrchestrator:
			systemPrompt, err = DefaultOrchestratorSystemPrompt(pc)
		case KindWorker:
			systemPrompt, err = DefaultWorkerSystemPrompt(pc)
		}
		if err != nil {
			return store.Session{}, fmt.Errorf("session.Spawn: render default system prompt: %w", err)
		}
	}

	// Step 1: create the worktree when this session is isolated. Local
	// workers and orchestrators run directly in the project worktree.
	if createWorktree {
		if err := e.worktree.Create(ctx, req.ProjectPath, workspacePath, branchName, baseRef); err != nil {
			return store.Session{}, fmt.Errorf("session.Spawn: create worktree: %w", err)
		}
	}

	// Step 2: get the agent's launch command. The plugin uses the workspace
	// path so its prompt-file resolution etc. can be workspace-relative.
	launchCfg := agent.LaunchConfig{
		Permissions:      permissions,
		Prompt:           req.Prompt,
		SessionID:        id,
		SystemPrompt:     systemPrompt,
		SystemPromptFile: req.SystemPromptFile,
		WorkspacePath:    workspacePath,
	}
	launchCmd, err := agentPlugin.GetLaunchCommand(ctx, launchCfg)
	if err != nil {
		e.rollbackWorktree(ctx, req.ProjectPath, workspacePath, branchName, createWorktree)
		return store.Session{}, fmt.Errorf("session.Spawn: build launch command: %w", err)
	}

	// Step 2b: install workspace-local hooks before the native agent starts.
	if err := agentPlugin.GetAgentHooks(ctx, agent.WorkspaceHookConfig{
		SessionID:     id,
		WorkspacePath: workspacePath,
		DataDir:       filepath.Dir(e.worktreeBase),
	}); err != nil {
		e.rollbackWorktree(ctx, req.ProjectPath, workspacePath, branchName, createWorktree)
		return store.Session{}, fmt.Errorf("session.Spawn: install agent hooks: %w", err)
	}

	// Step 2c: optional per-agent pre-launch setup. Agents that implement
	// the preLauncher capability (e.g. Claude Code pre-seeding workspace
	// trust so its blocking trust dialog doesn't hang the session) run here,
	// after the worktree exists but before the durability session starts.
	if pre, ok := agentPlugin.(preLauncher); ok {
		if err := pre.PreLaunch(ctx, launchCfg); err != nil {
			e.rollbackWorktree(ctx, req.ProjectPath, workspacePath, branchName, createWorktree)
			return store.Session{}, fmt.Errorf("session.Spawn: agent pre-launch: %w", err)
		}
	}

	// Step 3: persist before launch so native hooks can update the row as soon
	// as the agent starts.
	now := e.now()
	metadata := map[string]any{}
	if req.Prompt != "" {
		// The dashboard renders the prompt as a card's title. Storing it
		// in metadata (rather than a real column) keeps the schema lean
		// and keeps plugin-specific fields beside it.
		metadata["prompt"] = req.Prompt
	}
	metadata["kind"] = string(kind)
	metadata["role"] = string(kind)
	metadata["workspaceMode"] = string(workspaceMode)
	if kind == KindOrchestrator {
		metadata["title"] = "Orchestrator"
	}
	sess := store.Session{
		ID:            id,
		ProjectPath:   req.ProjectPath,
		ProjectName:   filepath.Base(req.ProjectPath),
		AgentPlugin:   pluginID,
		WorkspacePath: workspacePath,
		ZellijSession: id,
		Metadata:      metadata,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := e.repo.Insert(ctx, sess); err != nil {
		e.rollbackWorktree(ctx, req.ProjectPath, workspacePath, branchName, createWorktree)
		return store.Session{}, fmt.Errorf("session.Spawn: persist session row: %w", err)
	}

	// Step 4: spawn the durability-provider session running the agent.
	if err := e.provider.CreateSession(ctx, CreateOpts{
		Name:      id,
		LaunchCmd: launchCmd,
		Cwd:       workspacePath,
		Env: map[string]string{
			"YYORK_PROJECT_PATH": req.ProjectPath,
			"YYORK_SESSION_ID":   id,
			"YYORK_SESSION_KIND": string(kind),
		},
	}); err != nil {
		_ = e.repo.Delete(ctx, id)
		e.rollbackWorktree(ctx, req.ProjectPath, workspacePath, branchName, createWorktree)
		return store.Session{}, fmt.Errorf("session.Spawn: create durability session: %w", err)
	}

	e.bus.Publish(events.NewSessionCreated(id))
	return sess, nil
}

// EnsureOrchestrator returns the existing live orchestrator for projectPath, or
// spawns one when none is present. ReconcileAll should run before this method
// so dead Zellij sessions have already been removed from the store.
func (e *Engine) EnsureOrchestrator(ctx context.Context, req SpawnRequest) (store.Session, bool, error) {
	if strings.TrimSpace(req.ProjectPath) == "" {
		return store.Session{}, false, errors.New("session.EnsureOrchestrator: ProjectPath is required")
	}
	if !filepath.IsAbs(req.ProjectPath) {
		return store.Session{}, false, fmt.Errorf("session.EnsureOrchestrator: ProjectPath must be absolute, got %q", req.ProjectPath)
	}

	rows, err := e.repo.ListByProject(ctx, req.ProjectPath)
	if err != nil {
		return store.Session{}, false, fmt.Errorf("session.EnsureOrchestrator: list project sessions: %w", err)
	}
	for _, row := range rows {
		if rowKind(row.Metadata) == KindOrchestrator {
			return row, false, nil
		}
	}

	req.Kind = KindOrchestrator
	sess, err := e.Spawn(ctx, req)
	if err != nil {
		return store.Session{}, false, err
	}
	return sess, true, nil
}

// Stop terminates the session with the given id: kills its zellij session,
// removes its worktree, and deletes the row. Stop is idempotent — stopping
// a session id that has no row returns nil.
func (e *Engine) Stop(ctx context.Context, id string) error {
	if strings.TrimSpace(id) == "" {
		return errors.New("session.Stop: id is required")
	}

	sess, err := e.repo.Get(ctx, id)
	if errors.Is(err, store.ErrSessionNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("session.Stop: load session: %w", err)
	}

	if err := e.provider.KillSession(ctx, sess.ZellijSession); err != nil {
		return fmt.Errorf("session.Stop: kill durability session: %w", err)
	}

	// Worktree + branch removal is best-effort. We still delete the row so
	// the user's dashboard reflects reality even if cleanup hiccups.
	e.removeSessionWorktree(ctx, sess)

	if err := e.repo.Delete(ctx, id); err != nil {
		return fmt.Errorf("session.Stop: delete row: %w", err)
	}

	e.bus.Publish(events.NewSessionTerminated(id))
	return nil
}

// Reconcile checks one session's zellij liveness and, if the zellij
// session is gone, deletes the row and emits a session.terminated event.
// Returns the (possibly updated) row. If the row was deleted, the second
// return value reports false.
func (e *Engine) Reconcile(ctx context.Context, id string) (store.Session, bool, error) {
	sess, err := e.repo.Get(ctx, id)
	if errors.Is(err, store.ErrSessionNotFound) {
		return store.Session{}, false, nil
	}
	if err != nil {
		return store.Session{}, false, fmt.Errorf("session.Reconcile: load: %w", err)
	}

	alive, err := e.provider.SessionExists(ctx, sess.ZellijSession)
	if err != nil {
		return store.Session{}, false, fmt.Errorf("session.Reconcile: probe: %w", err)
	}
	if alive {
		return sess, true, nil
	}

	// Best-effort worktree cleanup mirrors Stop's behavior.
	e.removeSessionWorktree(ctx, sess)
	if err := e.repo.Delete(ctx, id); err != nil {
		return store.Session{}, false, fmt.Errorf("session.Reconcile: delete: %w", err)
	}
	e.bus.Publish(events.NewSessionTerminated(id))
	return store.Session{}, false, nil
}

// ReconcileAll sweeps every row in the store against the durability
// provider's live-set in a single list call (instead of N per-session
// probes). Used at server boot to clear sessions that died across restart.
func (e *Engine) ReconcileAll(ctx context.Context) error {
	rows, err := e.repo.List(ctx)
	if err != nil {
		return fmt.Errorf("session.ReconcileAll: list: %w", err)
	}
	if len(rows) == 0 {
		return nil
	}

	live, err := e.provider.ListSessionNames(ctx)
	if err != nil {
		return fmt.Errorf("session.ReconcileAll: list zellij: %w", err)
	}
	liveSet := make(map[string]struct{}, len(live))
	for _, name := range live {
		liveSet[name] = struct{}{}
	}

	for _, row := range rows {
		if _, ok := liveSet[row.ZellijSession]; ok {
			continue
		}
		e.removeSessionWorktree(ctx, row)
		if err := e.repo.Delete(ctx, row.ID); err != nil {
			return fmt.Errorf("session.ReconcileAll: delete %s: %w", row.ID, err)
		}
		e.bus.Publish(events.NewSessionTerminated(row.ID))
	}
	return nil
}

func (e *Engine) resolveAgent(id string) (agent.Agent, error) {
	plug, ok := e.plugins.Get(id)
	if !ok {
		return nil, fmt.Errorf("session: agent plugin %q is not registered", id)
	}
	a, ok := plug.(agent.Agent)
	if !ok {
		return nil, fmt.Errorf("session: plugin %q does not implement the agent interface", id)
	}
	return a, nil
}

func (e *Engine) rollbackWorktree(ctx context.Context, projectPath, worktreePath, branchName string, createdWorktree bool) {
	if !createdWorktree {
		return
	}
	// Best-effort: log silently in production; tests assert on the absence
	// of the row, not on cleanup correctness.
	_ = e.worktree.Remove(ctx, projectPath, worktreePath, branchName)
}

func (e *Engine) removeSessionWorktree(ctx context.Context, sess store.Session) {
	if sess.WorkspacePath == "" || sess.ProjectPath == "" || sess.WorkspacePath == sess.ProjectPath {
		return
	}
	_ = e.worktree.Remove(ctx, sess.ProjectPath, sess.WorkspacePath, branchNameFor(sess.ID))
}

func spawnWorkspaceMode(kind Kind, requested WorkerWorkspaceMode) (WorkerWorkspaceMode, error) {
	if kind == KindOrchestrator {
		return WorkerWorkspaceModeLocal, nil
	}
	mode, ok := NormalizeWorkerWorkspaceMode(string(requested))
	if !ok {
		return "", fmt.Errorf(
			"session.Spawn: WorkspaceMode must be %q or %q, got %q",
			WorkerWorkspaceModeNewWorktree,
			WorkerWorkspaceModeLocal,
			requested,
		)
	}
	return mode, nil
}

func applyWorkspacePromptInstructions(pc *PromptContext, kind Kind, mode WorkerWorkspaceMode) {
	if kind == KindOrchestrator {
		pc.WorkspaceInstruction = "Your workspace is the main project worktree at " + pc.WorkspacePath + "."
		pc.CompletionInstruction = "Stay in the main worktree and coordinate worker sessions instead of implementing changes yourself unless explicitly asked."
		return
	}

	switch mode {
	case WorkerWorkspaceModeLocal:
		pc.WorkspaceInstruction = "Your workspace is the main project worktree at " + pc.WorkspacePath + "."
		pc.CompletionInstruction = "Continue in this main worktree. Do not create or switch branches unless the user explicitly asks."
	default:
		pc.WorkspaceInstruction = "Your workspace is an isolated git worktree at " + pc.WorkspacePath + ", on branch " + pc.Branch + " (cut from " + pc.BaseRef + ")."
		pc.CompletionInstruction = "Commit your work on this branch and stay on it."
	}
}

// branchNameFor returns the git branch name for a session id. The branch is
// the same in Create (spawn) and Remove (stop/reconcile/rollback), so this
// single derivation keeps them in lockstep.
func branchNameFor(id string) string {
	return "yyork/" + id
}

// idAlphabet is Crockford base32 in lowercase (no i/l/o/u) so session ids read
// cleanly in git branch names and zellij session names without ambiguous
// characters.
const idAlphabet = "0123456789abcdefghjkmnpqrstvwxyz"

// idLength is the session id length. Six Crockford-base32 chars give ~10^9
// distinct values — ample for the handful of sessions alive at once on a
// single machine — while staying short enough to keep zellij's Unix-domain
// socket path (<dir>/<version>/<id>) under the ~103-byte sun_path limit.
const idLength = 6

// defaultNewID returns a fresh random session id of idLength Crockford-base32
// characters. Unlike a ULID it carries no timestamp prefix, so two ids minted
// in the same millisecond don't collide on their leading characters. 256 is a
// multiple of 32, so the b%32 mapping is unbiased.
func defaultNewID() string {
	buf := make([]byte, idLength)
	if _, err := rand.Read(buf); err != nil {
		// crypto/rand failure is catastrophic and not expected; panicking
		// beats emitting a predictable or low-entropy id.
		panic(fmt.Sprintf("session: generate id: %v", err))
	}
	for i, b := range buf {
		buf[i] = idAlphabet[b%32]
	}
	return string(buf)
}
