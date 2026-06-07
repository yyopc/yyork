package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/spf13/cobra"

	"github.com/yyovil/yyork/internal/ao"
	"github.com/yyovil/yyork/internal/app"
	"github.com/yyovil/yyork/internal/control"
	"github.com/yyovil/yyork/internal/durabilityprovider"
	"github.com/yyovil/yyork/internal/logging"
	"github.com/yyovil/yyork/internal/plugin"
	pluginagent "github.com/yyovil/yyork/internal/plugin/agent"
	"github.com/yyovil/yyork/internal/plugin/agent/claudecode"
	"github.com/yyovil/yyork/internal/plugin/agent/codex"
	"github.com/yyovil/yyork/internal/session"
	"github.com/yyovil/yyork/internal/store"
	"github.com/yyovil/yyork/internal/worktree"
)

// defaultAgentPlugin is the agent used when `spawn` is run without --agent.
const defaultAgentPlugin = "claude-code"

// Command groups, so help lists shipped verbs separately from the planned
// Agent Orchestrator parity surface.
const (
	groupCore    = "core"
	groupPlanned = "planned"
)

// appRunner is the server entrypoint (app.Run), injected into the root command
// so tests can drive the no-verb server path without binding a real port.
type appRunner func(context.Context, app.Config) error

// newRootCmd builds the full command tree. main() wraps it in fang; tests
// execute it directly.
func newRootCmd(runApp appRunner) *cobra.Command {
	var addr string
	var openBrowser bool

	root := &cobra.Command{
		Use:   "yyork",
		Short: "Local-first agent orchestration for parallel AI coding work.",
		Long: "yyork orchestrates parallel AI coding agents across Zellij-backed " +
			"workspaces, repos, and issue trackers.\n\n" +
			"Run with no command to start the local dashboard and API server.",
		Version: version,
		// No verb => start the local server. `yyork start` / `yyork dashboard`
		// are not user-facing verbs.
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runServer(cmd, addr, openBrowser, runApp)
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
		&cobra.Group{ID: groupPlanned, Title: "Planned (Agent Orchestrator parity surface)"},
	)
	// Fold cobra's auto-generated help/completion commands into the core group
	// so help shows a single "Commands" section instead of an ungrouped bucket
	// with the same title.
	root.SetHelpCommandGroupID(groupCore)
	root.SetCompletionCommandGroupID(groupCore)
	root.AddCommand(newSpawnCmd(), newSessionCmd(), newStopCmd(), newSendCmd(), newHooksCmd())
	root.AddCommand(plannedCmds()...)
	return root
}

// runServer starts the local dashboard/API server. With no verb this is the
// root command's action; `yyork` and `yyork --addr ... --open=false` both land
// here.
func runServer(cmd *cobra.Command, addr string, openBrowser bool, runApp appRunner) error {
	// Install the colorized, structured slog handler now that we know this is
	// the server path. The verb subcommands print plain text via the command's
	// stdout and intentionally leave the global logger alone.
	logging.Setup(cmd.ErrOrStderr())

	// In dev mode the wrapper (scripts/yyork.mjs) runs Vite and proxies API
	// requests here — the dashboard isn't served from this process. In
	// single-binary mode the embedded FS (cmd/yyork/dashboard) is the source.
	// Pass it and let the server prefer whichever is populated.
	webFS, _ := dashboardFS()
	err := runApp(cmd.Context(), app.Config{
		Addr:        addr,
		OpenBrowser: openBrowser,
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
	var prompt, systemPromptFile, permissions, agentPlugin string

	cmd := &cobra.Command{
		Use:     "spawn",
		GroupID: groupCore,
		Short:   "Spawn a new agent session in the current project.",
		Long: "Spawn a new agent session in the current project directory.\n\n" +
			"The current directory must be a git repository. A per-session git worktree " +
			"is created on branch yyork/<sessionId>, the configured agent is launched " +
			"inside a fresh zellij session, and the session row is persisted to " +
			"~/.yyork/state.db once the zellij session confirms it is live.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runSpawn(cmd, session.SpawnRequest{
				AgentPlugin:      agentPlugin,
				Prompt:           prompt,
				SystemPromptFile: systemPromptFile,
				Permissions:      pluginagent.PermissionMode(permissions),
			})
		},
	}
	cmd.Flags().StringVar(&prompt, "prompt", "", "prompt the orchestrator passes to the worker agent (required)")
	cmd.Flags().StringVar(&agentPlugin, "agent", defaultAgentPlugin, "agent plugin to run: claude-code | codex")
	cmd.Flags().StringVar(&systemPromptFile, "system-prompt-file", "", "path to a file containing the orchestrator agent's system prompt")
	cmd.Flags().StringVar(&permissions, "permissions", "", "permissions mode: default | accept-edits | auto | bypass-permissions")
	_ = cmd.MarkFlagRequired("prompt")
	return cmd
}

func runSpawn(cmd *cobra.Command, req session.SpawnRequest) error {
	// MarkFlagRequired catches a missing --prompt; this catches a whitespace-
	// only one.
	if strings.TrimSpace(req.Prompt) == "" {
		return errors.New("spawn: --prompt must not be empty")
	}

	projectPath, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("spawn: resolve current directory: %w", err)
	}
	req.ProjectPath = projectPath

	eng, closeEng, err := buildEngine(cmd.Context())
	if err != nil {
		return fmt.Errorf("spawn: %w", err)
	}
	defer closeEng()

	sess, err := eng.Spawn(cmd.Context(), req)
	if err != nil {
		return fmt.Errorf("spawn: %w", err)
	}

	fmt.Fprintln(cmd.OutOrStdout(), sess.ID)
	return nil
}

func newSessionCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "session",
		GroupID: groupCore,
		Short:   "Manage running sessions.",
	}

	var project string
	list := &cobra.Command{
		Use:   "list",
		Short: "List running sessions.",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runSessionList(cmd, project)
		},
	}
	list.Flags().StringVar(&project, "project", "", "filter to a single project's absolute path")
	cmd.AddCommand(list)
	return cmd
}

func runSessionList(cmd *cobra.Command, projectFilter string) error {
	ctx := cmd.Context()

	dbPath, err := store.DefaultPath()
	if err != nil {
		return fmt.Errorf("session list: %w", err)
	}
	s, err := store.Open(ctx, dbPath)
	if err != nil {
		return fmt.Errorf("session list: open store: %w", err)
	}
	defer func() { _ = s.Close() }()

	var rows []store.Session
	if projectFilter != "" {
		rows, err = s.Sessions().ListByProject(ctx, projectFilter)
	} else {
		rows, err = s.Sessions().List(ctx)
	}
	if err != nil {
		return fmt.Errorf("session list: %w", err)
	}

	out := cmd.OutOrStdout()
	if len(rows) == 0 {
		fmt.Fprintln(out, "No sessions.")
		return nil
	}

	tw := tabwriter.NewWriter(out, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "ID\tPROJECT\tAGENT\tSTARTED")
	for _, row := range rows {
		project := row.ProjectName
		if project == "" {
			project = row.ProjectPath
		}
		fmt.Fprintf(tw, "%s\t%s\t%s\t%s\n",
			row.ID, project, row.AgentPlugin, row.CreatedAt.Format(time.RFC3339))
	}
	return tw.Flush()
}

func newStopCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "stop <sessionID>",
		GroupID: groupCore,
		Short:   "Terminate a running session.",
		Long: "Cleanly terminate a session: kill the zellij session, remove the worktree " +
			"(best-effort), and delete the row from ~/.yyork/state.db.\n\n" +
			"Stopping a session id that has no row is a no-op (exit 0).",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runStop(cmd, args[0])
		},
	}
}

func runStop(cmd *cobra.Command, id string) error {
	eng, closeEng, err := buildEngine(cmd.Context())
	if err != nil {
		return fmt.Errorf("stop: %w", err)
	}
	defer closeEng()

	if err := eng.Stop(cmd.Context(), id); err != nil {
		return fmt.Errorf("stop: %w", err)
	}
	fmt.Fprintln(cmd.OutOrStdout(), "stopped", id)
	return nil
}

func newSendCmd() *cobra.Command {
	var sessionID, projectID string

	cmd := &cobra.Command{
		Use:     "send <message>",
		GroupID: groupCore,
		Short:   "Send a message to a session's agent.",
		Long:    "Send a message to a session's agent as if typed by the user.",
		Args:    cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSend(cmd, sessionID, projectID, args)
		},
	}
	cmd.Flags().StringVar(&sessionID, "session", "", "target session id (required)")
	cmd.Flags().StringVar(&projectID, "project", "", "project id to disambiguate duplicate session ids")
	_ = cmd.MarkFlagRequired("session")
	return cmd
}

func runSend(cmd *cobra.Command, sessionID, projectID string, args []string) error {
	ctx := cmd.Context()

	if strings.TrimSpace(sessionID) == "" {
		return errors.New("send: --session must not be empty")
	}
	message := strings.TrimSpace(strings.Join(args, " "))
	if message == "" {
		return errors.New("send: a non-empty message argument is required")
	}

	workspace, err := ao.NewWorkspaceProvider().Workspace(ctx)
	if err != nil {
		return fmt.Errorf("send: failed to read workspace: %w", err)
	}

	registry := durabilityprovider.NewDefaultRegistry()
	if err := durabilityprovider.SendToSession(ctx, registry, workspace, projectID, sessionID, message); err != nil {
		return fmt.Errorf("send: %w", err)
	}

	fmt.Fprintf(cmd.OutOrStdout(), "Sent message to session %s.\n", sessionID)
	return nil
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
		Use:                "hooks <codex|claude-code> <session-start|user-prompt-submit|stop|uninstall>",
		Short:              "Internal agent lifecycle hook entrypoint.",
		Hidden:             true,
		DisableFlagParsing: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			os.Exit(runHooks(cmd.Context(), args, os.Stdout, os.Stderr))
			return nil
		},
	}
}

// plannedCommandOrder / plannedCommands list verbs that exist in the Agent
// Orchestrator parity surface but aren't implemented in yyork yet. They are
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
	"project",
	"migrate-storage",
	"events",
	"config",
	"config-help",
}

var plannedCommands = map[string]string{
	"acknowledge":     "Acknowledge session pickup",
	"batch-spawn":     "Spawn sessions for multiple issues",
	"config":          "Read or write global AO config",
	"config-help":     "Show config schema guidance",
	"events":          "Query the activity event log",
	"migrate-storage": "Migrate legacy AO storage layouts",
	"notify":          "Work with configured notification targets",
	"open":            "Open sessions or dashboard targets",
	"plugin":          "Browse and manage AO plugins",
	"project":         "Manage portfolio projects",
	"report":          "Declare a workflow transition",
	"review":          "Manage AO-local reviewer runs",
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
				return fmt.Errorf("command %q is part of the Agent Orchestrator parity surface, but is not implemented in yyork yet", name)
			},
		})
	}
	return cmds
}
