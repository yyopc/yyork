package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"github.com/yyopc/yyork/internal/app"
	"github.com/yyopc/yyork/internal/control"
	"github.com/yyopc/yyork/internal/durabilityprovider"
	"github.com/yyopc/yyork/internal/logging"
	"github.com/yyopc/yyork/internal/plugin"
	pluginagent "github.com/yyopc/yyork/internal/plugin/agent"
	"github.com/yyopc/yyork/internal/plugin/agent/claudecode"
	"github.com/yyopc/yyork/internal/plugin/agent/codex"
	"github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/store"
	"github.com/yyopc/yyork/internal/worktree"
)

// Command groups, so help lists shipped verbs separately from planned surface.
const (
	groupCore    = "core"
	groupPlanned = "planned"
)

const defaultAgentPlugin = "claude-code"

const (
	spawnTypeOrchestrator = "orchestrator"
	spawnTypeWorker       = "worker"
)

// appRunner is the server entrypoint (app.Run), injected into the root command
// so tests can drive the no-verb server path without binding a real port.
type appRunner func(context.Context, app.Config) error

// newRootCmd builds the full command tree. Main wraps it in fang; tests
// execute it directly.
func newRootCmd(runApp appRunner, webFS fs.FS) *cobra.Command {
	var addr string
	var openBrowser bool

	root := &cobra.Command{
		Use:   "yyork [projectPath]",
		Short: "Local-first agent orchestration for parallel AI coding work.",
		Long: "yyork orchestrates parallel AI coding agents across Zellij-backed " +
			"workspaces, repos, and issue trackers.\n\n" +
			"Run with no command to start the local dashboard and API server.",
		Version: Version,
		// No verb => start the local server. `yyork start` / `yyork dashboard`
		// are not user-facing verbs.
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runServer(cmd, addr, openBrowser, webFS, runApp, args)
		},
		// fang sets these too; setting them here makes the cobra tree behave
		// identically under test (where fang is absent) — errors propagate as
		// return values instead of being printed with a usage dump.
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.Flags().StringVar(&addr, "addr", "127.0.0.1:7331", "address for the yyork local server")
	root.Flags().BoolVar(&openBrowser, "open", true, "open the dashboard in the default browser")

	root.AddGroup(
		&cobra.Group{ID: groupCore, Title: "Commands"},
		&cobra.Group{ID: groupPlanned, Title: "Planned"},
	)
	// Fold cobra's auto-generated help/completion commands into the core group
	// so help shows a single "Commands" section instead of an ungrouped bucket
	// with the same title.
	root.SetHelpCommandGroupID(groupCore)
	root.SetCompletionCommandGroupID(groupCore)
	root.AddCommand(newSpawnCmd(), newSessionCmd(), newStopCmd(), newSendCmd(), newHooksCmd())
	root.AddCommand(newDevCmd(runApp, webFS))
	root.AddCommand(plannedCmds()...)
	return root
}

// runServer starts the local dashboard/API server. With no verb this is the
// root command's action; `yyork` and `yyork --addr ... --open=false` both land
// here.
func runServer(cmd *cobra.Command, addr string, openBrowser bool, webFS fs.FS, runApp appRunner, args []string) error {
	// Install the colorized, structured slog handler now that we know this is
	// the server path. The verb subcommands print plain text via the command's
	// stdout and intentionally leave the global logger alone.
	logging.Setup(cmd.ErrOrStderr())

	projectPath, err := resolveServerProjectPath(cmd.Context(), args)
	if err != nil {
		return err
	}

	// Source and package installs serve the embedded dashboard mirror. Frontend
	// dev can still run Vite separately through `pnpm web:dev`, but the default
	// server path stays integrated so API, terminal websockets, and dashboard
	// assets share one yyork origin.
	err = runApp(cmd.Context(), app.Config{
		Addr:        addr,
		OpenBrowser: openBrowser,
		ProjectPath: projectPath,
		WebFS:       webFS,
	})
	// A canceled context is a clean Ctrl-C / SIGTERM shutdown, not a failure.
	if err != nil && !errors.Is(err, context.Canceled) {
		return err
	}
	return nil
}

// buildEngine constructs a session.Engine wired to a real SQLite store, the
// real Zellij durability provider, the real git worktree module, the built-in
// plugins, and an in-process forwarding events bus. The CLI uses this when a
// verb (spawn / stop) needs to act against state without starting the HTTP
// server.
//
// Callers must invoke close() when done. The bus forwards lifecycle events to
// a running server (if one is advertised in the runfile) so an already-open
// board updates live; with no server running the forwarder is a no-op and the
// row still lands in the shared store.
func buildEngine(ctx context.Context) (*session.Engine, func(), error) {
	dbPath, err := store.DefaultPath()
	if err != nil {
		return nil, nil, err
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		return nil, nil, fmt.Errorf("open store: %w", err)
	}

	registry := plugin.NewRegistry()
	for _, p := range []plugin.Plugin{codex.New(), claudecode.New()} {
		if err := registry.Register(p); err != nil {
			_ = dataStore.Close()
			return nil, nil, fmt.Errorf("register %s plugin: %w", p.Manifest().ID, err)
		}
	}

	eng, err := session.NewEngine(session.EngineConfig{
		Repo:     dataStore.Sessions(),
		Worktree: worktree.New(),
		Provider: durabilityprovider.NewZellijProvider(),
		Plugins:  registry,
		Bus:      control.NewForwardingPublisher(),
	})
	if err != nil {
		_ = dataStore.Close()
		return nil, nil, fmt.Errorf("build engine: %w", err)
	}

	closeFn := func() { _ = dataStore.Close() }
	return eng, closeFn, nil
}

func newSpawnCmd() *cobra.Command {
	var prompt, systemPromptFile, permissions, agentPlugin, sessionType, workspaceMode string
	var jsonOutput bool

	cmd := &cobra.Command{
		Use:     "spawn",
		GroupID: groupCore,
		Short:   "Spawn a new agent session in the current project.",
		Long: "Spawn a new agent session in the current project directory.\n\n" +
			"yyork creates a per-session git worktree and branch, starts the selected " +
			"agent inside Zellij, persists the session row, and forwards lifecycle " +
			"events to a running dashboard when one is available.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			kind, err := spawnKind(sessionType)
			if err != nil {
				return err
			}
			workspaceModeValue, err := parseWorkerWorkspaceModeFlag(workspaceMode)
			if err != nil {
				return err
			}
			return runSpawn(cmd, session.SpawnRequest{
				AgentPlugin:      agentPlugin,
				Kind:             kind,
				Prompt:           prompt,
				SystemPromptFile: systemPromptFile,
				Permissions:      pluginagent.PermissionMode(permissions),
				WorkspaceMode:    workspaceModeValue,
			}, jsonOutput)
		},
	}
	cmd.Flags().StringVar(&prompt, "prompt", "", "initial prompt for the spawned agent")
	cmd.Flags().StringVar(&agentPlugin, "agent", defaultAgentPlugin, "agent plugin to launch, e.g. claude-code or codex")
	cmd.Flags().StringVar(&systemPromptFile, "system-prompt-file", "", "path to a system prompt file for the spawned agent")
	cmd.Flags().StringVar(&permissions, "permissions", "", "agent permission mode override")
	cmd.Flags().StringVar(&sessionType, "type", spawnTypeWorker, "session type: worker or orchestrator")
	cmd.Flags().StringVar(&workspaceMode, "workspace", "", "worker workspace mode: new-worktree or local")
	cmd.Flags().BoolVar(&jsonOutput, "json", false, "write machine-readable JSON to stdout")
	return cmd
}

func runSpawn(cmd *cobra.Command, req session.SpawnRequest, jsonOutput bool) error {
	if err := validateSpawnRequest(req); err != nil {
		return err
	}

	projectPath, err := resolveProjectPathForSpawn()
	if err != nil {
		return err
	}
	req.ProjectPath = projectPath
	if req.Kind != session.KindOrchestrator && req.WorkspaceMode == "" {
		mode, ok, err := configuredWorkerWorkspaceMode(cmd.Context(), projectPath)
		if err != nil {
			return err
		}
		if ok {
			req.WorkspaceMode = mode
		}
	}

	eng, closeFn, err := buildEngine(cmd.Context())
	if err != nil {
		return fmt.Errorf("spawn: %w", err)
	}
	defer closeFn()

	sess, err := eng.Spawn(cmd.Context(), req)
	if err != nil {
		return fmt.Errorf("spawn: %w", err)
	}
	if jsonOutput {
		return writeJSON(cmd, cliSessionFromStore(sess))
	}
	fmt.Fprintln(cmd.OutOrStdout(), sess.ID)
	return nil
}

func validateSpawnRequest(req session.SpawnRequest) error {
	if req.Kind != session.KindOrchestrator && strings.TrimSpace(req.Prompt) == "" {
		return errors.New("spawn: --prompt must not be empty for worker sessions")
	}
	return nil
}

func spawnKind(raw string) (session.Kind, error) {
	switch strings.TrimSpace(raw) {
	case "", spawnTypeWorker:
		return session.KindWorker, nil
	case spawnTypeOrchestrator:
		return session.KindOrchestrator, nil
	default:
		return "", fmt.Errorf("spawn: --type must be %q or %q", spawnTypeWorker, spawnTypeOrchestrator)
	}
}

func parseWorkerWorkspaceModeFlag(raw string) (session.WorkerWorkspaceMode, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	mode, ok := session.NormalizeWorkerWorkspaceMode(trimmed)
	if !ok {
		return "", fmt.Errorf(
			"spawn: --workspace must be %q or %q",
			session.WorkerWorkspaceModeNewWorktree,
			session.WorkerWorkspaceModeLocal,
		)
	}
	return mode, nil
}

func configuredWorkerWorkspaceMode(ctx context.Context, projectPath string) (session.WorkerWorkspaceMode, bool, error) {
	dbPath, err := store.DefaultPath()
	if err != nil {
		return "", false, err
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		return "", false, fmt.Errorf("open store: %w", err)
	}
	defer func() { _ = dataStore.Close() }()

	settings, err := dataStore.ProjectSettings().Get(ctx, projectPath)
	if errors.Is(err, store.ErrProjectSettingsNotFound) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("read project settings: %w", err)
	}
	mode, ok := session.NormalizeWorkerWorkspaceMode(settings.WorkerWorkspaceMode)
	if !ok {
		return "", false, fmt.Errorf(
			"spawn: stored worker workspace mode for %s must be %q or %q, got %q",
			projectPath,
			session.WorkerWorkspaceModeNewWorktree,
			session.WorkerWorkspaceModeLocal,
			settings.WorkerWorkspaceMode,
		)
	}
	return mode, true, nil
}

func resolveProjectPathForSpawn() (string, error) {
	projectPath := strings.TrimSpace(os.Getenv("YYORK_PROJECT_PATH"))
	if projectPath == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return "", fmt.Errorf("spawn: resolve current directory: %w", err)
		}
		projectPath = cwd
	}

	abs, err := filepath.Abs(projectPath)
	if err != nil {
		return "", fmt.Errorf("spawn: resolve project path: %w", err)
	}
	return abs, nil
}

func resolveServerProjectPath(ctx context.Context, args []string) (string, error) {
	if len(args) > 0 {
		projectPath, err := resolveGitProjectRoot(ctx, args[0])
		if err != nil {
			return "", fmt.Errorf("project path: %w", err)
		}
		return projectPath, nil
	}

	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("resolve current directory: %w", err)
	}
	projectPath, err := resolveGitProjectRoot(ctx, cwd)
	if err != nil {
		return "", nil
	}
	return projectPath, nil
}

func resolveGitProjectRoot(ctx context.Context, path string) (string, error) {
	abs, err := filepath.Abs(strings.TrimSpace(path))
	if err != nil {
		return "", err
	}
	out, err := exec.CommandContext(ctx, "git", "-C", abs, "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return "", fmt.Errorf("%q is not inside a git repository", abs)
	}
	root := strings.TrimSpace(string(out))
	if root == "" {
		return "", fmt.Errorf("git reported an empty repository root for %q", abs)
	}
	return root, nil
}

func newSessionCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "session",
		GroupID: groupCore,
		Short:   "Manage running sessions.",
	}

	var project string
	var jsonOutput bool
	list := &cobra.Command{
		Use:   "list",
		Short: "List running sessions.",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runSessionList(cmd, project, jsonOutput)
		},
	}
	list.Flags().StringVar(&project, "project", "", "filter to a single project path")
	list.Flags().BoolVar(&jsonOutput, "json", false, "write machine-readable JSON to stdout")
	cmd.AddCommand(list)
	return cmd
}

func runSessionList(cmd *cobra.Command, projectFilter string, jsonOutput bool) error {
	ctx := cmd.Context()
	dbPath, err := store.DefaultPath()
	if err != nil {
		return fmt.Errorf("session list: %w", err)
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		return fmt.Errorf("session list: open store: %w", err)
	}
	defer func() { _ = dataStore.Close() }()

	workspace, err := session.NewStoreWorkspaceSource(dataStore.Sessions()).Workspace(ctx)
	if err != nil {
		return fmt.Errorf("session list: %w", err)
	}

	rows := append([]session.Session{}, workspace.Orchestrators...)
	rows = append(rows, workspace.Sessions...)
	if projectFilter != "" {
		filtered := rows[:0]
		for _, row := range rows {
			if row.Project == projectFilter {
				filtered = append(filtered, row)
			}
		}
		rows = filtered
	}

	out := cmd.OutOrStdout()
	if jsonOutput {
		sessions := make([]cliSessionOutput, 0, len(rows))
		for _, row := range rows {
			sessions = append(sessions, cliSessionFromWorkspace(row))
		}
		return writeJSON(cmd, cliSessionListOutput{
			Sessions: sessions,
			Count:    len(sessions),
		})
	}

	if len(rows) == 0 {
		fmt.Fprintln(out, "No sessions.")
		return nil
	}

	tw := tabwriter.NewWriter(out, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "ID\tPROJECT\tKIND\tAGENT\tSTATE")
	for _, row := range rows {
		kind := row.Kind
		if kind == "" {
			kind = session.KindWorker
		}
		fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t%s\n",
			row.ID, row.Project, kind, row.Agent, row.State)
	}
	return tw.Flush()
}

func newStopCmd() *cobra.Command {
	var jsonOutput bool

	cmd := &cobra.Command{
		Use:     "stop <sessionID>",
		GroupID: groupCore,
		Short:   "Terminate a running session.",
		Long: "Cleanly terminate a yyork session by killing its Zellij session, " +
			"removing its worktree, and deleting its store row.\n\n" +
			"Stopping a session id that is not in yyork's store is a no-op (exit 0).",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runStop(cmd, args[0], jsonOutput)
		},
	}
	cmd.Flags().BoolVar(&jsonOutput, "json", false, "write machine-readable JSON to stdout")
	return cmd
}

func runStop(cmd *cobra.Command, id string, jsonOutput bool) error {
	eng, closeFn, err := buildEngine(cmd.Context())
	if err != nil {
		return fmt.Errorf("stop: %w", err)
	}
	defer closeFn()

	if err := eng.Stop(cmd.Context(), id); err != nil {
		return fmt.Errorf("stop: %w", err)
	}
	if jsonOutput {
		return writeJSON(cmd, cliStopOutput{
			ID:      id,
			Stopped: true,
		})
	}
	fmt.Fprintln(cmd.OutOrStdout(), "stopped", id)
	return nil
}

func newSendCmd() *cobra.Command {
	var sessionID, projectID string
	var jsonOutput bool

	cmd := &cobra.Command{
		Use:     "send <message>",
		GroupID: groupCore,
		Short:   "Send a message to a session's agent.",
		Long:    "Send a message to a session's agent as if typed by the user.",
		Args:    cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSend(cmd, sessionID, projectID, args, jsonOutput)
		},
	}
	cmd.Flags().StringVar(&sessionID, "session", "", "target session id (required)")
	cmd.Flags().StringVar(&projectID, "project", "", "project id to disambiguate duplicate session ids")
	cmd.Flags().BoolVar(&jsonOutput, "json", false, "write machine-readable JSON to stdout")
	_ = cmd.MarkFlagRequired("session")
	return cmd
}

func runSend(cmd *cobra.Command, sessionID, projectID string, args []string, jsonOutput bool) error {
	ctx := cmd.Context()

	if strings.TrimSpace(sessionID) == "" {
		return errors.New("send: --session must not be empty")
	}
	message := strings.TrimSpace(strings.Join(args, " "))
	if message == "" {
		return errors.New("send: a non-empty message argument is required")
	}

	dbPath, err := store.DefaultPath()
	if err != nil {
		return fmt.Errorf("send: %w", err)
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		return fmt.Errorf("send: open store: %w", err)
	}
	defer func() { _ = dataStore.Close() }()

	workspace, err := session.NewStoreWorkspaceSource(dataStore.Sessions()).Workspace(ctx)
	if err != nil {
		return fmt.Errorf("send: failed to read workspace: %w", err)
	}

	registry := durabilityprovider.NewDefaultRegistry()
	if err := durabilityprovider.SendToSession(ctx, registry, workspace, projectID, sessionID, message); err != nil {
		return fmt.Errorf("send: %w", err)
	}

	if jsonOutput {
		return writeJSON(cmd, cliSendOutput{
			SessionID:   sessionID,
			ProjectPath: projectID,
			Sent:        true,
		})
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Sent message to session %s.\n", sessionID)
	return nil
}

type cliSessionOutput struct {
	ID            string         `json:"id"`
	ProjectPath   string         `json:"projectPath"`
	Kind          session.Kind   `json:"kind"`
	Agent         string         `json:"agent"`
	State         session.State  `json:"state,omitempty"`
	WorkspacePath string         `json:"workspacePath,omitempty"`
	ZellijSession string         `json:"zellijSession,omitempty"`
	Title         string         `json:"title,omitempty"`
	Recap         string         `json:"recap,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

type cliSessionListOutput struct {
	Sessions []cliSessionOutput `json:"sessions"`
	Count    int                `json:"count"`
}

type cliStopOutput struct {
	ID      string `json:"id"`
	Stopped bool   `json:"stopped"`
}

type cliSendOutput struct {
	SessionID   string `json:"sessionId"`
	ProjectPath string `json:"projectPath,omitempty"`
	Sent        bool   `json:"sent"`
}

func writeJSON(cmd *cobra.Command, v any) error {
	encoder := json.NewEncoder(cmd.OutOrStdout())
	return encoder.Encode(v)
}

func cliSessionFromStore(row store.Session) cliSessionOutput {
	return cliSessionOutput{
		ID:            row.ID,
		ProjectPath:   row.ProjectPath,
		Kind:          kindFromMetadata(row.Metadata),
		Agent:         row.AgentPlugin,
		State:         stateFromMetadata(row.Metadata),
		WorkspacePath: row.WorkspacePath,
		ZellijSession: row.ZellijSession,
		Title:         titleFromMetadata(row.Metadata, row.ID),
		Recap:         cliStringMetadata(row.Metadata, "recap"),
		Metadata:      metadataOrNil(row.Metadata),
	}
}

func cliSessionFromWorkspace(row session.Session) cliSessionOutput {
	metadata := decodeSessionMetadata(row.Metadata)
	kind := row.Kind
	if kind == "" {
		kind = session.KindWorker
	}
	agent := row.AgentPluginID
	if agent == "" {
		agent = row.Agent
	}
	return cliSessionOutput{
		ID:            row.ID,
		ProjectPath:   row.Project,
		Kind:          kind,
		Agent:         agent,
		State:         row.State,
		WorkspacePath: row.CWD,
		ZellijSession: row.ZellijSession,
		Title:         row.Title,
		Recap:         row.Recap,
		Metadata:      metadataOrNil(metadata),
	}
}

func decodeSessionMetadata(raw string) map[string]any {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var metadata map[string]any
	if err := json.Unmarshal([]byte(raw), &metadata); err != nil {
		return nil
	}
	return metadata
}

func metadataOrNil(metadata map[string]any) map[string]any {
	if len(metadata) == 0 {
		return nil
	}
	return metadata
}

func kindFromMetadata(metadata map[string]any) session.Kind {
	for _, key := range []string{"kind", "role"} {
		switch cliStringMetadata(metadata, key) {
		case string(session.KindOrchestrator):
			return session.KindOrchestrator
		case string(session.KindWorker):
			return session.KindWorker
		}
	}
	return session.KindWorker
}

func stateFromMetadata(metadata map[string]any) session.State {
	switch cliStringMetadata(metadata, "state") {
	case string(session.StatePrompt):
		return session.StatePrompt
	case string(session.StateTriage):
		return session.StateTriage
	case string(session.StateDone):
		return session.StateDone
	case string(session.StateWorking):
		return session.StateWorking
	default:
		return session.StateWorking
	}
}

func titleFromMetadata(metadata map[string]any, id string) string {
	for _, key := range []string{"displayName", "title", "prompt"} {
		if value := cliStringMetadata(metadata, key); value != "" {
			return value
		}
	}
	return "new agent: " + id
}

func cliStringMetadata(metadata map[string]any, key string) string {
	value, ok := metadata[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

// newHooksCmd registers the internal agent lifecycle hook entrypoint. hooks
// speaks a fixed machine protocol — JSON on stdin, "{}" on stdout, plain
// diagnostics on stderr — and is invoked by agent hook configs, not humans. It
// therefore writes straight to the real fds and owns its exit code, bypassing
// fang's styled help/error rendering. The driver and its tests in hooks.go stay
// byte-for-byte unchanged. DisableFlagParsing keeps every positional token
// (agent name, event) intact.
func newHooksCmd() *cobra.Command {
	return &cobra.Command{
		Use:                "hooks <codex|claude-code> <session-start|user-prompt-submit|pre-tool-use|post-tool-use|permission-request|stop|uninstall>",
		Short:              "Internal agent lifecycle hook entrypoint.",
		Hidden:             true,
		DisableFlagParsing: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			os.Exit(runHooks(cmd.Context(), args, os.Stdout, os.Stderr))
			return nil
		},
	}
}

// plannedCommandOrder / plannedCommands list orchestration verbs that are not
// implemented in yyork yet. They are
// registered as real cobra subcommands grouped under "Planned" so they appear
// in help and benefit from "did you mean" suggestions, but their RunE just
// reports that they aren't implemented. Implemented verbs (spawn/session/stop/
// send) and the no-verb server have first-class handlers above. Shell
// completion graduated from this list — cobra/fang now generate it for real.
var plannedCommandOrder = []string{
	"status",
	"batch-spawn",
	"acknowledge",
	"report",
	"review-check",
	"review",
	"open",
	"verify",
	"update",
	"setup",
	"plugin",
	"notify",
	"migrate-storage",
	"events",
	"config",
	"config-help",
}

var plannedCommands = map[string]string{
	"acknowledge":     "Acknowledge session pickup",
	"batch-spawn":     "Spawn sessions for multiple issues",
	"config":          "Read or write global orchestration config",
	"config-help":     "Show config schema guidance",
	"events":          "Query the activity event log",
	"migrate-storage": "Migrate legacy storage layouts",
	"notify":          "Work with configured notification targets",
	"open":            "Open sessions or dashboard targets",
	"plugin":          "Browse and manage plugins",
	"report":          "Declare a workflow transition",
	"review":          "Manage local reviewer runs",
	"review-check":    "Check PRs for review comments",
	"setup":           "Set up integrations with external services",
	"status":          "Show sessions and runtime status",
	"update":          "Check for updates and upgrade",
	"verify":          "Mark an issue as verified or failed",
}

func plannedCmds() []*cobra.Command {
	cmds := make([]*cobra.Command, 0, len(plannedCommandOrder))
	for _, name := range plannedCommandOrder {
		cmds = append(cmds, &cobra.Command{
			Use:     name,
			GroupID: groupPlanned,
			Short:   plannedCommands[name] + " [planned]",
			RunE: func(_ *cobra.Command, _ []string) error {
				return fmt.Errorf("command %q is part of yyork's planned orchestration surface, but is not implemented in yyork yet", name)
			},
		})
	}
	return cmds
}
