# Agent workflow

- User will assign one PRD at a time to an agent to implement. All the PRDs are available in the `./prds` dir.
- At any time if you think you could do a better job if a CLI tool was available to you and it would take you lesser tokens to do the task in presence of that tool, explicitly ask user to install it. Do not install it directly on your own as there are security related issues regarding this way of installation.

# Local development

- For yyork frontend/app verification and browser debugging, prefer d3k when it is installed:
  - Agent path: `pnpm d3k:agent` (or equivalent `d3k --no-agent --no-tui -t --no-portless --command "pnpm run dev" --app-url https://yyork.localhost --startup-timeout 120`).
  - Human/TUI path: `pnpm d3k:dev`.
  - Check readiness with `d3k status --json`; reuse an already-running project session. Do not also run bare `pnpm dev` alongside d3k.
  - Use `d3k errors --context`, `d3k logs`, and `d3k agent-browser` for unified browser/server evidence.
  - Browser binary: set once in `~/.d3k.json` as `"browser": "/path/to/Chrome-compatible binary"`. Override per run with `d3k --browser <path>`. d3k needs real Chromium **page** CDP targets (Google Chrome, Chrome for Testing, Chromium). Dia/Arc (ArcCore) can launch but only exposes extension service workers, so `browserConnected` stays false with Dia.
- If d3k is unavailable, start the app stack from the repo root with `pnpm dev` (`dev:stack` through portless). After the ready banner, open `https://yyork.localhost`.
- Optional surfaces are opt-in (not started by `pnpm dev` or d3k):
  - Docs: `pnpm dev:docs` → `https://docs.yyork.localhost` (source: `internal/docs/content/docs/`)
  - Design mock: `pnpm dev:mock` → `https://mock.yyork.localhost`
  - Storybook: `pnpm dev:sb` → `https://storybook.yyork.localhost`
- Do not open or report `http://127.0.0.1:3000` or `http://localhost:3000` for normal yyork frontend verification. Treat raw Vite ports as implementation details for explicit non-portless debugging or isolated test fixtures.
- yyork owns Portless names (`yyork`, `docs.yyork`, `mock.yyork`, `storybook.yyork`). d3k scripts use `--no-portless` so they do not invent a second Portless URL.

# Release and installability

- Run `pnpm release:check` before release packaging changes. It builds the app, stages the native package for the current OS/CPU, packs the `@yyopc/yyork` wrapper plus the unscoped `yyork` alias, installs them with `go` intentionally unavailable, and runs the installed `yyork` binary.
- Distribution builds run in GitHub Actions. The release workflow uses GoReleaser to build stripped platform-specific `yyork` archives and publish GitHub release assets. The npm packaging job wraps those release artifacts into native npm packages with bundled Zellij, smoke-tests installability with `go` unavailable, uploads npm tarballs, and publishes the native packages before the `@yyopc/yyork` wrapper and the final `yyork` alias package.
- The flake package should install the published native release artifact for the current platform instead of running `go run .`; `nix profile add github:yyopc/yyork` is expected to install a prebuilt yyork binary with bundled Zellij.
