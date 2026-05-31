// Command better-ao-fang is a THROWAWAY experiment: it mirrors the real
// better-ao CLI command surface (cmd/better-ao) but drives it with
// spf13/cobra + charmbracelet/fang instead of stdlib flag + a hand-rolled
// lipgloss help renderer. The handlers are stubs — the point is to compare
// help/error/version/completion/manpage UX against the real binary, not to
// re-wire the engine.
package main

import (
	"context"
	"fmt"
	"image/color"
	"os"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/fang"
	"github.com/spf13/cobra"
)

const version = "0.0.1"

// brand maps better-ao's existing lipgloss v1 palette (see
// cmd/better-ao/help.go newHelpStyles) onto fang's ColorScheme so the
// comparison is apples-to-apples: same colors, different machinery.
func brand(c lipgloss.LightDarkFunc) fang.ColorScheme {
	pink := lipgloss.Color("212")
	cyan := lipgloss.Color("86")
	amber := lipgloss.Color("215")
	text := lipgloss.Color("252")
	dim := lipgloss.Color("241")
	black := lipgloss.Color("0")

	return fang.ColorScheme{
		Base:           text,
		Title:          pink,
		Description:    text,
		Codeblock:      lipgloss.Color("245"),
		Program:        pink,
		DimmedArgument: dim,
		Comment:        dim,
		Flag:           amber,
		FlagDefault:    dim,
		Command:        cyan,
		QuotedString:   cyan,
		Argument:       amber,
		Help:           dim,
		Dash:           dim,
		ErrorHeader:    [2]color.Color{black, pink}, // black on pink, like the help title badge
		ErrorDetails:   text,
	}
}

func main() {
	root := newRootCmd()
	if err := fang.Execute(
		context.Background(),
		root,
		fang.WithVersion(version),
		fang.WithColorSchemeFunc(brand),
	); err != nil {
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	var addr string
	var open bool

	root := &cobra.Command{
		Use:   "better-ao",
		Short: "Local-first agent orchestration for parallel AI coding work.",
		Long: "better-ao orchestrates parallel AI coding agents across Zellij-backed " +
			"workspaces, repos, and issue trackers.\n\n" +
			"Run with no command to start the local dashboard and API server.",
		// No verb => start the local server (mirrors runServer).
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Fprintf(cmd.OutOrStdout(), "[stub] would start server addr=%s open=%v\n", addr, open)
			return nil
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.Flags().StringVar(&addr, "addr", "127.0.0.1:7331", "address for the better-ao local server")
	root.Flags().BoolVar(&open, "open", true, "open the dashboard in the default browser")

	root.AddGroup(
		&cobra.Group{ID: "core", Title: "Commands"},
		&cobra.Group{ID: "planned", Title: "Planned (Agent Orchestrator parity surface)"},
	)

	root.AddCommand(newSpawnCmd(), newSessionCmd(), newStopCmd(), newSendCmd())
	for _, c := range plannedCmds() {
		root.AddCommand(c)
	}
	return root
}

func newSpawnCmd() *cobra.Command {
	var prompt, systemPromptFile, permissions, agent string
	cmd := &cobra.Command{
		Use:     "spawn",
		GroupID: "core",
		Short:   "Spawn a new agent session in the current project.",
		Long: "Spawn a new agent session in the current project directory.\n\n" +
			"The current directory must be a git repository. A per-session git worktree " +
			"is created on branch better-ao/<sessionId>, the configured agent is launched " +
			"inside a fresh zellij session, and the session row is persisted to " +
			"~/.better-ao/state.db once the zellij session confirms it is live.",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Fprintf(cmd.OutOrStdout(), "[stub] spawn agent=%s prompt=%q\n", agent, prompt)
			return nil
		},
	}
	cmd.Flags().StringVar(&prompt, "prompt", "", "prompt the orchestrator passes to the worker agent (required)")
	cmd.Flags().StringVar(&agent, "agent", "claude-code", "agent plugin to run: claude-code | codex")
	cmd.Flags().StringVar(&systemPromptFile, "system-prompt-file", "", "path to a file containing the orchestrator agent's system prompt")
	cmd.Flags().StringVar(&permissions, "permissions", "", "permissions mode: default | auto-review | full-access")
	_ = cmd.MarkFlagRequired("prompt")
	return cmd
}

func newSessionCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "session",
		GroupID: "core",
		Short:   "Manage running sessions.",
	}

	var project string
	list := &cobra.Command{
		Use:   "list",
		Short: "List running sessions.",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Fprintf(cmd.OutOrStdout(), "[stub] session list project=%q\n", project)
			return nil
		},
	}
	list.Flags().StringVar(&project, "project", "", "filter to a single project's absolute path")
	cmd.AddCommand(list)
	return cmd
}

func newStopCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "stop <sessionID>",
		GroupID: "core",
		Short:   "Terminate a running session.",
		Long: "Cleanly terminate a session: kill the zellij session, remove the worktree " +
			"(best-effort), and delete the row from ~/.better-ao/state.db.\n\n" +
			"Stopping a session id that has no row is a no-op (exit 0).",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Fprintf(cmd.OutOrStdout(), "[stub] stopped %s\n", args[0])
			return nil
		},
	}
}

func newSendCmd() *cobra.Command {
	var session, project string
	cmd := &cobra.Command{
		Use:     "send <message>",
		GroupID: "core",
		Short:   "Send a message to a session's agent.",
		Long:    "Send a message to a session's agent as if typed by the user.",
		Args:    cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Fprintf(cmd.OutOrStdout(), "[stub] send session=%s msg=%q\n", session, args[0])
			return nil
		},
	}
	cmd.Flags().StringVar(&session, "session", "", "target session id (required)")
	cmd.Flags().StringVar(&project, "project", "", "project id to disambiguate duplicate session ids")
	_ = cmd.MarkFlagRequired("session")
	return cmd
}

// plannedCmds mirrors plannedCommands from cmd/better-ao/main.go: verbs that
// exist in the Agent Orchestrator parity surface but aren't implemented yet.
// As real cobra commands they get help, completion, and "did you mean"
// suggestions for free.
func plannedCmds() []*cobra.Command {
	planned := []struct{ name, short string }{
		{"status", "Show sessions and runtime status"},
		{"batch-spawn", "Spawn sessions for multiple issues"},
		{"acknowledge", "Acknowledge session pickup"},
		{"report", "Declare a workflow transition"},
		{"review", "Manage AO-local reviewer runs"},
		{"open", "Open sessions or dashboard targets"},
		{"verify", "Mark an issue as verified or failed"},
		{"update", "Check for updates and upgrade"},
		{"setup", "Set up integrations with external services"},
		{"plugin", "Browse and manage AO plugins"},
		{"notify", "Work with configured notification targets"},
		{"project", "Manage portfolio projects"},
		{"events", "Query the activity event log"},
		{"config", "Read or write global AO config"},
	}
	cmds := make([]*cobra.Command, 0, len(planned))
	for _, p := range planned {
		cmds = append(cmds, &cobra.Command{
			Use:     p.name,
			GroupID: "planned",
			Short:   p.short + " [planned]",
			RunE: func(cmd *cobra.Command, args []string) error {
				return fmt.Errorf("command %q is part of the Agent Orchestrator parity surface, but is not implemented in better-ao yet", p.name)
			},
		})
	}
	return cmds
}
