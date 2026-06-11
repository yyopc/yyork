// Package zellijconfig manages the zellij config file yyork hands to the
// zellij sessions it launches.
//
// The file lives at ~/.yyork/zellij/config.kdl and selects a "yyork" color
// theme. Everything else falls back to zellij's built-in defaults — the layout
// and keybindings are unchanged. The point is to color zellij's chrome (tab bar,
// status bar, pane frame borders) to match yyork while preserving Zellij's
// native segmented UI.
//
// The theme is defined in terms of ANSI palette indices (0-15) rather than RGB
// values. yyork's web terminal remaps those indices to its own light/dark
// palette (see web/src/styles/app.css, --terminal-color-*), so zellij's chrome
// follows the active yyork theme automatically, from a single source of truth.
//
// zellij applies a theme from the *attaching* client's config and has no
// "merge onto the user's config" flag (--config replaces the config file,
// merged only over zellij's defaults). So yyork passes --config pointing at
// this file on both the create and the attach invocations.
package zellijconfig

import (
	"fmt"
	"os"
	"path/filepath"
)

// configKDL is the full contents of the managed config file. Bumping this
// string causes Ensure to rewrite existing user files on the next call.
const configKDL = `// yyork zellij theme — managed by yyork, do not edit.
//
// Colors are ANSI palette indices (0-15), not RGB. yyork's web terminal
// remaps 0-15 to its own light/dark palette (web/src/styles/app.css,
// --terminal-color-*), so zellij's chrome follows the active yyork theme.
// Everything else falls back to zellij defaults. simplified_ui is pinned false
// so Zellij's native segmented tab/status UI is preserved even when yyork is
// launched from a sparse environment.
themes {
    yyork {
        fg 15
        bg 0
        black 0
        red 1
        green 2
        yellow 3
        blue 4
        magenta 5
        cyan 6
        white 7
        orange 3
    }
}

theme "yyork"

simplified_ui false
`

// Path returns the path to yyork's managed zellij config file
// (~/.yyork/zellij/config.kdl). It does not create or read the file.
func Path() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("zellijconfig: resolve home: %w", err)
	}
	return filepath.Join(home, ".yyork", "zellij", "config.kdl"), nil
}

// Ensure writes the managed config to Path() when the file is missing or its
// contents differ from the embedded template, then returns the path. It is
// idempotent and cheap (a stat plus a small read and compare), so callers may
// invoke it on a hot path such as a per-poll workspace build.
func Ensure() (string, error) {
	path, err := Path()
	if err != nil {
		return "", err
	}

	if existing, err := os.ReadFile(path); err == nil && string(existing) == configKDL {
		return path, nil
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("zellijconfig: create dir: %w", err)
	}
	if err := os.WriteFile(path, []byte(configKDL), 0o644); err != nil {
		return "", fmt.Errorf("zellijconfig: write config: %w", err)
	}
	return path, nil
}
