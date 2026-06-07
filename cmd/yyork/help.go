package main

import (
	"fmt"
	"io"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// helpStyles bundles the lipgloss styles used to render CLI help. They are
// built from a renderer bound to the destination writer, so color is
// auto-detected: vivid on a TTY, plain when piped or captured in a test
// buffer (mirroring internal/logging.Banner).
type helpStyles struct {
	title   lipgloss.Style
	tagline lipgloss.Style
	header  lipgloss.Style
	note    lipgloss.Style
	cmd     lipgloss.Style
	flag    lipgloss.Style
	desc    lipgloss.Style
	dim     lipgloss.Style
}

func newHelpStyles(w io.Writer) helpStyles {
	re := lipgloss.NewRenderer(w)
	return helpStyles{
		title:   re.NewStyle().Bold(true).Foreground(lipgloss.Color("0")).Background(lipgloss.Color("212")).Padding(0, 1),
		tagline: re.NewStyle().Italic(true).Foreground(lipgloss.Color("246")),
		header:  re.NewStyle().Bold(true).Foreground(lipgloss.Color("212")),
		note:    re.NewStyle().Italic(true).Foreground(lipgloss.Color("241")),
		cmd:     re.NewStyle().Bold(true).Foreground(lipgloss.Color("86")),
		flag:    re.NewStyle().Foreground(lipgloss.Color("215")),
		desc:    re.NewStyle().Foreground(lipgloss.Color("252")),
		dim:     re.NewStyle().Foreground(lipgloss.Color("241")),
	}
}

// pad right-pads an ASCII string to width with spaces. The CLI surface is
// ASCII-only, so byte length equals display width here.
func pad(s string, width int) string {
	if len(s) >= width {
		return s
	}
	return s + strings.Repeat(" ", width-len(s))
}

func colWidth(rows [][2]string) int {
	w := 0
	for _, r := range rows {
		if len(r[0]) > w {
			w = len(r[0])
		}
	}
	return w
}

func printRootHelp(w io.Writer) {
	s := newHelpStyles(w)
	var b strings.Builder

	b.WriteByte('\n')
	b.WriteString("  " + s.title.Render("yyork") + "  " +
		s.tagline.Render("Local-first agent orchestration for parallel AI coding work.") + "\n\n")

	commands := [][2]string{
		{"yyork [options]", "Start the local dashboard and API server."},
		{"yyork spawn [options]", "Spawn a new agent session in the current project."},
		{"yyork session list [options]", "List running sessions."},
		{"yyork stop <sessionID>", "Terminate a running session."},
		{"yyork send [options] <message>", "Send a message to a session's agent."},
		{"yyork help [command]", "Show help for a command."},
	}
	cmdW := colWidth(commands)

	b.WriteString("  " + s.header.Render("USAGE") + "\n")
	for _, row := range commands {
		b.WriteString("    " + s.cmd.Render(pad(row[0], cmdW)) + "  " + s.desc.Render(row[1]) + "\n")
	}
	b.WriteByte('\n')

	b.WriteString("  " + s.header.Render("PLANNED") + "  " +
		s.note.Render("Agent Orchestrator parity surface") + "\n")
	planW := 0
	for _, command := range plannedCommandOrder {
		if len(command) > planW {
			planW = len(command)
		}
	}
	for _, command := range plannedCommandOrder {
		b.WriteString("    " + s.cmd.Render(pad(command, planW)) + "  " +
			s.desc.Render(plannedCommands[command]+".") + "\n")
	}
	b.WriteByte('\n')

	serverOpts := [][2]string{
		{"-addr string", "Address for the yyork local server."},
		{"-open", "Open the dashboard in the default browser."},
	}
	serverDefaults := map[string]string{
		"-addr string": "127.0.0.1:7331",
		"-open":        "true",
	}
	b.WriteString("  " + s.header.Render("SERVER OPTIONS") + "  " +
		s.note.Render("for `yyork` with no verb") + "\n")
	optW := colWidth(serverOpts)
	for _, row := range serverOpts {
		b.WriteString("    " + s.flag.Render(pad(row[0], optW)) + "  " +
			s.desc.Render(row[1]) + "  " + s.dim.Render("(default: "+serverDefaults[row[0]]+")") + "\n")
	}
	b.WriteByte('\n')

	globalOpts := [][2]string{
		{"-h, --help", "Show this help text."},
		{"-v, -V, --version", "Show version."},
	}
	b.WriteString("  " + s.header.Render("GLOBAL OPTIONS") + "\n")
	gW := colWidth(globalOpts)
	for _, row := range globalOpts {
		b.WriteString("    " + s.flag.Render(pad(row[0], gW)) + "  " + s.desc.Render(row[1]) + "\n")
	}
	b.WriteByte('\n')

	_, _ = io.WriteString(w, b.String())
}

// renderCommandHelp draws a styled help page for a single command. desc may
// contain blank lines to separate paragraphs; opts is a list of
// {flag, description} pairs.
func renderCommandHelp(w io.Writer, title, desc string, usage []string, opts [][2]string) {
	s := newHelpStyles(w)
	var b strings.Builder

	b.WriteByte('\n')
	b.WriteString("  " + s.title.Render(title) + "\n\n")

	for _, line := range strings.Split(desc, "\n") {
		if line == "" {
			b.WriteByte('\n')
			continue
		}
		b.WriteString("  " + s.desc.Render(line) + "\n")
	}
	b.WriteByte('\n')

	b.WriteString("  " + s.header.Render("USAGE") + "\n")
	for _, u := range usage {
		b.WriteString("    " + s.cmd.Render(u) + "\n")
	}

	if len(opts) > 0 {
		b.WriteByte('\n')
		b.WriteString("  " + s.header.Render("OPTIONS") + "\n")
		optW := colWidth(opts)
		for _, row := range opts {
			b.WriteString("    " + s.flag.Render(pad(row[0], optW)) + "  " + s.desc.Render(row[1]) + "\n")
		}
	}
	b.WriteByte('\n')

	_, _ = io.WriteString(w, b.String())
}

func printCommandHelp(command string, stdout io.Writer, stderr io.Writer) int {
	switch command {
	case "server", "":
		renderCommandHelp(stdout, "yyork",
			"Start the local dashboard and API server.",
			[]string{"yyork [options]"},
			[][2]string{
				{"-addr string", "Address for the yyork local server. Default: 127.0.0.1:7331"},
				{"-open", "Open the dashboard in the default browser. Default: true"},
				{"-h, --help", "Show this help text."},
			})
		return 0
	case "spawn":
		renderCommandHelp(stdout, "yyork spawn",
			"Spawn a new agent session in the current project directory.\n\n"+
				"The current directory must be a git repository. A per-session git worktree\n"+
				"is created on branch yyork/<sessionId>, the configured agent is\n"+
				"launched inside a fresh zellij session, and the session row is persisted to\n"+
				"~/.yyork/state.db once the zellij session confirms it is live.",
			[]string{"yyork spawn [options]"},
			[][2]string{
				{"--prompt string", "Prompt the orchestrator passes to the worker agent. Required."},
				{"--agent string", "Agent plugin to run: claude-code (default) | codex."},
				{"--system-prompt-file string", "Path to a file containing the orchestrator agent's system prompt."},
				{"--permissions string", "Permissions mode: default | accept-edits | auto | bypass-permissions."},
				{"-h, --help", "Show this help text."},
			})
		return 0
	case "session":
		renderCommandHelp(stdout, "yyork session",
			"Manage running sessions.",
			[]string{"yyork session list [options]"},
			[][2]string{
				{"--project string", "Filter to a single project's absolute path."},
				{"-h, --help", "Show this help text."},
			})
		return 0
	case "stop":
		renderCommandHelp(stdout, "yyork stop",
			"Cleanly terminate a session: kill the zellij session, remove the\n"+
				"worktree (best-effort), and delete the row from ~/.yyork/state.db.\n\n"+
				"Stopping a session id that has no row is a no-op (exit 0).",
			[]string{"yyork stop <sessionID>"},
			[][2]string{
				{"-h, --help", "Show this help text."},
			})
		return 0
	case "send":
		renderCommandHelp(stdout, "yyork send",
			"Send a message to a session's agent as if typed by the user.",
			[]string{"yyork send --session <id> [--project <id>] <message>"},
			[][2]string{
				{"-session string", "Target session id. Required."},
				{"-project string", "Project id, to disambiguate duplicate session ids across projects."},
				{"-h, --help", "Show this help text."},
			})
		return 0
	default:
		if summary, ok := plannedCommands[command]; ok {
			renderCommandHelp(stdout, "yyork "+command,
				summary+".\n\nStatus: planned Agent Orchestrator parity command.",
				[]string{"yyork " + command + "  [planned]"},
				nil)
			return 0
		}

		fmt.Fprintf(stderr, "Unknown command: %s\n", command)
		fmt.Fprintln(stderr, "Run `yyork --help` for usage.")
		return 1
	}
}
