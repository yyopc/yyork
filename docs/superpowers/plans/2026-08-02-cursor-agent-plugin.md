# Cursor Agent Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cursor's `agent` CLI as a fully registered yyork agent with model configuration, resumable sessions, managed hooks, approval triage, title/recap metadata, and fork argv.

**Architecture:** A new `internal/plugin/agent/cursor` package owns Cursor argv, model discovery, binary resolution, and additive `.cursor/hooks.json` management. The shared CLI hook driver maps Cursor events into yyork metadata and emits Cursor hook response bodies for system context and approval verdicts. Existing engine/store infrastructure supplies config and persists the rendered system prompt for the session-start carrier.

**Tech Stack:** Go, Cobra, JSON hook configuration, Cursor Agent CLI, yyork session/store infrastructure.

## Global Constraints

- Treat `docs/superpowers/specs/2026-08-01-cursor-agent-plugin-design.md` and the user's corrections as authoritative.
- Inject the rendered system prompt only at `sessionStart`; live evidence showed the context survives `--resume` without another `sessionStart`.
- Preserve the landed env scrub, `agent.Config` wiring, and hook ownership de-duplication.
- Do not add Cursor question triage, `beforeShellExecution`, `afterAgentThought`, xterm changes, or `internal/web` changes.
- Never stage all files, commit, or disturb unrelated dirty-checkout changes.

---

### Task 1: Accept Cursor as a session agent ID

**Files:**
- Modify: `internal/session/session.go`
- Test: `internal/session/id_test.go`

**Interfaces:**
- Consumes: `NormalizeAgentPlugin(raw string) (string, bool)`
- Produces: normalization support for the exact ID `cursor`

- [ ] Add a table case asserting `NormalizeAgentPlugin("cursor") == ("cursor", true)`.
- [ ] Run `go test ./internal/session -run NormalizeAgentPlugin` and confirm the new case fails because Cursor is rejected.
- [ ] Add `cursor` to the normalization switch.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Implement Cursor command and model contracts

**Files:**
- Create: `internal/plugin/agent/cursor/cursor.go`
- Create: `internal/plugin/agent/cursor/cursor_test.go`

**Interfaces:**
- Produces: `New() *Plugin`, `ResolveCursorBinary(context.Context) (string, error)`, and implementations of `plugin.Plugin`, `agent.Agent`, and `agent.Forker`
- Produces: `parseModels(string) []string` and model validation that accepts every non-empty string while treating the enum as suggestions only

- [ ] Add command tests for launch, restore, fork, title, and recap argv, including `auto` omission and verbatim parameterized model forwarding.
- [ ] Add model-output parsing tests that split only on the first ` - ` and ignore the display-side `(current)` suffix.
- [ ] Run `go test ./internal/plugin/agent/cursor` and confirm it fails because the package implementation is absent.
- [ ] Implement the smallest command builders, model cache/discovery, permission flags, manifest, prompt delivery strategy, and `agent` binary resolver needed by those tests.
- [ ] Re-run the Cursor package tests and refactor only while they stay green.

### Task 3: Manage `.cursor/hooks.json` additively

**Files:**
- Create: `internal/plugin/agent/cursor/hooks.go`
- Extend: `internal/plugin/agent/cursor/cursor_test.go`

**Interfaces:**
- Produces: `GetAgentHooks`, `UninstallHooks`, and `AreHooksInstalled`
- Persists entries shaped as `{command,type,timeout,failClosed,matcher}` under top-level `version: 1`

- [ ] Add tests proving install preserves user events/hooks, installs the seven required Cursor event registrations, uses timeout 30 and `failClosed:false`, and omits forbidden events.
- [ ] Add idempotence and uninstall tests that recognize yyork commands by their `hooks cursor` ownership prefix/infix and leave user hooks untouched.
- [ ] Run the focused Cursor tests and confirm missing hook behavior fails.
- [ ] Implement raw-map JSON round-tripping and managed-entry replacement/removal.
- [ ] Re-run the focused tests and keep the written file stable across a second install.

### Task 4: Extend the shared hook driver for Cursor

**Files:**
- Modify: `internal/cli/hooks.go`
- Modify: `internal/cli/hooks_test.go`
- Modify: `internal/session/engine.go`
- Modify: `internal/session/engine_test.go`

**Interfaces:**
- Consumes: Cursor `text`, `session_id`, `tool_name`, and `tool_input` payload fields
- Produces: `runCursorHook`, `assistant-response` recap-only updates, stop-to-prompt updates, `additional_context` session-start response, and `permission:"ask"` pre-tool verdicts

- [ ] Add failing hook-driver tests proving `afterAgentResponse.text` updates recap without changing state and `stop` changes state to `prompt` without requiring response text.
- [ ] Add failing tests proving session-start returns the stored system prompt (truncated to 10,000 characters) and approval triage returns `{"permission":"ask"}` only for the Cursor permission policy.
- [ ] Add a failing engine test proving rendered system prompt and permission mode are available to Cursor hooks without changing the landed config/env-scrub behavior.
- [ ] Implement Cursor event routing, structured hook-response writing, recap/stop separation, and the shared policy predicate; do not add `AskQuestion` handling.
- [ ] Persist the rendered prompt in session metadata and pass the permission mode in the durability environment for spawn/fork/restart.
- [ ] Run `go test ./internal/cli ./internal/session` and resolve only failures caused by these contracts.

### Task 5: Register Cursor across Go entry points

**Files:**
- Modify: `internal/app/app.go`
- Modify: `internal/cli/commands.go`
- Modify: `internal/cli/doctor.go`
- Modify: `internal/cli/doctor_test.go`
- Modify: `internal/server/projects.go`
- Modify: relevant existing CLI/server tests

**Interfaces:**
- Consumes: `cursor.New()` and agent ID `cursor`
- Produces: spawn/app registries, hook install/uninstall routing, project validation, and doctor detection for binary `agent`

- [ ] Add failing CLI, doctor, and server cases that use the Cursor ID and expect `agent` as the doctor command.
- [ ] Register `cursor.New()` in both registries, hook switches, metadata builders, CLI help/errors, project validation messages, and doctor specs.
- [ ] Run `go test ./internal/cli ./internal/session ./internal/plugin/...` and fix registration omissions found by tests.

### Task 6: Build and live-verify the complete flow

**Files:**
- Verify only; do not modify `internal/web`

**Interfaces:**
- Consumes: `go run . spawn --type worker --agent cursor --prompt <prompt>` and the canonical `https://yyork.localhost` dashboard
- Produces: evidence for title, working state, recap, prompt state, native session ID, and resume

- [ ] Run `gofmt` on only changed Go files, then `go build ./...`.
- [ ] Run `go test ./internal/cli ./internal/session ./internal/plugin/...`.
- [ ] Reuse or start `pnpm d3k:agent`, require `https://yyork.localhost`, and spawn one Cursor worker with a short tool-using prompt.
- [ ] Observe the dashboard metadata and issue a restart/resume check for the same session.
- [ ] Re-check `git status --short`, inspect only the task diff, and report exact files plus any live limitation without staging or committing.
