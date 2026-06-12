# Core Spawn Engine PRD

## Problem Statement

I want to use yyork to build yyork. Today I can't — yyork is a viewer over an externally-managed Agent Orchestrator stack. To actually run an agent on a task, I have to use a separate `ao` CLI to spawn a worker, then come back to yyork to watch it. Everything write-side lives outside the app: spawning, stopping, managing sessions. The 23-command surface declared in `cmd/yyork/main.go` is all stubs that print "not implemented yet."

The desktop apps I'd otherwise use for this — Conductor, Crush, and friends — are slow and have features that simply don't work. I want a local-first tool I actually own. yyork should *be* the next-gen ao, not a frontend over it.

The minimum thing missing is a spawn path: a way for yyork itself to create a zellij-backed agent session on a project, persist it, and expose it in the dashboard for browser terminal attachment. Until that exists, yyork can't dogfood itself.

## Solution

yyork takes ownership of the agent-orchestration stack end-to-end. The user starts the server with `yyork` (no verb). From any project directory they run `yyork spawn` with a prompt and an agent plugin choice. The engine creates a per-session git worktree on a `yyork/{sessionId}` branch, creates a zellij session running the agent CLI inside that worktree, persists the session to a local SQLite database, and the running dashboard immediately shows the new session via a server-sent-events stream — no polling. The user clicks into the session in the browser and gets a live terminal attached to the running agent.

No external `ao` CLI involved. The full loop — spawn, watch, stop — happens inside one tool.

For v1 this is intentionally a *minimum* spawn slice: spawn, list, stop, attach. No hook-based metadata capture, no resume from past sessions, no dashboard-side spawn UI, no notifications, no PR/CI integration. Those layer on top of a solid spawn engine.

## User Stories

1. As a developer dogfooding yyork, I want to start the server by running `yyork` with no arguments, so that I don't have to remember a subcommand verb just to launch the dashboard.

2. As a developer dogfooding yyork, I want `yyork spawn` to launch a new agent session on whichever project I'm currently `cd`'d into, so that I don't have to specify the project path explicitly for the common case.

3. As a developer dogfooding yyork, I want each spawned agent to run inside its own git worktree on a `yyork/{sessionId}` branch, so that parallel agents on the same repo don't step on each other's files.

4. As a developer dogfooding yyork, I want the base branch for new worktrees to be detected from my repo's actual git configuration (`refs/remotes/origin/HEAD`, falling back to my currently checked-out branch), so that yyork respects whatever branching convention my project uses instead of assuming `main` or `master`.

5. As a developer dogfooding yyork, I want spawn to fail cleanly with a clear error when I try to spawn in a non-git directory, so that I'm not surprised by inconsistent worktree behavior in non-repo projects.

6. As a developer dogfooding yyork, I want each spawned session to get a stable, sortable, copy-pasteable session id (ULID), so that I can refer to sessions in CLI commands and shell history without ambiguity.

7. As a developer dogfooding yyork, I want session ids to be human-readable enough that I can read them from a terminal output or share them in a message, so that the CLI doesn't feel hostile to humans.

8. As a developer dogfooding yyork, I want my session to keep running even after my dashboard tab closes or my browser crashes, so that I don't lose work when I navigate away.

9. As a developer dogfooding yyork, I want my session to keep running even after the yyork server itself is restarted, so that server upgrades or crashes don't kill my in-flight agents.

10. As a developer dogfooding yyork, I want to attach to a running session's terminal in the browser, so that I can see what the agent is doing in real time.

11. As a developer dogfooding yyork, I want the terminal to behave like a real terminal (resize correctly, render colors, handle escape sequences) when attached via the browser, so that the agent CLI is usable from inside the dashboard.

12. As a developer dogfooding yyork, I want to be able to attach to a session from a regular terminal too (via `zellij attach <session-name>`), so that yyork isn't the only window into my work.

13. As a developer dogfooding yyork, I want my session to survive the agent process exiting (e.g., agent crashed mid-run), so that I can see the post-mortem output instead of the pane vanishing.

14. As a developer dogfooding yyork, I want `yyork session list` to show me every session yyork knows about, with its id, project, agent, lifecycle state, and creation time, so that I can quickly see what's running and what's terminated.

15. As a developer dogfooding yyork, I want `yyork stop <sessionId>` to cleanly terminate a session — killing the zellij session, updating its lifecycle state — so that I have an explicit shutdown verb that doesn't leave orphan processes.

16. As a developer dogfooding yyork, I want spawn to be transactional: if any step fails (worktree creation, zellij startup, db write), the partial state gets rolled back, so that I'm never left with half-spawned sessions to clean up manually.

17. As a developer dogfooding yyork, I want the dashboard to learn about a newly-spawned session within milliseconds of running `yyork spawn` in my terminal, so that I don't have to refresh the page to see what I just created.

18. As a developer dogfooding yyork, I want the dashboard to learn about lifecycle changes (a session terminating, going to failed state, etc.) without polling, so that the network tab isn't full of GET requests and updates feel instant.

19. As a developer dogfooding yyork, I want yyork to not poll an external CLI for liveness on a timer, so that my CPU isn't spinning when nothing is happening.

20. As a developer dogfooding yyork, I want the dashboard to handle network interruptions gracefully — reconnecting the event stream automatically when the connection drops, so that a flaky network doesn't require a page reload.

21. As a developer dogfooding yyork, I want terminated and failed sessions hidden from the dashboard by default, so that my view shows what's actually running and not a graveyard of past work.

22. As a developer dogfooding yyork, I want terminated session rows preserved in the database (even if hidden from the dashboard), so that a future "history" view or resume feature has something to read from without re-architecting storage.

23. As a developer dogfooding yyork, I want all session state to live in one SQLite file (`~/.yyork/state.db`), so that I can inspect, back up, or move my state with standard tools.

24. As a developer dogfooding yyork, I want concurrent writes to the database (engine spawning one session while another reads, for example) to be safe by default, so that I never lose updates due to race conditions.

25. As a developer dogfooding yyork, I want the database schema to be versioned via migrations, so that schema changes between yyork versions don't corrupt my state.

26. As a developer dogfooding yyork, I want the agent plugin layer to be a real abstraction (`internal/plugin/agent/agent.go`), so that adding a new agent (Claude Code, OpenCode, whatever) later is a plugin slot, not a rewrite.

27. As a developer dogfooding yyork, I want the Codex plugin (the only one implemented today) to stop trying to scan `~/.codex/sessions/` for native session metadata, since I'm not using restore in v1, so that the plugin code is ~300 lines smaller and clearer.

28. As a developer dogfooding yyork, I want the CLI's `start`/`dashboard` verbs removed and the help text updated, so that there's exactly one way to launch the server.

29. As a developer dogfooding yyork, I want `yyork --help` to reflect what's actually implemented, with the rest of the "planned" commands removed from the help output until they ship, so that the help text isn't full of "not implemented yet" landmines.

30. As a developer dogfooding yyork, I want stopping a session to be safe to repeat (idempotent) — running `yyork stop X` twice should not fail on the second call, so that scripts and automation can call stop without checking state first.

31. As a developer dogfooding yyork, I want the server to detect dead sessions lazily when something asks about them, so that a previously-running session that the OS killed externally drops out of my dashboard's running view the next time I look at it.

32. As a developer dogfooding yyork, I want the dashboard to render correctly on its first load even before any SSE event arrives, by reading initial state via a regular GET, so that page loads don't depend on event-stream warm-up.

33. As a developer dogfooding yyork, I want the agent plugin to control its own launch command and environment variables, so that each agent's quirks (Codex's `--no-update-check`, Claude's profile, etc.) stay in the plugin and don't leak into the engine.

34. As a developer dogfooding yyork, I want the engine to set `YYORK_SESSION_ID` in the agent's environment at launch time, so that future hook integrations have a stable identity to use even though hooks aren't wired in v1.

35. As a developer dogfooding yyork, I want spawn to wait until the zellij session is actually live (confirmed via `zellij list-sessions`) before reporting success, so that the dashboard never sees a session row pointing at a not-yet-existing zellij session.

36. As a developer dogfooding yyork, I want the dashboard after a Mac reboot to show a clean (empty) running-sessions list, so that I get a true clean slate without manually pruning anything.

37. As a developer dogfooding yyork, I want the engine on boot to sweep the database and mark any rows whose zellij session no longer exists as terminated, so that the dashboard's first render after a restart is accurate.

## Implementation Decisions

### Storage primitive: SQLite

State lives in a single SQLite file at `~/.yyork/state.db`, accessed via `github.com/ncruces/go-sqlite3` (real upstream SQLite compiled to WebAssembly, executed by the `wazero` pure-Go runtime — no cgo, Nix-friendly). Migrations are managed by `goose` with SQL files under `internal/store/migrations/`. WAL mode is enabled at server boot to allow concurrent reads while writes are in flight.

### Schema sketch

One `sessions` table is the entire v1 schema. Rows are inserted on spawn and updated through their lifecycle; terminated and failed rows are hidden by dashboard queries but persist in the table:

```sql
sessions(
    id              TEXT PRIMARY KEY,    -- ULID
    project_path    TEXT NOT NULL,       -- absolute, the project identity
    project_name    TEXT,                -- denormalized basename(project_path) for display
    agent_plugin    TEXT NOT NULL,       -- "codex" | future plugins
    workspace_path  TEXT NOT NULL,       -- the worktree the agent runs in
    zellij_session  TEXT,                -- name = session id
    pid             INTEGER,             -- agent process pid, when known
    lifecycle_state  TEXT NOT NULL,      -- "starting" | "running" | "terminated" | "failed"
    metadata        TEXT,                -- JSON1 blob for plugin-specific fields (codex thread id, future PR url, etc.)
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
)
CREATE INDEX idx_sessions_project ON sessions(project_path);
CREATE INDEX idx_sessions_state   ON sessions(lifecycle_state);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
```

Dashboard queries always include `WHERE lifecycle_state IN ('starting', 'running')` unless an explicit "include terminated" flag is set; the `idx_sessions_state` index makes that filter free.

Plugin-specific fields go into the `metadata` JSON column rather than getting their own typed columns, so adding plugins doesn't require schema migrations.

### Project identity is the absolute path

No `projects.json` registry, no opaque project id, no central project table. Each session row denormalizes `project_path` (absolute) and `project_name` (display-only basename). "Sessions for project X" is `WHERE project_path = ?`. Path is unique by definition; the original collision concern with project *names* doesn't apply to paths.

A `mv` of the project directory orphans its sessions in v1 — acceptable trade for the simplicity gain. If/when a real user hits this, introduce a registry with stable ids.

### Session id format: ULID

Generated via `github.com/oklog/ulid/v2`. Time-sortable, 26 chars, Crockford base32 (no ambiguous characters, URL-safe, case-insensitive). The same string is used as the zellij session name, so there's only ever one identifier per session.

### Project = the current directory

`yyork spawn` resolves the project from `os.Getwd()` at invocation time. No `--project=` flag in v1.

### Sessions persist; dashboard filters

A session's row is created at spawn and never deleted by the engine. Termination updates `lifecycle_state` to `terminated` or `failed`. The row stays in the database as a forensic record.

The dashboard hides terminated/failed sessions by default. The session list endpoint (and every SSE update) filters to `lifecycle_state IN ('starting', 'running')` unless an explicit `?include=all` (or similar) is passed. The terminated record is still there for a future "history" view, resume feature, or debug query via `sqlite3` — it just doesn't clutter the running view.

This keeps the user's mental model clean ("the dashboard shows what's running") while leaving the forensic trail intact ("I can still see what I did yesterday by querying the DB or, eventually, a history view").

### Lifecycle state machine

A single column, `lifecycle_state`, describes the **session** (unit of work) — not the process, not the zellij window. Valid values:

- `starting` — spawn in progress, worktree may exist, zellij may not yet
- `running` — zellij session is live, agent process observed at least once
- `terminated` — explicit `yyork stop`, or reconciler detected zellij gone, clean exit
- `failed` — spawn rolled back due to error, or reconciler detected anomalous death

Transitions:

- `starting → running` after zellij session is confirmed via `zellij list-sessions`
- `starting → failed` on spawn rollback (worktree removed, zellij client killed, row remains as failed record)
- `running → terminated` on explicit stop, or on lazy reconciliation finding zellij gone
- `running → failed` (rare) if reconciliation finds anomalous state

Terminated and failed are sinks — no transitions out. Rows in those states are hidden from the default dashboard view but persist in the database.

### Worktrees: one per session, on `yyork/{sessionId}`

Every spawn creates a git worktree via `git worktree add`. The branch is named `yyork/{sessionId}` where `{sessionId}` is the ULID. The base ref is detected from the project's actual git state:

1. Try `git symbolic-ref refs/remotes/origin/HEAD` — gives `origin/main` or `origin/master` as actually configured on the remote.
2. Fall back to whatever branch is currently checked out (`git symbolic-ref HEAD`).
3. If neither works (no remote, no commits, non-git project), spawn is rejected with a specific error message.

Worktree path: `git worktree add` defaults to a directory under the repo. For v1, let git decide — the engine doesn't try to override the worktree location. Removal on session stop uses `git worktree remove` against the recorded `workspace_path`.

### Zellij session creation: PTY-attached detached client

Zellij is client-server; killing the client leaves the session alive on the server. The spawn flow:

1. Write a temp KDL layout file describing one pane that runs `<agent-launch-command>; exec ${SHELL:-/bin/bash} -i` (the "keep-alive shell" trick so the pane survives agent exit and we can probe agent liveness independently of session liveness).
2. Allocate a PTY via `aymanbagabas/go-pty` (already a project dependency).
3. Spawn `zellij --session <ulid> --layout <kdl-path>` with the PTY as stdio, in a new process group (`Setsid`).
4. Poll `zellij list-sessions` until the session appears (50ms intervals, 2.5s budget).
5. Persist the session row to SQLite with `lifecycle_state = "running"`.
6. Don't wait on the spawned process — let it run; the zellij server holds the session even after the client process exits.

If polling times out, spawn is rolled back: kill the client process, remove the worktree, no DB row inserted.

### Stop semantics

`yyork stop <sessionId>` is:

1. `zellij kill-session <sessionId>` — terminates the session including the keep-alive shell.
2. `git worktree remove <workspace_path>` — best-effort cleanup; if it fails (uncommitted changes), log and continue.
3. UPDATE the row: `lifecycle_state = "terminated"`, `updated_at = now`.
4. Emit a `session.terminated` event on the in-process bus carrying the id, so SSE subscribers can drop the entry from the dashboard view.

Idempotent: stopping an already-terminated session is a no-op (skip the kill, skip the worktree remove, leave the row alone). Reconciliation does the same: when a `running` row's zellij session is missing on probe, the row is updated to `terminated` and the event fires.

### CLI surface for v1

The CLI shrinks to:

- `yyork` (no verb) — start the local dashboard + API server. Replaces `yyork start` / `yyork dashboard` which are removed.
- `yyork spawn` — spawn a new session. Flags include `--agent` (default `codex` since it's the only plugin), `--prompt`, `--system-prompt` / `--system-prompt-file`, `--permissions`.
- `yyork session list` — list sessions, optionally filtered by `--project` and `--state`.
- `yyork stop <sessionId>` — terminate.

All other entries in the current `plannedCommands` map are removed from help output; we'll add them back as commands ship.

### Server: SQLite reads + SSE push, no polling

The HTTP server's existing read endpoints (`/api/workspace`, etc.) are repointed to query SQLite via the new store package. The legacy `internal/ao/workspace.go` reader against `~/.agent-orchestrator/` is deleted; yyork reads session state only from its own store.

A new SSE endpoint, `GET /api/events`, streams session lifecycle events to subscribers. The dashboard subscribes once on connect; the initial render uses a regular `GET /api/sessions` for state, then the SSE stream drives updates. No HTTP polling anywhere.

### In-process event bus

A small `internal/events` package exposes a typed pub/sub bus. Publishers:

- `session.Spawn` publishes `session.created`, then `session.lifecycle_changed` as the row transitions through states.
- `session.Stop` publishes `session.lifecycle_changed` to terminated.
- The reconciler publishes `session.lifecycle_changed` when it detects external death.

Subscribers: the SSE handler. The dashboard's frontend hydrates a session list from events.

The bus is in-memory only — no persistence. SSE clients that connect after an event missed it just re-query the initial state.

### Reconciliation: lazy, not periodic

There is no periodic ticker probing liveness in v1. Reconciliation happens at three trigger points:

1. **Server boot** — one-time sweep over all sessions currently in `starting` or `running` state: probe `zellij list-sessions` for each name, mark missing ones as `terminated`. After a Mac reboot this typically marks every previously-running row as terminated, giving the dashboard a clean default view while preserving the records.
2. **On API read** — when `/api/sessions` or per-session endpoints query a running session, probe its zellij liveness inline; if dead, UPDATE to `terminated`, emit the event, and exclude it from the response.
3. **On stop** — implicit; stop drives the state change directly.

External death (agent crashes, zellij killed externally) is not detected until the next user query. This is the trade-off accepted in exchange for "no polling."

### Hook infrastructure is dormant in v1

`GetAgentHooks` stays as a method on the agent plugin interface — Codex's implementation remains a no-op. The engine does *not* call `GetAgentHooks` during spawn in v1. `YYORK_SESSION_ID` is still set on the agent's environment so the plumbing is ready for when hooks land in a future slice, but no helper binary (`yyork session set`) ships. No `YYORK_DATA_DIR` env var — the data directory is fixed at `~/.yyork/`, the `yyork` binary already knows it, and hooks will route through `yyork session set` rather than editing files directly, so the path doesn't need to ride on the agent's environment.

### Codex plugin cleanup

The ~300 lines of session-file scanning in the Codex plugin (`findCodexSessionFile`, `findCodexSessionFileByThreadID`, `findCodexSessionFileByCWD`, `streamCodexSessionData`, `parseCodexJSONLine`) are deleted. They existed to discover Codex's native thread id for restore; restore is no-op in v1, so the discovery is dead code. `SessionInfo` becomes a stub returning empty.

`GetLaunchCommand` (the load-bearing one) stays unchanged. `GetRestoreCommand` returns `nil, false, nil` — the existing fall-through to a fresh launch is acceptable v1 behavior if anyone ever calls it, but the engine doesn't.

### The `internal/ao` reader is deleted

`internal/ao/` is removed outright. Nothing imports it, the dashboard never calls it, and no migration from `~/.agent-orchestrator/` state is planned — yyork's only session store is its own SQLite database.

### Spawn is transactional

The spawn pipeline acquires resources in a known order and handles failures explicitly:

1. Generate ULID, validate project is a git repo, resolve base ref.
2. `git worktree add` — on failure, abort with no cleanup needed (no row, no zellij yet).
3. INSERT session row with `lifecycle_state = "starting"` — on failure: `git worktree remove` the worktree.
4. Allocate PTY + spawn zellij client + poll for session presence — on failure: UPDATE the row to `lifecycle_state = "failed"`, kill the client process if started, `git worktree remove`. The row stays as a forensic record of the failed attempt (hidden from default dashboard view).
5. UPDATE to `running` after polling confirms.
6. Publish events.

Each step's failure path is wired explicitly. Failed-spawn rows preserve enough context (project, agent, prompt) to indicate something went wrong; the specific cause is on stderr at spawn time.

### Module surface

- **`internal/store`** — opens/migrates the DB, exposes a session repository. Public interface is repository operations on sessions; SQL is encapsulated.
- **`internal/session`** — the spawn engine. `Spawn(ctx, SpawnRequest) (Session, error)`, `Stop(ctx, sessionId) error`, `Reconcile(ctx, sessionId) (Session, error)`. Composes store + worktree + terminal + plugin.
- **`internal/worktree`** — `Create(projectPath, branchName, baseRef) (path, error)`, `Remove(path) error`. Wraps the `git worktree` CLI; encapsulates branch detection logic.
- **`internal/terminal`** — extended with `CreateZellijSession(name, layoutKDL, env, cwd) error` and `KillZellijSession(name) error`. The existing attach pipeline is unchanged.
- **`internal/events`** — typed pub/sub bus. `Publish(event)`, `Subscribe() <-chan Event`. Buffered, drops on slow subscriber rather than blocking publishers. Event types in v1: `session.created`, `session.lifecycle_changed`, `session.terminated` (carries the terminated id so SSE subscribers can drop the entry from the running-view).
- **`internal/server`** — repoints read endpoints to `store`; adds SSE handler subscribed to `events`.
- **`cmd/yyork`** — CLI changes: drop `start`/`dashboard`, add `spawn`, `session`, `stop`. Update help text.
- **`internal/plugin/agent` + `internal/plugin/agent/codex`** — interface unchanged; Codex implementation strips ~300 lines of file scanning, `SessionInfo` and `GetAgentHooks` become no-ops.

The deep modules (high-leverage, isolated, stable interface) are `internal/store`, `internal/worktree`, `internal/events`, and `internal/session`. Most tests concentrate on these.

## Testing Decisions

### What makes a good test here

External behavior only. A `store` test inserts a session row and reads it back, asserting on the returned struct — it does not assert on SQL syntax or migration file content. A `session.Spawn` test passes fakes for the terminal and worktree adapters and asserts on the resulting database row + the events published — it does not assert on the order in which `Spawn` called its collaborators. A `worktree` test runs against a real temp git repo and asserts that `git worktree list` shows the new entry — it does not assert on the exact `git` command argv.

This means refactoring the implementation should never force a test rewrite as long as the observable behavior is unchanged. It also means tests fail when behavior actually breaks, not when an unrelated internal name changes.

### Modules with tests

- **`internal/store`** — integration tests against `:memory:` SQLite. Cover: insert + list, field updates (including JSON-column merges via `json_set`), query-by-project, query-by-state, migration apply on a fresh database. High leverage; cheap to run.

- **`internal/session`** — integration tests using real `store` (in-memory) plus fake `terminal`/`worktree` adapters that return preprogrammed outcomes. Cover: happy-path spawn end-to-end (resulting DB row + events), failed spawn when zellij polling times out (row left in `failed` state, worktree removed), no row when worktree creation fails, idempotent stop (stopping an already-terminated session is a no-op), lazy reconciliation updating a session to `terminated` when the terminal adapter reports zellij missing, dashboard query filter excludes `terminated` and `failed` by default.

- **`internal/worktree`** — integration tests against a real temp git repo (`git init`, commit a file, then exercise the module). Cover: create worktree on `yyork/{ulid}` branch (assert filesystem state + `git worktree list` output), remove worktree (assert cleanup), reject non-git directory, base ref detection from `origin/HEAD` when present and fallback to current `HEAD` when not. No mocks; uses the real `git` binary.

- **`internal/events`** — small unit tests for pub/sub semantics: published events delivered to all current subscribers, late subscribers don't see past events, slow subscriber doesn't block publishers (drop policy verified).

- **`internal/server`** — integration tests with a seeded in-memory store and a wired event bus. Cover: `GET /api/sessions` returns expected JSON shape, `GET /api/events` SSE stream delivers session lifecycle events as they're published.

- **`cmd/yyork`** — extend existing `main_test.go` patterns for the new verbs (`spawn`, `session list`, `stop`). Cover: flag parsing, help text, dispatch to engine.

### Modules without dedicated tests

- **`internal/terminal`** zellij creation — not unit-tested directly; covered indirectly via `session.Spawn` integration tests that use a fake terminal adapter. Real-zellij coverage comes from the existing `pnpm e2e:live-terminal` end-to-end suite, which already exercises attach against real zellij sessions and will exercise sessions we create as soon as the server spawns them.

- **`internal/plugin/agent/codex`** — `GetLaunchCommand` is pure argv construction; small table-driven test for flag presence based on permission mode and prompt presence is worth adding, but it's a leaf node, not a deep module.

### Prior art

Existing test patterns in the codebase:

- `cmd/yyork/main_test.go` — Go `testing` patterns for the CLI surface.
- `internal/server/*_test.go` and `internal/terminal/*_test.go` — HTTP/websocket integration test patterns the new SSE endpoint follows.
- `web/e2e/live-terminal-smoke.mjs` and the dozen `pnpm e2e:live-terminal:*` variants — real-runtime end-to-end coverage that catches dashboard regressions across the spawn changes.

## Out of Scope

- **Hook infrastructure of any kind.** No `yyork session set` CLI command, no `GetAgentHooks` invocation in spawn flow, no PostToolUse / SessionStart / activity-jsonl wiring. The plugin interface keeps `GetAgentHooks` defined for future use, but Codex stays a no-op and the engine doesn't call it.

- **Resume.** `GetRestoreCommand` stays no-op. No "resume past session" UI or CLI verb. No Codex thread-id capture, no Claude conversation-id capture. Past sessions can be viewed in the list but not re-launched.

- **Dashboard-side spawn.** `POST /api/sessions` is not exposed in v1. Spawn is CLI-only. Dashboard remains read-side for writes; the kanban "+" button is a future slice.

- **A second durability provider.** Only zellij. No tmux, no raw process, no remote.

- **A second agent.** Only Codex. Claude Code, OpenCode, and others are deferred to plugin slices.

- **Worktree path overrides.** Whatever directory `git worktree add` picks is what we use. No `--worktree-base=` flag, no custom layouts.

- **Activity state, summaries, titles.** No `.ao/activity.jsonl`. `SessionInfo` returns nothing useful. Dashboard renders sessions with bare metadata (id, project, agent, state, created_at) — no per-session summary, no live activity indicator.

- **Notifications.** No notifier plugin, no system notifications, no email/Slack.

- **Issue tracker / SCM integration.** No PR creation hooks, no GitHub integration, no Linear integration. The `metadata` JSON column has room for these fields when they land.

- **Project registry, custom project names, rename, relocate.** Project = absolute path. Display name = `basename(path)`. Move the project dir → sessions orphan.

- **Periodic background reconciliation.** No ticker. External death is detected only on the next API read.

- **Configuration UI.** `~/.yyork/config.yaml` is referenced by the plugin interface's godoc but no v1 surface reads or writes it. Defaults are hardcoded.

- **Multi-machine / remote backends.** State is local; SQLite is on the user's disk.

- **Backup / export / migrate-storage.** The DB is at a known path; users can `cp` it. No tooling around this in v1.

- **Migration from `~/.agent-orchestrator/` state.** `internal/ao/workspace.go` is deleted, not converted into an import tool. No `yyork import-from-ao` is planned.

## Further Notes

### Why this slice and not the Canvas Review (diff) panel

Canvas Review would also be a credible "next thing" — it would let users supervise agents without bouncing to an editor. But Canvas Review presumes there's a worker session to inspect, and today yyork can't create one. Spawn is upstream of every other feature: until yyork owns the spawn-and-manage stack, every other capability is parasitic on the external `ao` CLI. Ship spawn first, then Canvas Review becomes the obvious next move.

### Relationship to the original `agent-orchestrator` project

This design distills the original `ao` project's durability model: lazy on-read liveness probing, per-session metadata records that persist, the keep-alive shell trick wrapping the agent launch command, the two-layer liveness check (durability-provider session + agent process). Three deliberate divergences:

1. **SQLite instead of JSON-files-plus-lockfile.** Concurrent writers are first-class; no atomic-rename dance.
2. **No `running.json` live-index file.** Liveness is derived on read; the session table is the index.
3. **Zellij as the durability provider, instead of tmux.** Client/server architecture is similar so the same "spawn detached client, server holds session" pattern transfers, but the exact invocation differs (KDL layout + PTY-attached detached client + presence polling).

### Terminology: "durability provider"

The **durability provider** is the multiplexer that holds an agent process and lets clients attach/detach without killing the workload. In yyork v1 the durability provider is Zellij — the only one. Equivalent to AO's "runtime" plugin slot, renamed here because "runtime" is overloaded in software contexts (Go runtime, browser runtime, container runtime) and "durability provider" names the actual responsibility: providing process durability across attach/detach/restart.

The **agent** is the workload that runs on top of the durability provider. The agent (Codex, eventually Claude Code, etc.) is what the user actually wants to run; the durability provider is the container that makes it survive disconnections. The two are orthogonal concepts and should be named differently in code: `Agent` and `DurabilityProvider` interfaces, not collapsed.

For v1 the durability provider is not yet a plugin slot — there's exactly one and the code references Zellij directly. The abstraction earns its keep the moment a second provider (tmux, raw process, remote SSH-host with its own multiplexer) is added; that's a follow-up slice.

### The `yyork to build yyork` dogfood loop

The acceptance criterion for v1 isn't "all the planned commands work." It's "I can open `yyork`, run `yyork spawn --agent=codex --prompt='...'` against this repo, attach the browser terminal, watch the agent work, and stop it cleanly — all without touching the original `ao` CLI." When that loop is solid, the Canvas Review panel, hook infrastructure, dashboard spawn, plugin ecosystem, and everything else stop being parasitic and become real product layers.

### Migration path from existing AO state

There is none, deliberately. Users with existing `~/.agent-orchestrator/` state can keep using the original `ao` CLI in parallel; yyork writes to a separate location (`~/.yyork/state.db`) and reads only from there. The legacy `internal/ao` reader is deleted rather than kept as a migrator — no `yyork import-from-ao` is planned.

### Forward compatibility for hooks

The engine sets `YYORK_SESSION_ID` on the agent's environment from day one, even though no v1 hook reads it. The `GetAgentHooks` method on the plugin interface is kept, with Codex's implementation as a no-op. When the hook slice lands (likely with Claude Code as the first hook-supporting agent plugin), the plumbing already exists — what gets added is:

- A `yyork session set` CLI subcommand (the helper binary hooks call back into).
- `GetAgentHooks` calls in the spawn flow.
- Per-plugin hook installer implementations.

None of these require changes to the v1 storage, event bus, or session lifecycle.

### Forward compatibility for resume

`GetRestoreCommand` stays defined on the plugin interface. Past session rows (terminated and failed) remain in SQLite, which leaves two viable paths when resume lands:

1. **Resume from a past yyork session row** — pick a terminated session whose `metadata` contains an agent-native thread id (captured by a future hook slice), spawn a new session pointed at that thread.
2. **Resume from the agent's own storage** — plugin-level `ListResumableThreads()` scans `~/.codex/sessions/`, `~/.claude/projects/...`, etc., independent of yyork's database.

Both work; the persisted rows give us option (1) without forcing it. The session-history view that hidden terminated rows enable is the same forensic surface that powers resume — one mechanism, two features.
