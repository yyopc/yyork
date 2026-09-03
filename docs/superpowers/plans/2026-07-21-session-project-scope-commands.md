# Project-scoped session commands in yyork CLI

> **For agentic workers:** implement this as single-worker checklist items; keep to one pass and preserve existing dirty checkout.

**Goal:** Prevent accidental cross-project session control from the CLI while keeping dashboard cross-project visibility intact.

## Pre-change behavior (source-cited at planning time)
- State is a single shared DB at `~/.yyork/state.db` with `sessions` rows containing `project_path`, and the row exists only while a session is alive (`internal/store/store.go:48-57`, `internal/store/sessions.go:12-16`, `14-16`, `49-54`).
- `yyork session list` opens the shared store directly and builds workspace from all store rows via `StoreWorkspaceSource.Workspace()`, then only filters by `--project` when provided (`internal/cli/commands.go:427-442`, `443-454`, `448-454`, `internal/session/workspace_source.go:42-46`).
- `session list` output already includes project in human/JSON forms (`internal/cli/commands.go:474-482`, `637-653`, `723-727`, `684-686`).
- `yyork stop <sessionID>` uses `buildEngine` and `eng.Stop` directly with no project ownership check (`internal/cli/commands.go:540-548`, `internal/cli/commands.go:143-151`, `internal/session/engine.go:877-887`).
- `yyork send --session <sessionID> <message>` resolves session rows from workspace across all projects and then sends by session ID, with optional `--project` only for disambiguation today (`internal/cli/commands.go:592-605`, `581-579`, `19-67` in `internal/durabilityprovider/send.go`).
- Spawn already has a “current project” notion resolved from `YYORK_PROJECT_PATH` then cwd (`internal/cli/commands.go:228-234`, `351-365`), and that value is set on session requests (`internal/cli/commands.go:254-256`).
- The `session` command contains only the `list` subcommand. `stop [sessionID]` and `send --session <sessionID> <message>` are separate top-level commands (`internal/cli/commands.go:404-425`, `486-505`, `560-579`).
- Dashboard/server paths are separate: CLI session list/stop/send do not call server HTTP APIs, while server still exposes legacy endpoints; `GET /api/sessions` and `DELETE /api/sessions/{sessionID}` are global unless `?project=` is passed for list (`internal/server/server.go:287-290`, `internal/server/sessions.go:381-404`, `98-120`).

## Proposed behavior
1. Scope model
1.1 Default command scoping should use caller project unless explicitly widened. Use `YYORK_PROJECT_PATH` else cwd-derived current project path with the exact absolute-path normalization used by spawn; do not add symlink resolution (`internal/cli/commands.go:351-365`).
1.2 `session list` default behavior becomes current-project scoped. Keep a new flag `--all` to return all projects.
1.3 Preserve `--project` for an explicit scoped query, but accept only a `projectId` value. Reject filesystem paths.
1.4 Keep `PROJECT` in human output and ensure JSON always includes `projectId`/`projectPath` (`internal/cli/commands.go:474-482`, `637-653`, `684-686`).
1.5 Do not add a suppression notice or hidden-session count to human output.

2. Mutating commands: stop/send hard-fail outside current project
2.1 Add a project-owner guard to the session-targeting `yyork stop <sessionID>` path before `eng.Stop`: resolve the current project ID, load the target row, derive its owning project ID, and hard-fail on mismatch.
2.2 Add a project-ID-only `--project` override to the top-level `yyork stop [sessionID]` command. Reject `stop --project <id>` when no session ID is supplied; plain no-argument `stop` remains server shutdown.
2.3 Continue to keep idempotent no-op semantics when id is truly absent from DB (to preserve current contract).
2.4 For cross-project blocked stop, use this exact error text:
`stop: blocked cross-project target: session <id> belongs to project <ownerProjectId>; rerun with --project <ownerProjectId> to act intentionally`
2.5 For `yyork send --session <sessionID> <message>`, treat project ID as an ownership confirmation rather than ID disambiguation. Resolve the target by its store-unique session ID, then guard by owning project before revive/send.
2.6 For cross-project blocked send, use this exact error text:
`send: blocked cross-project target: session <id> belongs to project <ownerProjectId>; rerun with --project <ownerProjectId> to act intentionally`
2.7 Keep `--session` required and existing message semantics for message validation.
2.8 Active duplicate IDs need no resolution policy because `sessions.id` is the shared table primary key. Random-ID collision retry and reuse after row deletion remain out of scope.

3. Other mutating commands to inventory and scope decision
3.1 Session-targeting mutators in the current CLI are the top-level commands `yyork stop <sessionID>` and `yyork send --session <sessionID> <message>`; `yyork session list` is read-only (`internal/cli/commands.go:404-425`, `486-505`, `560-579`).
3.2 Server/API mutators (`DELETE /api/sessions/{sessionID}`, restart/patch routes) exist and should remain unchanged by this CLI-focused plan, with dashboard ownership boundaries handled there (`internal/server/sessions.go:98-120`, `340-370`, `288-290`).

4. Back-compat and migration
4.1 Default scoping for `session list` applies to both `--json` and human output; scripts that need global visibility must pass `--all`.
4.2 Keeping `--json` global was rejected because it preserves the discovery path involved in the incident.
4.3 Update orchestrator/system prompts and any worker orchestration scripts that rely on global visibility to explicitly use `--all`.

5. Orchestrator prompt guidance changes
5.1 Update orchestrator prompt guidance to show scoped defaults and explicit override semantics:
- `yyork session list --json --all` for cross-project discovery.
- `yyork stop --json <sessionID>` for same-project work.
- `yyork stop --json --project <projectID> <sessionID>` when intentionally acting across projects.
- `yyork send --json --session <id> "..."` as same-project default.
- `yyork send --json --project <projectID> --session <id> "..."` when intentionally cross-project.
5.2 Update `internal/session/prompts/orchestrator.md` and corresponding prompt tests (`internal/session/prompts_test.go`).

6. Server/API + dashboard implications
6.1 CLI commands are already DB/engine-local for list/stop/send; dashboard traffic can stay server/API-native and cross-project by design.
6.2 Because dashboard is intentionally cross-project, avoid forcing project scoping at server route layer in this pass; do not change `/api/sessions` contracts.
6.3 Ensure any CLI server-side request field path remains future-ready: if this plan is later expanded to API-only clients, pass explicit current project in request metadata for server guardrails.

7. Testing plan
7.1 Unit + command-level tests should be added before implementation:
- `internal/cli/main_test.go`: seeded rows for at least two project paths.
- `yyork session list` same-project default filter (env-specified and cwd-specified), `--all`, explicit project-ID filter, mutually exclusive flags, rejected path input, and no human suppression notice.
- `yyork stop <sessionID>`: same-project allowed, cross-project blocked before Zellij, matching project-ID override allowed, wrong override blocked, missing id remains no-op, and no-argument `stop --project` rejected.
- `yyork send --session <sessionID> <message>`: same-project send succeeds, cross-project blocked before revive/send, matching project-ID override succeeds, wrong override is blocked, and path overrides are rejected.
- helper tests for project resolution precedence (`YYORK_PROJECT_PATH` over cwd).
7.2 Update existing command JSON assertions to verify `projectPath` is present and that list `Count` reflects scoped rows (`internal/cli/main_test.go:270-330`).
7.3 Update `internal/session/prompts_test.go` assertions if prompt copy changes; keep required tokens assertions stable.
7.4 Optional integration smoke: one manual CLI check with real multi-project seeded state at `https://yyork.localhost` to verify dashboard visibility is unchanged.

8. Rollout sequence and compatibility
8.1 Ship in the next alpha release with a changelog entry; no additional sequencing is required.
8.2 Add changelog note in release-ready text mentioning:
- default project scoping for `session list`, `stop`, `send`
- `--all` for global list
- `--project` override required to act across projects
- `--project` now accepts project IDs only, not filesystem paths

## Task-by-task implementation checklist
- [x] Add shared current-project ID resolution for CLI commands with tests for `YYORK_PROJECT_PATH` and cwd fallback.
- [x] Add `--all` to `session list`; update resolver/filter logic in `runSessionList` for default per-project scope and optional global mode.
- [x] Keep human list output scoped without a suppression notice.
- [x] Add `--project` override to `stop`, plus a preflight project-owner check before `eng.Stop`.
- [x] Update `runSend` to preflight owner project before revival/send; preserve existing revive behavior and existing message output contracts.
- [x] Add/adjust CLI tests for scope/mismatch/override and env/cwd resolution.
- [x] Update orchestrator prompt copy and its test assertions in `internal/session/prompts/orchestrator.md` and `internal/session/prompts_test.go`.
- [x] Add an unreleased changelog entry.
- [ ] Optional follow-up: add a follow-up hardening task for server API routes if cross-project safety is later needed for non-CLI clients.
