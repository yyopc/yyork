// Command yyork starts the local dashboard/API server and drives the
// agent-orchestration verbs.
package main

import (
	"embed"
	"errors"
	"io/fs"

	"github.com/yyopc/yyork/internal/cli"
)

// dashboardEmbed bundles the built dashboard into the Go binary at compile
// time. Vite builds into `cmd/yyork/dashboard/app/` (see web/vite.config.ts);
// the committed `cmd/yyork/dashboard/.gitkeep` keeps this pattern matching on a
// fresh checkout before any web build has run.
//
//go:embed all:cmd/yyork/dashboard
var dashboardEmbed embed.FS

// dashboardFS returns the embedded dashboard filesystem rooted at the
// `cmd/yyork/dashboard/app/` prefix, plus a boolean reporting whether the embed
// contains a real built dashboard.
func dashboardFS() (fs.FS, bool) {
	sub, err := fs.Sub(dashboardEmbed, "cmd/yyork/dashboard/app")
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

func main() {
	webFS, _ := dashboardFS()
	cli.Main(webFS)
}
