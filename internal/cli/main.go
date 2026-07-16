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
var Version = "0.1.0-alpha.9"

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

// brand maps the semantic colors from internal/web/src/styles/app.css onto
// fang's ColorScheme. Lipgloss does not accept CSS OKLCH colors, so the
// selected tokens are represented here by their sRGB equivalents. Accent,
// sidebar, chart, and terminal-specific palettes are intentionally excluded.
func brand(c lipgloss.LightDarkFunc) fang.ColorScheme {
	foreground := c(lipgloss.Color("#09090b"), lipgloss.Color("#fafafa"))
	primary := c(lipgloss.Color("#18181b"), lipgloss.Color("#fafafa"))
	muted := c(lipgloss.Color("#f4f4f5"), lipgloss.Color("#18181b"))
	mutedForeground := c(lipgloss.Color("#71717b"), lipgloss.Color("#9f9fa9"))
	destructive := c(lipgloss.Color("#e7000b"), lipgloss.Color("#c10007"))
	destructiveForeground := c(lipgloss.Color("#fef2f2"), lipgloss.Color("#ffffff"))

	return fang.ColorScheme{
		Base:           foreground,
		Title:          primary,
		Description:    foreground,
		Codeblock:      muted,
		Program:        primary,
		DimmedArgument: mutedForeground,
		Comment:        mutedForeground,
		Flag:           primary,
		FlagDefault:    mutedForeground,
		Command:        primary,
		QuotedString:   primary,
		Argument:       foreground,
		Help:           mutedForeground,
		Dash:           mutedForeground,
		ErrorHeader:    [2]color.Color{destructiveForeground, destructive},
		ErrorDetails:   destructive,
	}
}
