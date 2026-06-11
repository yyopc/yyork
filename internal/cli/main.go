// Package cli owns yyork's command tree and presentation layer.
package cli

import (
	"context"
	"image/color"
	"io/fs"
	"os"
	"os/signal"
	"syscall"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/fang"

	"github.com/yyopc/yyork/internal/app"
	"github.com/yyopc/yyork/internal/durabilityprovider"
)

// Version is overridden by release builds with:
//
//	-X github.com/yyopc/yyork/internal/cli.Version=<version>
var Version = "0.0.1"

// Main starts yyork and exits the process with the command result.
func Main(webFS fs.FS) {
	// Pin a short Zellij IPC socket directory before any verb runs. Both the
	// session-create path and the terminal-attach path shell out to zellij and
	// inherit this process's environment, so setting it here once keeps their
	// socket paths under the Unix-domain length limit (macOS's $TMPDIR is too
	// long). See durabilityprovider.ConfigureSocketDir.
	durabilityprovider.ConfigureSocketDir()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// fang renders help/usage/errors/version/completion; tests drive
	// newRootCmd directly, bypassing this presentation layer.
	if err := fang.Execute(
		ctx,
		newRootCmd(app.Run, webFS),
		fang.WithVersion(Version),
		fang.WithColorSchemeFunc(brand),
	); err != nil {
		os.Exit(1)
	}
}

// brand maps yyork's lipgloss palette — the same colors the server banner
// (internal/logging) and the previous hand-rolled help renderer used — onto
// fang's ColorScheme, so the CLI keeps its identity: black-on-pink title
// badge, cyan commands, amber flags, dim comments.
func brand(_ lipgloss.LightDarkFunc) fang.ColorScheme {
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
		ErrorHeader:    [2]color.Color{black, pink}, // black on pink, like the title badge
		ErrorDetails:   text,
	}
}
