# Core Spawn Engine — Implementation Plan

Companion to [PRD.md](./PRD.md). The PRD describes *what* and *why*; this plan describes *order* and *how big each step is*. Read alongside to interrogate decisions.

## Sequencing principle

Build bottom-up. Each milestone is independently testable. The first user-visible win lands at M5 (CLI spawn creates a real zellij session you can attach to manually). The dogfood loop completes at M8 (dashboard reflects new sessions in real time).

## Milestone overview

| # | Milestone | What ships | Depends on |
|---|---|---|---|
| M0 | DB bootstrap | `~/.better-ao/state.db` is created and migrated on first run | — |
| M1 | Worktree module | `internal/worktree` package, tested against real git | M0 |
| M2 | Events bus | `internal/events` package | — |
| M3 | Zellij creation | `internal/terminal` gains `CreateZellijSession` / `KillZellijSession` | — |
| M4 | Spawn engine | `internal/session.Spawn`, `.Stop`, `.Reconcile` wired | M0–M3 |
| M5 | CLI verbs | `better-ao spawn`, `session list`, `stop`; remove `start`/`dashboard` | M4 |
| M6 | Server: SQLite + SSE | Read endpoints repointed to store; `/api/events` SSE | M0, M2 |
| M7 | Codex plugin cleanup | ~300 lines of file-scanning code deleted | — |
| M8 | Dashboard adjustments | Flat running-list, SSE subscription, polling removed | M5, M6 |

M2, M3, M7 are independent and can run in parallel with M1 if useful.

---

## M0 — DB bootstrap

**Goal**: better-ao server creates and migrates its SQLite database on first run.

**Work**:
- New: `internal/store/` package
  - `Open(path) (*Store, error)` — opens DB, runs goose migrations, enables WAL.
  - `Close() error`.
- New: `internal/store/migrations/0001_create_sessions.sql` — schema per PRD.
- Dependency: `github.com/ncruces/go-sqlite3` + `github.com/pressly/goose/v3` added to `go.mod`.
- Server boot wires `Store.Open(~/.better-ao/state.db)`. Creates `~/.better-ao/` if missing.

**Acceptance**:
- `better-ao` runs against an empty home; the DB file is created.
- Re-running is a no-op (migrations idempotent).
- `sqlite3 ~/.better-ao/state.db ".schema sessions"` shows the expected columns.

**Tests**:
- `internal/store/store_test.go` — `Open` against `:memory:`, assert migration runs, assert WAL is on.

**Risks**:
- goose API surface — minor.
- ncruces wasm blob size in the binary (~5MB). Acceptable.

---

## M1 — Worktree module

**Goal**: a deep, testable wrapper over `git worktree` that better-ao can use without knowing git CLI details.

**Work**:
- New: `internal/worktree/` package
  - `BaseRef(projectPath string) (string, error)` — `git symbolic-ref refs/remotes/origin/HEAD` → fallback `git symbolic-ref HEAD` → fallback error.
  - `Create(projectPath, branchName, baseRef string) (worktreePath string, err error)` — `git worktree add <auto-path> -b <branch> <baseRef>`.
  - `Remove(worktreePath string) error` — `git worktree remove`.
  - `IsGitRepo(projectPath string) bool` — for spawn precondition checks.

**Acceptance**:
- All ops produce expected git state in a temp repo.
- Non-git directory rejected with a specific error type the engine can match on.
- Branch name `better-ao/{ulid}` works (slash in branch name OK in git).

**Tests**:
- `internal/worktree/worktree_test.go` — integration tests against `t.TempDir()` git repos. No mocks.
- Cover: base-ref from `origin/HEAD`, base-ref fallback to local HEAD, non-git rejection, create + remove round-trip.

**Risks**:
- Git not installed → tests fail. Documented requirement; not the worktree module's problem.
- Existing repo with uncommitted state on the base branch — should still create worktree cleanly (git allows).

---

## M2 — Events bus

**Goal**: in-process pub/sub the engine uses to notify the SSE handler.

**Work**:
- New: `internal/events/` package
  - `type Event struct { Type string; SessionID string; Payload any }`.
  - `type Bus struct { ... }`.
  - `(b *Bus) Subscribe() (<-chan Event, func())` — returns channel + unsubscribe.
  - `(b *Bus) Publish(Event)` — non-blocking; drops if a subscriber's buffer is full.
- Event type constants: `session.created`, `session.lifecycle_changed`, `session.terminated`.

**Acceptance**:
- Multiple subscribers each receive published events.
- A slow subscriber doesn't block the publisher (events drop on that subscriber only).
- Late subscribers don't see past events.

**Tests**:
- `internal/events/events_test.go` — unit tests on the above semantics. ~50 lines.

**Risks**:
- Channel buffer size tuning. Default to 32; revisit if drops happen in practice.

---

## M3 — Zellij creation

**Goal**: `internal/terminal` can spawn and kill zellij sessions, not just attach to existing ones.

**Work**:
- New helper: `CreateZellijSession(name, layoutKDL, env, cwd string) error`
  - Write `layoutKDL` to a temp file.
  - Allocate PTY via existing `aymanbagabas/go-pty`.
  - Spawn `zellij --session <name> --layout <path>` with PTY as stdio + env + `Setsid`.
  - Poll `zellij list-sessions` until `<name>` appears (50ms × 50 = 2.5s budget).
  - On timeout: kill client process, return error. Caller handles cleanup of layout file and any other state.
- New helper: `KillZellijSession(name string) error`
  - Shell-out to `zellij kill-session <name>`.
- New helper: `RenderLaunchLayout(launchCmd []string) (kdl string)` — templates the KDL layout with the agent launch + keep-alive shell.

**Acceptance**:
- Calling `CreateZellijSession` produces a session visible in `zellij list-sessions`.
- The session's first pane runs the agent command (or whatever launch command was passed).
- After agent exit, the session stays alive (keep-alive shell).
- `KillZellijSession` removes it.

**Tests**:
- Most coverage via M4's integration tests with the real engine — `terminal.CreateZellijSession` itself uses real zellij and is awkward to unit-test in isolation.
- Optional: a build-tagged `terminal_zellij_smoke_test.go` that exercises create + list + kill against real zellij, gated on `BETTER_AO_ZELLIJ_SMOKE=1`.

**Risks**:
- Exact zellij invocation — *the* implementation unknown. The detached-client + PTY + Setsid pattern is designed but unproven. Buffer: 4 hours of zellij-fiddling possible. If `--layout` doesn't accept the shape we need, fall back to writing a workspace-local `.zellij` layout dir.
- Layout file format quirks (KDL strings with embedded quotes from prompts) — needs proper escaping helper.

---

## M4 — Spawn engine

**Goal**: `internal/session` orchestrates the whole spawn pipeline transactionally.

**Work**:
- Expand `internal/session/session.go`:
  - `type Engine struct { store *store.Store; worktree *worktree.Module; terminal terminal.Provider; bus *events.Bus; plugins plugin.Registry }`.
  - `Spawn(ctx, SpawnRequest) (Session, error)` — pipeline per PRD's "Spawn is transactional" section.
  - `Stop(ctx, sessionID) error` — kill + worktree remove + UPDATE.
  - `Reconcile(ctx, sessionID) (Session, error)` — single-session liveness probe + UPDATE if dead.
  - `ReconcileAll(ctx) error` — boot sweep.
- ULID generation via `github.com/oklog/ulid/v2`.
- Define `terminal.Provider` interface so tests can substitute a fake.

**Acceptance**:
- Happy-path spawn: returns a `Session` with `lifecycle_state="running"`, row in DB, two events published (`session.created`, `session.lifecycle_changed`).
- Worktree-failure spawn: returns error, no row, no zellij call.
- Zellij-failure spawn: row in DB with `lifecycle_state="failed"`, worktree removed, event published.
- Idempotent stop: stopping twice returns nil both times.
- Boot sweep: previously-running rows whose zellij is gone get UPDATEd to `terminated`.

**Tests**:
- `internal/session/session_test.go` — integration tests using real `store` (`:memory:`), real `events.Bus`, fake `worktree` (returns canned outcomes), fake `terminal.Provider` (returns canned outcomes).
- Coverage matches the acceptance list. ~200 lines.

**Risks**:
- The fake-terminal interface design — make sure it surfaces enough state so tests can assert on what would have happened (sessions created, sessions killed).
- Rollback ordering bugs — exercise with table-driven tests.

---

## M5 — CLI verbs

**Goal**: `better-ao spawn`, `session list`, `stop` work end-to-end. First user-visible win.

**Work**:
- `cmd/better-ao/main.go`:
  - Remove `start` and `dashboard` from the switch + help.
  - Add `spawn` subcommand: flags `--agent`, `--prompt`, `--system-prompt`, `--system-prompt-file`, `--permissions`. Resolves project from `os.Getwd()`. Constructs `SpawnRequest`. Calls `engine.Spawn`. Prints the new session id.
  - Add `session` subcommand with `list` subaction (filters `--project`, `--state`).
  - Add `stop` subcommand: takes session id as positional arg.
  - Trim `plannedCommands` map to whatever isn't implemented after this milestone.
- Engine bootstrap factored so the CLI can construct an `Engine` (opens store, loads plugins) without starting the server.

**Acceptance**:
- `cd ~/Projects/better-ao && better-ao spawn --agent=codex --prompt="hello"` creates a zellij session and prints a ULID.
- `zellij attach <ulid>` shows the running codex.
- `better-ao session list` shows the running session.
- `better-ao stop <ulid>` terminates it cleanly; the next `session list` excludes it.

**Tests**:
- Extend `cmd/better-ao/main_test.go` for new verbs' arg parsing.
- Dogfood smoke at the end: actually run the loop above against your own checkout.

**Risks**:
- Server-vs-CLI engine wiring — opening the same DB from both, WAL handles this but verify.
- Project path resolution edge cases (running spawn from subdirectory of project) — decide if we walk up to find `.git/` or strict-`pwd`. Recommend strict for v1.

---

## M6 — Server: SQLite reads + SSE

**Goal**: dashboard data layer points to SQLite; live updates push via SSE.

**Work**:
- `internal/server/server.go`:
  - `GET /api/workspace` — replace `internal/ao/workspace.go` calls with `store` queries. Filter to `lifecycle_state IN ('starting','running')` by default.
  - New: `GET /api/events` — SSE handler. Subscribes to `events.Bus`, formats events as SSE lines, handles client disconnect cleanly.
  - Existing terminal-attach websocket continues to work (uses `zellij attach <name>` and the session name comes from SQLite now).
  - Wire `Engine.ReconcileAll` to run on server boot before the HTTP listener starts accepting.

**Acceptance**:
- `curl localhost:7331/api/workspace` returns sessions from SQLite.
- `curl -N localhost:7331/api/events` streams events; running `better-ao spawn` in another terminal emits a `session.created` line within ~50ms.
- After server restart, sessions whose zellij is gone are marked terminated before the first API request returns.

**Tests**:
- `internal/server/server_test.go` — integration tests against an `httptest.Server` with a seeded store and a wired `events.Bus`. Assert SSE delivers events as expected.

**Risks**:
- SSE backpressure across clients — start with one buffered channel per subscriber, evaluate later.
- Reconcile-on-boot perf with many rows — N+1 zellij calls. v1 scale this is fine; future: one `zellij list-sessions` call + set membership.

---

## M7 — Codex plugin cleanup

**Goal**: delete the file-scanning code that exists only to support deferred features.

**Work**:
- `internal/plugin/agent/codex/codex.go`:
  - Delete: `findCodexSessionFile`, `findCodexSessionFileByThreadID`, `findCodexSessionFileByCWD`, `streamCodexSessionData`, `parseCodexJSONLine`, related helpers (~300 lines).
  - `SessionInfo` returns empty + nil.
  - `GetRestoreCommand` returns `nil, false, nil`.
  - `GetAgentHooks` remains the existing no-op.
  - `Plugin.sessionsDir` field removed.

**Acceptance**:
- Codex plugin compiles, existing happy-path tests pass.
- Line count drops by ~300.
- `GetLaunchCommand` (the load-bearing one) unchanged.

**Tests**:
- Existing `codex_test.go` patterns kept for `GetLaunchCommand`. Tests for deleted functions deleted.

**Risks**:
- None unique to this milestone. Can run in parallel with M1–M6.

---

## M8 — Dashboard adjustments

**Goal**: web dashboard reads from the new server endpoints, renders a flat running-sessions list, subscribes to SSE.

**Work**:
- `web/src/features/home/data/workspace.ts` (or equivalent) — switch from polling `GET /api/workspace` to:
  - Initial fetch via `GET /api/workspace` for hydration.
  - SSE subscription to `GET /api/events` for live updates.
  - Reconnect on disconnect with exponential backoff.
- Kanban scaffolding ([kanban-board.tsx](web/src/features/home/components/organisms/kanban-board.tsx) etc.) stays in the codebase but isn't rendered as the v1 surface — replace with a flat list component or render only the "running" column.
- Remove any polling intervals from the data layer.

**Acceptance**:
- Dashboard renders sessions present in SQLite on first load.
- `better-ao spawn` from a terminal produces a new card in the dashboard within ~ms with no manual refresh.
- `better-ao stop` makes the card disappear.
- Killing/restarting the server: dashboard reconnects, shows the post-sweep state.
- No periodic GETs in the network tab.

**Tests**:
- Light Playwright update in `web/e2e/` for the flat-list rendering + SSE-driven update path.
- `pnpm e2e:live-terminal` continues to pass (attach pipeline unchanged in semantics).

**Risks**:
- The existing dashboard's data layer might already be polling-based and tightly coupled to the old `internal/ao/workspace.go` shape. Surface area to refactor unknown until M8 starts.

---

## Tests-only milestone audit

Per PRD's "Modules with tests" list:

| Module | M | Status |
|---|---|---|
| `internal/store` | M0 | integration tests on `:memory:` |
| `internal/worktree` | M1 | integration tests against real temp git repos |
| `internal/events` | M2 | unit tests on pub/sub semantics |
| `internal/session` | M4 | integration tests with real store + fakes for terminal/worktree |
| `cmd/better-ao` | M5 | arg parsing tests + manual dogfood smoke |
| `internal/server` | M6 | integration tests with seeded store + wired bus |

Modules deliberately *not* unit-tested in isolation:
- `internal/terminal` zellij creation — covered indirectly via M4 (fake at the boundary) and the existing `pnpm e2e:live-terminal` real-zellij suite.
- `internal/plugin/agent/codex` (post-cleanup) — `GetLaunchCommand` gets a small table-driven test; the rest is no-op.

---

## Out-of-scope follow-up slices (parking lot)

For interrogation: these are *not* in this plan. If you want to pull any into v1, say so and we re-scope.

- Dashboard spawn UX (`POST /api/sessions` + a "+" button).
- Hooks (`better-ao session set`, `GetAgentHooks` invocation, per-plugin hook installer).
- Resume (`GetRestoreCommand` actually called, `ListResumableThreads` plugin method, "resume past work" UI).
- Activity capture (`.better-ao/activity.jsonl`, activity-state derivation).
- Kanban columns with `prompt`/`triage`/`working`/`done`.
- Notifier / SCM / Tracker plugins.
- Migration tool (`better-ao import-from-ao`).
- A second durability provider (tmux, raw process, remote).
- A second agent plugin (Claude Code, OpenCode).

---

## Risks summary (where I might be wrong)

1. **Zellij detached-client incantation (M3)** — designed but not validated. Highest-uncertainty step.
2. **Existing dashboard data-layer coupling (M8)** — refactor surface unknown.
3. **`internal/ao/workspace.go` removal blast radius (M6)** — keeping it compiling but unused may leave dead branches in the server.
4. **PTY + Setsid on macOS specifically** — might need a different syscall flag for clean orphaning.

Each is recoverable; none structural to the design.

---

## Total scope estimate

8 milestones. Each is sized to fit in one focused session (1–4 hours). M3 is the wildcard (could blow up to a full day if zellij doesn't cooperate). Net: ~2–4 days of focused implementation if nothing surprises.
