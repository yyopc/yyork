package main

import (
	"embed"
	"errors"
	"io/fs"
)

// dashboardEmbed bundles the built dashboard into the Go binary at compile
// time. The pattern requires `cmd/better-ao/dashboard/` to exist with at
// least one file — the committed `.gitkeep` satisfies that even on a fresh
// checkout. `pnpm backend:build` runs `pnpm web:build` first, then mirrors
// `web/dist/*` into this directory, so a real built dashboard is present
// before `go build` runs.
//
//go:embed all:dashboard
var dashboardEmbed embed.FS

// dashboardFS returns the embedded dashboard filesystem rooted at the
// `dashboard/` prefix, plus a boolean reporting whether the embed contains
// a real built dashboard (i.e. an `index.html`). When the boolean is
// false, the server falls back to a "you didn't run web:build" placeholder.
func dashboardFS() (fs.FS, bool) {
	sub, err := fs.Sub(dashboardEmbed, "dashboard")
	if err != nil {
		return nil, false
	}
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return sub, false
		}
		return nil, false
	}
	return sub, true
}
