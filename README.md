# yyork

Local-first agent orchestration for parallel AI coding work.

yyork spawns AI coding agents into isolated, durable workspaces and lets
you supervise them from one dashboard. Each session runs in its own git
worktree inside a [Zellij](https://zellij.dev) session, so agents work in
parallel without stepping on each other, survive your browser closing or the
server restarting, and stay attachable from any terminal.

## Requirements

- **Go 1.25+** — the server and CLI
- **Node.js 22+** and **pnpm** — the dashboard build
- **[Zellij](https://zellij.dev)** — the durability layer that hosts agent sessions
- **An agent CLI** — [Codex](https://github.com/openai/codex) is the only one wired in v1, and must be on your `PATH`
- **git** — sessions run in per-session worktrees
- Nix with flakes enabled — optional, but the dev tooling assumes it

## Install

Build the single binary (it embeds the dashboard, so this is the only artifact you need):

```bash
pnpm install
pnpm backend:build      # builds the dashboard, embeds it, compiles ./yyork
```

`pnpm backend:build` chains three steps: `pnpm web:build` → copy `web/dist`
into the embed dir → `go build`. The resulting `./yyork` serves the
dashboard from inside the binary — no separate web server needed at runtime.

## Using yyork

State lives in `~/.yyork/`:

- `state.db` — a SQLite database of currently-running sessions
- `worktrees/<sessionId>/` — one git worktree per session

### 1. Start the server

```bash
./yyork              # starts the dashboard + API on 127.0.0.1:7331 and opens your browser
```

Run it with no arguments — there is no `start` subcommand. Use `-addr` to
change the bind address and `-open=false` to skip opening the browser.

### 2. Spawn an agent

From inside the project you want the agent to work on (it must be a git repo):

```bash
cd ~/Projects/my-app
yyork spawn --prompt "add a health-check endpoint"
```

This prints a session id (a ULID), creates a `yyork/<sessionId>` git
worktree branched from your repo's default branch, launches the agent inside a
fresh Zellij session, and the dashboard shows the new session within
milliseconds (live, over server-sent events — no polling).

Flags:

- `--prompt <text>` — the prompt the orchestrator passes to the worker agent (required)
- `--system-prompt-file <path>` — a file containing the agent's system prompt
- `--permissions <mode>` — `default` | `auto-review` | `full-access`

### 3. Watch it work

Click the session in the dashboard for a live browser terminal, or attach from
any shell:

```bash
zellij attach <sessionId>
```

The session survives your browser closing, the yyork server restarting, and
the agent process exiting (a keep-alive shell holds the pane open so you can
read post-mortem output).

### 4. List and stop

```bash
yyork session list                 # show running sessions
yyork session list --project <abs-path>   # filter to one project
yyork stop <sessionId>             # kill the Zellij session, remove the worktree + branch, drop the row
```

### Capturing an agent's work

In v1 there is no in-app review or merge yet — you capture work the normal git
way. **Get the work onto your remote before you `stop` a session or reboot**,
because both teardown paths delete the `yyork/<sessionId>` branch:

- have the agent run `gh pr create` / `git push -u origin yyork/<sessionId>`, or
- merge the branch into your main line yourself.

A deleted branch is recoverable via `git reflog` for a while, but treat
"pushed or merged before stop" as the rule.

## Development

For iterating on the dashboard itself, run the dev stack instead of the binary —
Vite serves the dashboard with hot reload and proxies `/api` to the Go server:

```bash
nix develop
pnpm install
yyork        # the Nix-shell wrapper: Vite dashboard on :3000 + Go API
```

Without the Nix shell, use the package script:

```bash
pnpm dev
```

The dashboard runs on `http://localhost:3000`. Set `VITE_PORT` in `web/.env` to
use another port. If the default backend port is in use, the launcher picks the
next available one and points Vite at it. In dev mode the dashboard is served by
Vite, not the embedded copy in the binary.

## Architecture notes

A session is one running agent. A row exists in `state.db` exactly while the
session is alive — `stop` (or a reconcile that finds the Zellij session gone)
deletes it. There is no separate "running" index file: liveness is derived by
asking Zellij, lazily, when something reads state (plus a one-time sweep on
server boot). No polling, no background ticker.

The terminal attaches to a session's Zellij runtime with `zellij attach
<sessionId>`; the websocket URL is session-scoped so reconnecting never kills
the underlying agent. Zellij is the only durability provider in v1.

## Verification

Useful checks while iterating on the terminal path:

```bash
pnpm lint:ts
pnpm cli:test
pnpm e2e
nix develop --command go test ./internal/session ./internal/server ./internal/ao ./internal/terminal
pnpm e2e:live-terminal
pnpm e2e:live-terminal:reuse
pnpm e2e:live-terminal:reuse:reconnect
node web/e2e/live-terminal-smoke.mjs --reconnect --reconnects=2
node web/e2e/live-terminal-smoke.mjs --soak --soak-ms=300000
node web/e2e/live-terminal-smoke.mjs --switch --switch-target=ao-83
pnpm e2e:live-terminal:watch
pnpm e2e:live-terminal:switch:watch
pnpm e2e:live-terminal:soak:watch
pnpm e2e:live-terminal:reuse:watch
pnpm e2e:live-terminal:reuse:reconnect:watch
pnpm e2e:live-terminal:reuse:switch:watch
pnpm e2e:live-terminal:reuse:soak:watch
pnpm e2e:live-terminal:manual
pnpm e2e:live-terminal:manual-soak
```

`pnpm e2e:live-terminal` is the real-runtime smoke. It starts the local stack on OS-assigned temporary ports, reads active AO worker metadata, opens the Terminal tab with Playwright, confirms the terminal websocket is project-scoped, waits for real terminal frames, verifies browser resize sends a valid terminal resize control frame, then verifies the Zellij worker session survived the browser attachment. It requires at least one active AO worker with terminal support and does not send keyboard input to the worker. Pass `--backend-port=<port>` and `--web-port=<port>` to the underlying script only when you need fixed ports.

`pnpm e2e:live-terminal:reuse` runs the same real-runtime smoke against an already-running manual dev stack. By default it checks `http://127.0.0.1:7331` and `http://localhost:3000`; pass `--backend-origin=<origin>` and `--web-origin=<origin>` to the underlying script for a different stack. Use the `reuse:*:watch` variants when you want to watch the already-running manual stack instead of a throwaway stack.

`pnpm e2e:live-terminal:reconnect` repeats that attachment through browser page reopens and fails if any reattached terminal websocket loses project scoping, stops receiving frames, stops sending resize control frames, or kills the Zellij worker session. Use `--reconnects=<count>` when running the underlying script directly.

`pnpm e2e:live-terminal:soak` keeps that real terminal attachment open and fails if the terminal websocket closes, the terminal UI disappears, browser page errors occur, or a Zellij worker session stops existing. It is still non-mutating: it observes terminal frames but does not type into the worker. Use `--soak-ms=<milliseconds>` when running the underlying script directly.

`pnpm e2e:live-terminal:switch` opens the selected worker terminal, switches the UI to another terminal-supported AO worker, confirms the new websocket is project-scoped, receiving real frames, and sending resize control frames, then verifies both Zellij worker sessions are still alive. Pass `--switch-target=<worker>` to force the target worker when running the underlying script directly; otherwise the script picks the next available terminal-supported worker.

Use the `:watch` variants when you want to see the same real-runtime smoke in a headed browser. They slow Playwright down and keep the terminal visible briefly after assertions pass. Use `pnpm e2e:live-terminal:soak:watch` for manual observation. Change the soak, reconnect, target, or hold values with `--soak-ms=<milliseconds>`, `--reconnects=<count>`, `--switch-target=<worker>`, and `--hold-ms=<milliseconds>` when running the underlying `web/e2e/live-terminal-smoke.mjs` script directly.

Use `pnpm e2e:live-terminal:manual` to open the current running stack in a headed browser and hold it for four hours after the initial real-runtime attach assertion. Use `pnpm e2e:live-terminal:manual-soak` when you want the same four-hour hold after a five-minute real-runtime soak. Script-level options are read from the last matching CLI value, so you can shorten a manual pass with `pnpm --dir web e2e:live-terminal:manual -- --hold-ms=60000`.

Manual terminal acceptance is:

1. Start or reuse a real AO worker so at least one terminal-supported session appears.
2. Start the local stack with `yyork` or `pnpm dev`.
3. Run `pnpm e2e:live-terminal:manual-soak` from the repository root.
4. Watch the headed browser: terminal output should remain visible, reconnect/switch controls should not show failure toasts, and the selected worker should stay attached across workspace refreshes.
5. Let the terminal sit open or use the normal app for the intended manual window.
6. Treat the pass as failed if the final JSON reports a nonzero `terminalSocketCountDelta`, missing terminal frames, missing `resize.resizeFrame`, a missing `zellijSession` for current AO metadata, or if the underlying Zellij session disappears.

## Layout

- `cmd/yyork`: CLI entrypoint (`spawn`, `session list`, `stop`, and the no-verb server) plus the embedded dashboard
- `internal/app`: wires the store, engine, event bus, and HTTP server together
- `internal/server`: HTTP API, `/api/sessions`, the `/api/events` SSE stream, and dashboard serving
- `internal/session`: the spawn engine — `Spawn` / `Stop` / `Reconcile` — and the session model
- `internal/store`: SQLite store (`~/.yyork/state.db`) with goose migrations
- `internal/worktree`: per-session `git worktree` create/remove wrapper
- `internal/events`: in-process pub/sub bus that feeds the SSE stream
- `internal/durabilityprovider`: Zellij session create/kill/attach
- `internal/plugin` + `internal/plugin/agent`: plugin registry and the agent interface
- `internal/plugin/agent/codex`: the built-in Codex agent plugin
- `web`: React + Vite (client-only SPA) dashboard package
- `api`: future generated API and event contracts

## Scripts

- `yyork` (Nix shell) / `pnpm dev`: start the dev stack — Vite dashboard + Go API with hot reload
- `pnpm web:dev`: start only the Vite dev server
- `pnpm backend:dev`: start only the Go server
- `pnpm web:build`: build the dashboard SPA into `web/dist`
- `pnpm backend:build`: build the dashboard, embed it, and compile `./yyork`
- `pnpm build`: build the web package and Go binary
- `pnpm lint`: run backend tests and frontend lint checks
- `pnpm cli:test`: run launcher command and env parsing tests
- `pnpm test`: run backend, launcher CLI, and frontend tests
- `pnpm e2e`: run Playwright e2e checks against the web app
