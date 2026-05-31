// Package logging configures better-ao's structured, colorized logging.
//
// It installs a charmbracelet/log logger as the default slog handler, so the
// rest of the codebase keeps calling slog.Info/Warn/Error while output is
// rendered with highlighted level badges and key/value styling. Color is
// auto-detected from the destination writer (enabled on a TTY, plain when
// piped) and honors NO_COLOR.
package logging

import (
	"io"
	"log/slog"
	"os"
	"strings"

	charm "github.com/charmbracelet/log"
	"github.com/charmbracelet/lipgloss"
)

// Setup builds the colorized logger and installs it as the slog default,
// writing to w. Verbosity is read from BETTER_AO_LOG_LEVEL
// (debug|info|warn|error), defaulting to info. The returned logger is the
// same one wired into slog, handy for callers that want to log directly.
func Setup(w io.Writer) *charm.Logger {
	logger := charm.NewWithOptions(w, charm.Options{
		ReportTimestamp: true,
		TimeFormat:      "15:04:05.000",
		Level:           levelFromEnv(),
	})
	slog.SetDefault(slog.New(logger))
	return logger
}

func levelFromEnv() charm.Level {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("BETTER_AO_LOG_LEVEL"))) {
	case "debug":
		return charm.DebugLevel
	case "warn", "warning":
		return charm.WarnLevel
	case "error":
		return charm.ErrorLevel
	default:
		return charm.InfoLevel
	}
}

// Banner prints a highlighted startup banner to w: a title badge followed by
// aligned "➜ label  value" rows (Vite-style). Color is detected from w, so
// the banner degrades to plain text when w is not a color-capable terminal.
func Banner(w io.Writer, title string, rows [][2]string) {
	re := lipgloss.NewRenderer(w)

	badge := re.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("0")).
		Background(lipgloss.Color("212")).
		Padding(0, 1)
	arrow := re.NewStyle().Foreground(lipgloss.Color("212"))
	label := re.NewStyle().Foreground(lipgloss.Color("241"))
	value := re.NewStyle().Foreground(lipgloss.Color("86")).Underline(true)

	width := 0
	for _, row := range rows {
		if len(row[0]) > width {
			width = len(row[0])
		}
	}

	var b strings.Builder
	b.WriteString("\n  ")
	b.WriteString(badge.Render(title))
	b.WriteByte('\n')
	for _, row := range rows {
		name := row[0] + strings.Repeat(" ", width-len(row[0]))
		b.WriteString("  ")
		b.WriteString(arrow.Render("➜"))
		b.WriteString("  ")
		b.WriteString(label.Render(name))
		b.WriteString("  ")
		b.WriteString(value.Render(row[1]))
		b.WriteByte('\n')
	}
	b.WriteByte('\n')

	_, _ = io.WriteString(w, b.String())
}
