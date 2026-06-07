# Data Model & Schema

Companion to [PRD.md](./PRD.md) and [PLAN.md](./PLAN.md). The PRD describes *what* and *why*; this doc describes the **persisted shape** of yyork's state — every table, why it looks the way it does, and the rules for evolving it.

Source of truth is the migrations under [`internal/store/migrations/`](../../internal/store/migrations/). This doc explains them; if the two ever disagree, the SQL wins.

## Design principles

1. **The database is a mirror of *live* state, not a log.** A row exists in `sessions` **if and only if** that session is currently alive. Termination — explicit stop, reconciler detecting a dead zellij session, or spawn rollback — *deletes* the row. There is no history table, no archive, no soft-delete `lifecycle_state` column. "What's running right now?" is the only question this database answers, and it answers it with `SELECT * FROM sessions`.

2. **Local-first, single-file, zero-ops.** The whole database is one SQLite file at `~/.yyork/state.db`. No server, no daemon, no migration tooling the user has to install — migrations are embedded in the binary and applied on startup.

3. **Schema-light, JSON for the long tail.** Columns are reserved for fields yyork queries or indexes on. Plugin-specific odds and ends (a codex thread id, etc.) go into a single `metadata` JSON blob rather than sprouting columns the core doesn't understand.

4. **Timestamps are unix seconds (`INTEGER`).** Stored as `INTEGER NOT NULL`, marshalled to/from `time.Time` (UTC) in Go. Simpler to compare and index than text timestamps, and free of timezone ambiguity.

## Tables

As of today there is exactly **one** table: `sessions`. The sections below describe it in full and record the conventions any future table must follow.

### `sessions`

One running yyork agent session — a git worktree + a zellij session + the agent process inside it.

| Column | Type | Null | Description |
|---|---|---|---|
| `id` | `TEXT` | no (**PK**) | Session identifier. Also names the worktree branch (`yyork/{id}`) and the zellij session. |
| `project_path` | `TEXT` | no | Absolute path of the project the session was spawned on. Indexed. |
| `project_name` | `TEXT` | yes | Human-friendly project label. Derived/optional. |
| `agent_plugin` | `TEXT` | no | Which agent plugin drives the session (e.g. `codex`). |
| `workspace_path` | `TEXT` | no | Absolute path to the session's git worktree. |
| `zellij_session` | `TEXT` | no | Name of the backing zellij session the browser terminal attaches to. |
| `pid` | `INTEGER` | yes | Agent process id when known; `NULL` until set. |
| `metadata` | `TEXT` | yes | Plugin-specific fields as a JSON object. `NULL`/empty when there are none. |
| `created_at` | `INTEGER` | no | Spawn time, unix seconds (UTC). |
| `updated_at` | `INTEGER` | no | Last mutation time, unix seconds (UTC). Bumped on every write. |

**Indexes**

| Name | Definition | Serves |
|---|---|---|
| `idx_sessions_project` | `(project_path)` | `ListByProject` — the dashboard's per-project grouping. |
| `idx_sessions_updated` | `(updated_at DESC)` | Most-recently-active-first ordering. |

**Access pattern** — the Go repository (`internal/store/sessions.go`) is the only writer:

- `Insert` — spawn persists a new row; defaults `created_at`/`updated_at` to now.
- `Get` / `List` / `ListByProject` — reads; lists order by `created_at DESC`.
- `Delete` — termination removes the row. Deleting a missing id is a **no-op** (idempotent-stop contract).
- `UpdatePID` — write the agent pid once the process exists.
- `MergeMetadata` — shallow-merge fields into the JSON blob, preserving untouched keys, in one transaction.

## Runtime & migrations

- **Driver:** [`github.com/ncruces/go-sqlite3`](https://github.com/ncruces/go-sqlite3) — real upstream SQLite compiled to WebAssembly and run by wazero. **No cgo**, so the binary stays statically linked and cross-compiles cleanly.
- **Migrations:** [`pressly/goose/v3`](https://github.com/pressly/goose), embedded via `//go:embed migrations/*.sql`. `store.Open` runs all pending up-migrations on startup; it's idempotent (a second call finds nothing pending).
- **Pragmas applied on open:**

  | Pragma | Value | Why |
  |---|---|---|
  | `journal_mode` | `WAL` | Concurrent readers don't block the writer. |
  | `synchronous` | `NORMAL` | WAL durability without an fsync per write. |
  | `foreign_keys` | `ON` | Enforce relational integrity (matters once a second table arrives). |
  | `busy_timeout` | `5000` ms | Absorb brief writer contention instead of erroring. |

## Conventions for new tables

When the model grows beyond `sessions`, keep it consistent:

1. **One migration per change**, named `NNNN_verb_noun.sql`, with both `-- +goose Up` and `-- +goose Down`. Never edit a migration that has shipped — add a new one.
2. **Add columns only for what you query or index.** Everything else belongs in a JSON blob.
3. **Timestamps are `INTEGER` unix seconds**, named `created_at` / `updated_at`.
4. **Decide the liveness contract explicitly.** If a new table is meant to outlive the thing it describes (history, audit, results), say so here — it would be the first table that breaks principle #1, and that's a deliberate decision, not a default.
5. **Update this doc and the diagram below in the same PR as the migration.**

## Diagram

```
                      ~/.yyork/state.db  (SQLite, WAL)
  ┌──────────────────────────────────────────────────────────┐
  │  sessions                                                  │
  │  ─────────────────────────────────────────────────────    │
  │  id              TEXT  PK                                  │
  │  project_path    TEXT  NOT NULL   ─┐ idx_sessions_project  │
  │  project_name    TEXT                                      │
  │  agent_plugin    TEXT  NOT NULL                            │
  │  workspace_path  TEXT  NOT NULL                            │
  │  zellij_session  TEXT  NOT NULL                            │
  │  pid             INTEGER                                   │
  │  metadata        TEXT            (JSON blob)               │
  │  created_at      INTEGER NOT NULL                          │
  │  updated_at      INTEGER NOT NULL ─┐ idx_sessions_updated  │
  │                                    DESC                    │
  │  row exists  ⟺  session is alive                          │
  └──────────────────────────────────────────────────────────┘
```
