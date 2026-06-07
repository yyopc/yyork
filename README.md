# yyork

Local-first orchestration for parallel AI coding agents.

yyork spawns coding agents into isolated, durable workspaces and lets you
supervise them from one dashboard. Each session runs in its own git worktree
inside a [Zellij](https://zellij.dev) session, so agents work in parallel
without colliding, survive a browser or server restart, and stay attachable
from any terminal.

## Requirements

- **Go 1.25+** and **Node.js 22+ / pnpm** — server, CLI, and dashboard build
- **[Zellij](https://zellij.dev)** — hosts the durable agent sessions
- **git** — sessions run in per-session worktrees
- **An agent CLI on your `PATH`** — [Claude Code](https://www.claude.com/product/claude-code) (default) or [Codex](https://github.com/openai/codex)
- **Nix** with flakes — optional, for the dev shell

## Install

```bash
pnpm install
pnpm backend:build   # builds + embeds the dashboard, compiles ./yyork
```

The resulting `./yyork` binary serves the dashboard from inside itself — no
separate web server at runtime.

## Quickstart

```bash
./yyork                                  # serve dashboard + API on 127.0.0.1:7331, open browser

cd ~/Projects/my-app                     # any git repo
yyork spawn --prompt "add a health-check endpoint"

zellij attach <sessionId>                # or just click the session in the dashboard
yyork session list                       # show running sessions
yyork stop <sessionId>                   # kill the session, remove its worktree + branch
```

Run `yyork` with no arguments to serve — there is no `start` subcommand (use
`-addr` to change the bind address, `-open=false` to skip the browser). `spawn`
creates a `yyork/<sessionId>` worktree off your default branch, launches the
agent, and the dashboard updates live over server-sent events.

**`spawn` flags:** `--prompt` (required) · `--agent claude-code|codex` ·
`--permissions default|accept-edits|auto|bypass-permissions` ·
`--system-prompt-file <path>`

State lives in `~/.yyork/` — `state.db` (running sessions) and
`worktrees/<sessionId>/`.

> **Capturing work:** there's no in-app review or merge yet, and both `stop` and
> a reboot delete the `yyork/<sessionId>` branch. Push or merge before you stop —
> have the agent run `git push -u origin yyork/<sessionId>` or `gh pr create`. (A
> deleted branch is recoverable via `git reflog` for a while, but don't rely on it.)

## Development

For dashboard work, run the dev stack instead of the binary — Vite serves with
hot reload and proxies `/api` to the Go server:

```bash
nix develop && pnpm install && yyork   # Vite dashboard on :3000 + Go API
# or, without Nix:
pnpm dev
```

Set `VITE_PORT` in `web/.env` to change the dashboard port; if the backend port
is taken, the launcher picks the next free one.

## Project layout

- `cmd/yyork` — CLI entrypoint (`spawn`, `session list`, `stop`, bare server) + embedded dashboard
- `internal/session` — the spawn engine: `Spawn` / `Stop` / `Reconcile`
- `internal/server` — HTTP API, `/api/sessions`, the `/api/events` SSE stream
- `internal/store` — SQLite store (`~/.yyork/state.db`) with goose migrations
- `internal/durabilityprovider` — Zellij create / kill / attach
- `internal/plugin/agent` — agent interface + the Claude Code and Codex plugins
- `internal/worktree`, `internal/events` — per-session worktrees, in-process bus
- `web` — React + Vite dashboard

A session row exists in `state.db` exactly while the session is alive; liveness
is derived by asking Zellij on read (plus a sweep at boot) — no polling.

## Testing

```bash
pnpm test     # backend + CLI + frontend tests
pnpm lint     # backend tests + frontend lint
pnpm e2e      # Playwright e2e against the dashboard
```

`pnpm e2e:live-terminal` is a non-mutating, real-runtime terminal smoke test
against a throwaway stack (it needs a live agent session with terminal support).
Many variants exist — `:reuse`, `:reconnect`, `:soak`, `:switch`, `:watch`, and
combinations — run `pnpm run` to list them.
