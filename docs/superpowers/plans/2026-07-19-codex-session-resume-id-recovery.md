# Codex Session Resume ID Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the canonical Codex transcript ID and restore access to corrupted yyork-project sessions.

**Architecture:** Make `agentSessionId` write-once in the shared hook normalization path. Repair existing rows separately after validating an unambiguous rollout mapping, then recreate only failed Zellij runtimes so yyork's existing lazy revive path resumes the canonical conversation.

**Tech Stack:** Go, SQLite JSON metadata, Codex rollout JSONL, Zellij, d3k.

## Global Constraints

- Preserve all unrelated dirty-checkout changes.
- Do not delete yyork session rows, worktrees, or branches.
- Use the canonical `https://yyork.localhost` surface for final UI verification.

---

### Task 1: Preserve the first Codex session ID

**Files:**
- Modify: `internal/cli/hooks.go`
- Test: `internal/cli/hooks_test.go`

**Interfaces:**
- Consumes: `hookFields(context.Context, store.SessionRepo, string, string, string, []byte)`
- Produces: write-once `metadata.agentSessionId` behavior.

- [ ] Add a test that inserts a session, sends `session-start` with `canonical-1`, sends it again with `transient-2`, and expects `canonical-1`.
- [ ] Run `go test ./internal/cli -run TestRunCodexHookPreservesFirstAgentSessionID -count=1` and confirm it fails by returning `transient-2`.
- [ ] In the `session-start` branch, load the row and set the incoming ID only when existing `agentSessionId` is empty.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Repair corrupted yyork-project rows

**Files:**
- Runtime data: `~/.yyork/state.db`
- Evidence: `~/.codex/sessions/**/rollout-*.jsonl`

**Interfaces:**
- Consumes: yyork session creation timestamp, project path, existing Codex history and rollout filenames.
- Produces: corrected `metadata.agentSessionId` values with all other metadata preserved.

- [ ] Back up the live SQLite database using SQLite's backup command.
- [ ] Enumerate yyork-project Codex rows whose stored ID has no rollout filename.
- [ ] Derive and verify each canonical rollout ID; skip any ambiguous row.
- [ ] Update only `metadata.agentSessionId` for verified mappings and re-query every repaired value.
- [ ] Force-delete only the failed Zellij runtime for each repaired, inaccessible session; retain the same session name.

### Task 3: Verify recovery

**Files:**
- Test: `internal/cli/hooks_test.go`
- Runtime: d3k-managed `https://yyork.localhost`

**Interfaces:**
- Consumes: repaired store and write-once hook behavior.
- Produces: accessible resumed sessions and regression evidence.

- [ ] Run `go test ./internal/cli ./internal/session ./internal/server ./internal/durabilityprovider`.
- [ ] Confirm every yyork-project Codex `agentSessionId` resolves to a rollout filename.
- [ ] Open the orchestrator through the d3k-managed browser when available and confirm the prior conversation renders without `No saved session found`.
- [ ] Run `d3k errors --context` and report any remaining environment gate or runtime error.

