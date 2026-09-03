# Live Codex Terminal Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one running Codex worker adapt its semantic composer palette when yyork switches between light and dark themes.

**Architecture:** Preserve Codex's focus-reporting mode in terminalhost snapshots, let an attached xterm own OSC 10/11 replies, and send one focus-gained refresh after session replay and each real theme transition. Keep the light startup fallback only when no browser client is attached.

**Tech Stack:** Go, charmbracelet/x/vt, charmbracelet/x/ansi, React, xterm.js 6, Vitest Browser, Webreel.

## Global Constraints

- Do not restart active sessions.
- Do not remount xterm when switching sessions.
- Use the canonical `https://yyork.localhost` runtime.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Terminal-host protocol ownership

**Files:**
- Modify: `internal/terminalhost/host.go`
- Test: `internal/terminalhost/host_test.go`

**Interfaces:**
- Consumes: x/vt OSC handlers and mode callbacks.
- Produces: reconnect snapshots containing `ansi.SetModeFocusEvent`; fallback OSC responses only without attached clients.

- [ ] **Step 1: Write failing host tests**

Add tests which enable focus reporting before snapshot and assert the repaint contains `ansi.SetModeFocusEvent`, and which attach a client before OSC 10/11 queries and assert the process receives no host-generated color response.

- [ ] **Step 2: Verify RED**

Run: `go test ./internal/terminalhost -run 'TestHostSnapshotRestoresFocusReporting|TestAttachedBrowserOwnsDefaultColorQueries' -count=1`

Expected: both tests fail against the current hard-coded response/snapshot behavior.

- [ ] **Step 3: Implement minimal host behavior**

Track `ansi.ModeFocusEvent` via `vt.Callbacks.EnableMode` and `DisableMode`; write `ansi.SetModeFocusEvent` into `snapshotLocked` when enabled. Register OSC 10/11 handlers which return `true` only for `?` queries while `len(h.clients) > 0`, allowing x/vt's default handler to answer only without clients.

- [ ] **Step 4: Verify GREEN**

Run: `go test ./internal/terminalhost -count=1`

Expected: package passes with no failures.

### Task 2: Browser palette refresh signaling

**Files:**
- Modify: `internal/web/src/features/home/components/organisms/xterm-terminal.tsx`
- Test: `internal/web/src/features/home/components/organisms/xterm-terminal.browser.spec.tsx`

**Interfaces:**
- Consumes: `term.modes.sendFocusMode`, existing `onData`, theme mutation observer, terminal writes.
- Produces: `TerminalHandle.requestPaletteSync(): void` and a single `\x1b[I` refresh per replay/theme.

- [ ] **Step 1: Write failing browser tests**

Add a test that writes `\x1b[?1004h`, requests a palette sync, and expects exactly one `\x1b[I`. Add a second test that flips `.dark` and back and expects one additional focus event per transition, with xterm's resolved background matching each theme.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @yyork/web exec vitest run src/features/home/components/organisms/xterm-terminal.browser.spec.tsx`

Expected: tests fail because `requestPaletteSync` and transition signaling do not exist.

- [ ] **Step 3: Implement minimal browser behavior**

Add a pending palette-sync flag and helper which emits `\x1b[I` only when `term.modes.sendFocusMode` is true. Wrap write completion so pending initial/session replay sync runs after mode sequences parse. On a genuine light/dark transition, reapply the xterm theme, mark sync pending, and run the helper.

- [ ] **Step 4: Reset sync on session changes**

In `terminal-panel.tsx`, call `terminalRef.current?.requestPaletteSync()` alongside the existing reset/replay preparation so the reused xterm synchronizes each newly attached session.

- [ ] **Step 5: Verify GREEN**

Run the focused browser spec and `pnpm --filter @yyork/web lint:ts`.

Expected: all focused tests pass and TypeScript exits zero.

### Task 3: Runtime proof and recording

**Files:**
- Create or modify: `artifacts/codex-live-theme/webreel.config.json`
- Output: `artifacts/codex-live-theme/videos/codex-live-theme.mp4`

- [ ] **Step 1: Restart the existing dev stack**

Restart `pnpm d3k:agent` in yyork's Zellij `dev server` tab and confirm `d3k status --json` reports `ready: true` at `https://yyork.localhost`.

- [ ] **Step 2: Spawn one fresh Codex verification worker**

Use `go run . spawn --json --type worker --agent codex --prompt "Verification only; remain at the composer."` and retain its session id for every check.

- [ ] **Step 3: Verify both transitions on the same worker**

Inspect xterm buffer cells after light, dark, and light transitions. Expected composer backgrounds are light gray near `#f4f4f4`, dark gray derived from `#0a0a0a`, then light gray again, with the session id unchanged.

- [ ] **Step 4: Record with Webreel**

Validate and record a 60 FPS, quality-90 script that opens the worker, pauses on light, switches dark, pauses, switches light, and captures screenshots.

- [ ] **Step 5: Final verification**

Run `git diff --check`, Go terminal suites, focused browser tests, `ffprobe` on the MP4, and `d3k errors --context`.
