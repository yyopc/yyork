package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/yyovil/yyork/internal/ao"
	"github.com/yyovil/yyork/internal/app"
	"github.com/yyovil/yyork/internal/durabilityprovider"
	"github.com/yyovil/yyork/internal/logging"
)

var version = "0.0.1"

func main() {
	// Pin a short Zellij IPC socket directory before any verb runs. Both the
	// session-create path and the terminal-attach path shell out to zellij and
	// inherit this process's environment, so setting it here once keeps their
	// socket paths under the Unix-domain length limit (macOS's $TMPDIR is too
	// long). See durabilityprovider.ConfigureSocketDir.
	durabilityprovider.ConfigureSocketDir()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	os.Exit(runCLI(ctx, os.Args[1:], os.Stdout, os.Stderr, app.Run))
}

type appRunner func(context.Context, app.Config) error

func runCLI(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer, runApp appRunner) int {
	command, commandArgs := splitCommand(args)

	switch command {
	case "help":
		return runHelp(commandArgs, stdout, stderr)
	case "version":
		fmt.Fprintln(stdout, version)
		return 0
	case "":
		// No verb: start the local server. `yyork start` /
		// `yyork dashboard` no longer exist as user-facing verbs.
		return runServer(ctx, commandArgs, stdout, stderr, runApp)
	case "spawn":
		return runSpawn(ctx, commandArgs, stdout, stderr)
	case "session":
		return runSession(ctx, commandArgs, stdout, stderr)
	case "stop":
		return runStop(ctx, commandArgs, stdout, stderr)
	case "send":
		return runSend(ctx, commandArgs, stdout, stderr)
	default:
		if _, ok := plannedCommands[command]; ok {
			fmt.Fprintf(stderr, "Command %q is part of the Agent Orchestrator parity surface, but is not implemented in yyork yet.\n", command)
			fmt.Fprintln(stderr, "Run `yyork --help` for implemented commands.")
			return 1
		}
		fmt.Fprintf(stderr, "Unknown command: %s\n", command)
		fmt.Fprintln(stderr, "Run `yyork --help` for usage.")
		return 1
	}
}

func splitCommand(args []string) (string, []string) {
	if len(args) == 0 {
		return "", nil
	}

	first := args[0]
	switch first {
	case "-h", "--help":
		return "help", nil
	case "-v", "-V", "--version":
		return "version", nil
	}

	if strings.HasPrefix(first, "-") {
		// Leading flags with no verb: treat as server-start with options.
		return "", args
	}

	return first, args[1:]
}

func runHelp(args []string, stdout io.Writer, stderr io.Writer) int {
	if len(args) > 1 {
		fmt.Fprintf(stderr, "Too many arguments for help: %s\n", strings.Join(args[1:], " "))
		fmt.Fprintln(stderr, "Run `yyork --help` for usage.")
		return 1
	}

	if len(args) == 1 {
		return printCommandHelp(args[0], stdout, stderr)
	}

	printRootHelp(stdout)
	return 0
}

func runServer(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer, runApp appRunner) int {
	const command = "server"
	var addr string
	var openBrowser bool

	if hasHelpFlag(args) {
		_ = printCommandHelp(command, stdout, stderr)
		return 0
	}

	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&addr, "addr", "127.0.0.1:7331", "address for the yyork local server")
	flags.BoolVar(&openBrowser, "open", true, "open the dashboard in the default browser")
	flags.Usage = func() {
		_ = printCommandHelp(command, stderr, stderr)
	}

	if err := flags.Parse(args); err != nil {
		return 1
	}

	if flags.NArg() > 0 {
		fmt.Fprintf(stderr, "Unexpected argument for %s: %s\n", command, flags.Arg(0))
		fmt.Fprintln(stderr, "Run `yyork help "+command+"` for usage.")
		return 1
	}

	// Install the colorized, structured slog handler now that we know this
	// is the server-start path. Subcommands (spawn/session/stop/send) print
	// directly via fmt and intentionally keep the plain stdout/stderr.
	logging.Setup(stderr)

	// In dev mode the wrapper script (scripts/yyork.mjs) runs the Vite
	// dev server and proxies API requests to us — the dashboard isn't
	// served from this Go process at all. In single-binary mode the
	// embedded FS (cmd/yyork/dashboard) is the source. We pass both
	// and let the server prefer whichever is populated.
	webFS, _ := dashboardFS()
	err := runApp(ctx, app.Config{
		Addr:        addr,
		OpenBrowser: openBrowser,
		WebFS:       webFS,
	})
	if err != nil && !errors.Is(err, context.Canceled) {
		slog.Error("yyork exited with an error", "error", err)
		return 1
	}

	return 0
}

func runSend(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer) int {
	if hasHelpFlag(args) {
		_ = printCommandHelp("send", stdout, stderr)
		return 0
	}

	var sessionID string
	var projectID string

	flags := flag.NewFlagSet("send", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&sessionID, "session", "", "target session id (required)")
	flags.StringVar(&projectID, "project", "", "project id to disambiguate duplicate session ids")
	flags.Usage = func() {
		_ = printCommandHelp("send", stderr, stderr)
	}

	if err := flags.Parse(args); err != nil {
		return 1
	}

	if strings.TrimSpace(sessionID) == "" {
		fmt.Fprintln(stderr, "send: --session is required")
		fmt.Fprintln(stderr, "Run `yyork help send` for usage.")
		return 1
	}

	message := strings.TrimSpace(strings.Join(flags.Args(), " "))
	if message == "" {
		fmt.Fprintln(stderr, "send: a message argument is required")
		fmt.Fprintln(stderr, "Run `yyork help send` for usage.")
		return 1
	}

	workspace, err := ao.NewWorkspaceProvider().Workspace(ctx)
	if err != nil {
		fmt.Fprintf(stderr, "send: failed to read workspace: %v\n", err)
		return 1
	}

	registry := durabilityprovider.NewDefaultRegistry()
	if err := durabilityprovider.SendToSession(ctx, registry, workspace, projectID, sessionID, message); err != nil {
		fmt.Fprintf(stderr, "send: %v\n", err)
		return 1
	}

	fmt.Fprintf(stdout, "Sent message to session %s.\n", sessionID)
	return 0
}

func hasHelpFlag(args []string) bool {
	for _, arg := range args {
		if arg == "-h" || arg == "--help" {
			return true
		}
	}
	return false
}

// plannedCommandOrder/plannedCommands list verbs we haven't shipped yet.
// They're rendered in help with a "[planned]" marker so users can see the
// roadmap surface. Implemented verbs (server/spawn/session/stop/send) are
// not in this list — they have first-class entries in printRootHelp and
// real handlers in runCLI.
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
	"completion",
	"events",
	"config",
	"config-help",
}

var plannedCommands = map[string]string{
	"acknowledge":     "Acknowledge session pickup",
	"batch-spawn":     "Spawn sessions for multiple issues",
	"completion":      "Generate shell completion scripts",
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
