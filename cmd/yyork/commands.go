package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/yyovil/yyork/internal/control"
	"github.com/yyovil/yyork/internal/durabilityprovider"
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

// buildEngine constructs a session.Engine wired to a real SQLite store, the
// real Zellij durability provider, the real git worktree module, the
// built-in plugins, and an in-process events bus. The CLI uses this when a
// verb (spawn / session list / stop) needs to act against state without
// starting the HTTP server.
//
// Callers must invoke close() when done. The events bus is created but has
// no SSE subscribers attached — events fire into the void, which is the
// correct behavior for one-shot CLI invocations.
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

	// Forward lifecycle events to a running server (if one is advertised in
	// the runfile) so an already-open board updates live. When no server is
	// running, the forwarder is a no-op — the row still lands in the shared
	// store, and the next board load picks it up.
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

	close := func() { _ = dataStore.Close() }
	return eng, close, nil
}

func runSpawn(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer) int {
	if hasHelpFlag(args) {
		_ = printCommandHelp("spawn", stdout, stderr)
		return 0
	}

	var prompt string
	var systemPromptFile string
	var permissions string
	var agentPlugin string

	flags := flag.NewFlagSet("spawn", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&prompt, "prompt", "", "prompt the orchestrator passes to the worker agent (required)")
	flags.StringVar(&systemPromptFile, "system-prompt-file", "", "path to a file containing the orchestrator agent's system prompt")
	flags.StringVar(&permissions, "permissions", "", "permissions mode: default | accept-edits | auto | bypass-permissions")
	flags.StringVar(&agentPlugin, "agent", defaultAgentPlugin, "agent plugin to run: claude-code | codex")
	flags.Usage = func() { _ = printCommandHelp("spawn", stderr, stderr) }
	if err := flags.Parse(args); err != nil {
		return 1
	}

	if strings.TrimSpace(prompt) == "" {
		fmt.Fprintln(stderr, "spawn: --prompt is required")
		fmt.Fprintln(stderr, "Run `yyork help spawn` for usage.")
		return 1
	}

	projectPath, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(stderr, "spawn: resolve current directory: %v\n", err)
		return 1
	}

	eng, closeEng, err := buildEngine(ctx)
	if err != nil {
		fmt.Fprintf(stderr, "spawn: %v\n", err)
		return 1
	}
	defer closeEng()

	sess, err := eng.Spawn(ctx, session.SpawnRequest{
		ProjectPath:      projectPath,
		AgentPlugin:      agentPlugin,
		Prompt:           prompt,
		SystemPromptFile: systemPromptFile,
		Permissions:      pluginagent.PermissionMode(permissions),
	})
	if err != nil {
		fmt.Fprintf(stderr, "spawn: %v\n", err)
		return 1
	}

	fmt.Fprintln(stdout, sess.ID)
	return 0
}

func runSession(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer) int {
	if len(args) == 0 || hasHelpFlag(args) {
		_ = printCommandHelp("session", stdout, stderr)
		if len(args) == 0 {
			return 1
		}
		return 0
	}

	sub := args[0]
	subArgs := args[1:]
	switch sub {
	case "list":
		return runSessionList(ctx, subArgs, stdout, stderr)
	default:
		fmt.Fprintf(stderr, "session: unknown subcommand %q\n", sub)
		fmt.Fprintln(stderr, "Run `yyork help session` for usage.")
		return 1
	}
}

func runSessionList(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer) int {
	if hasHelpFlag(args) {
		_ = printCommandHelp("session", stdout, stderr)
		return 0
	}

	var projectFilter string
	flags := flag.NewFlagSet("session list", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&projectFilter, "project", "", "filter to a single project's absolute path")
	flags.Usage = func() { _ = printCommandHelp("session", stderr, stderr) }
	if err := flags.Parse(args); err != nil {
		return 1
	}

	dbPath, err := store.DefaultPath()
	if err != nil {
		fmt.Fprintf(stderr, "session list: %v\n", err)
		return 1
	}
	s, err := store.Open(ctx, dbPath)
	if err != nil {
		fmt.Fprintf(stderr, "session list: open store: %v\n", err)
		return 1
	}
	defer func() { _ = s.Close() }()

	var rows []store.Session
	if projectFilter != "" {
		rows, err = s.Sessions().ListByProject(ctx, projectFilter)
	} else {
		rows, err = s.Sessions().List(ctx)
	}
	if err != nil {
		fmt.Fprintf(stderr, "session list: %v\n", err)
		return 1
	}

	if len(rows) == 0 {
		fmt.Fprintln(stdout, "No sessions.")
		return 0
	}

	tw := tabwriter.NewWriter(stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "ID\tPROJECT\tAGENT\tSTARTED")
	for _, row := range rows {
		project := row.ProjectName
		if project == "" {
			project = row.ProjectPath
		}
		fmt.Fprintf(tw, "%s\t%s\t%s\t%s\n",
			row.ID, project, row.AgentPlugin, row.CreatedAt.Format(time.RFC3339))
	}
	_ = tw.Flush()
	return 0
}

func runStop(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer) int {
	if hasHelpFlag(args) {
		_ = printCommandHelp("stop", stdout, stderr)
		return 0
	}

	flags := flag.NewFlagSet("stop", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.Usage = func() { _ = printCommandHelp("stop", stderr, stderr) }
	if err := flags.Parse(args); err != nil {
		return 1
	}
	if flags.NArg() != 1 {
		fmt.Fprintln(stderr, "stop: exactly one <sessionID> argument is required")
		fmt.Fprintln(stderr, "Run `yyork help stop` for usage.")
		return 1
	}
	id := flags.Arg(0)

	eng, closeEng, err := buildEngine(ctx)
	if err != nil {
		fmt.Fprintf(stderr, "stop: %v\n", err)
		return 1
	}
	defer closeEng()

	if err := eng.Stop(ctx, id); err != nil {
		fmt.Fprintf(stderr, "stop: %v\n", err)
		return 1
	}
	fmt.Fprintln(stdout, "stopped", id)
	return 0
}

