// Command yyork starts the local dashboard/API server and drives the
// agent-orchestration verbs.
package main

import (
	"embed"
	"errors"
	"io/fs"

	"github.com/yyopc/yyork/internal/cli"
)

// appEmbed bundles the built web app into the Go binary at compile time. Vite
// builds into `internal/web/build/` (see internal/web/vite.config.ts); the
// committed `internal/web/build/.gitkeep` keeps this pattern matching on a fresh
// checkout before any web build has run.
//
//go:embed all:internal/web/build
var appEmbed embed.FS

// appFS returns the embedded web app filesystem rooted at `internal/web/build/`,
// plus a boolean reporting whether the embed contains a real built app.
func appFS() (fs.FS, bool) {
	sub, err := fs.Sub(appEmbed, "internal/web/build")
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
	webFS, _ := appFS()
	cli.Main(webFS)
}
