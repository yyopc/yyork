// Package zellijconfig manages the zellij config file yyork hands to the
// zellij sessions it launches.
//
// The file lives at ~/.yyork/zellij/config.kdl. Its job is to make zellij
// invisible: a yyork session must look like a bare terminal running the agent
// CLI, not like a multiplexer. To that end the config clears every default
// keybinding (all keystrokes pass through to the agent; nothing can switch
// zellij modes, detach, or kill the session from the keyboard), turns off pane
// frames, and suppresses the startup-tips / release-notes floating panes and
// mouse hover effects. The launch layout (internal/durabilityprovider)
// completes the picture by omitting the tab-bar and status-bar plugin panes.
// Session control stays fully available to yyork itself via `zellij action`
// CLI commands, which do not depend on keybindings.
//
// The "yyork" theme covers whatever little zellij still draws (the brief
// loading screen, search prompts). It is defined in terms of ANSI palette
// indices (0-15) rather than RGB values. yyork's web terminal remaps those
// indices to its own light/dark palette (see web/src/styles/app.css,
// --terminal-color-*), so any residual zellij-drawn UI follows the active
// yyork theme automatically, from a single source of truth.
//
// zellij applies its config from the *attaching* client and has no
// "merge onto the user's config" flag (--config replaces the config file,
// merged only over zellij's defaults). So yyork passes --config pointing at
// this file on both the create and the attach invocations.
package zellijconfig

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/yyopc/yyork/internal/paths"
)

// configKDL is the full contents of the managed config file. Bumping this
// string causes Ensure to rewrite existing user files on the next call.
const configKDL = `// yyork zellij config — managed by yyork, do not edit.
//
// yyork sessions must be indistinguishable from a bare terminal running the
// agent CLI. Everything zellij-shaped is switched off here; yyork drives the
// session through "zellij action" CLI commands, which need no keybindings.

// Pass every keystroke through to the agent. Also removes the footguns:
// Ctrl+Q (kill session), Ctrl+O d (detach), and all mode switching.
keybinds clear-defaults=true {
}

// No frame or title around the lone agent pane.
pane_frames false

// Zellij 0.42+ opens floating startup-tips / release-notes panes that would
// instantly give the multiplexer away.
show_startup_tips false
show_release_notes false

// No hover highlights or alt-click pane grouping (zellij 0.43+).
advanced_mouse_actions false

// Colors are ANSI palette indices (0-15), not RGB. yyork's web terminal
// remaps 0-15 to its own light/dark palette (web/src/styles/app.css,
// --terminal-color-*), so anything zellij still draws (loading screen,
// search prompts) follows the active yyork theme.
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
`

// Path returns the path to yyork's managed zellij config file
// (~/.yyork/zellij/config.kdl). It does not create or read the file.
func Path() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("zellijconfig: resolve home: %w", err)
	}
	return filepath.Join(home, paths.DataDirName, "zellij", "config.kdl"), nil
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
