# VS Code Terminal Scroll Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Codex ED2 redraws from forcing a scrolled-up yyork terminal back to live bottom by matching VS Code's xterm erase behavior.

**Architecture:** Keep xterm responsible for scroll position. Remove yyork's PuTTY-style `scrollOnEraseInDisplay: true` override so the installed xterm default (`false`), also used by VS Code, clears only the viewport instead of pushing each TUI redraw into scrollback. Preserve the existing session-switch and reconnect scroll restoration logic.

**Tech Stack:** React, TypeScript, xterm.js, Vitest Browser Mode.

## Global Constraints

- Preserve all unrelated dirty-checkout changes.
- Do not add manual per-frame viewport restoration.
- Verify through `https://yyork.localhost` using the already-running d3k runtime.
- Do not commit unless the user explicitly requests it.

---

### Task 1: Match VS Code erase and scroll behavior

**Files:**
- Modify: `internal/web/src/features/home/components/organisms/xterm-terminal.tsx`
- Test: `internal/web/src/features/home/components/organisms/xterm-terminal.browser.spec.tsx`

**Interfaces:**
- Consumes: xterm's `scrollOnEraseInDisplay` option and normal-buffer `viewportY`/`baseY` behavior.
- Produces: a terminal whose ED2 redraws do not append the erased screen to scrollback or force a historical viewport to live bottom.

- [ ] **Step 1: Write the failing regression test**

Change the VS Code baseline assertion to expect `scrollOnEraseInDisplay` to be false. Add a test that writes enough normal-buffer lines for scrollback, scrolls to a historical viewport, sends `\x1b[2J\x1b[H` plus replacement screen content, and asserts the captured `viewportY` remains unchanged.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
pnpm --filter @yyork/web test:browser -- xterm-terminal.browser.spec.tsx
```

Expected: FAIL because the current terminal sets `scrollOnEraseInDisplay` to true and an ED2 redraw changes the historical viewport.

- [ ] **Step 3: Apply the minimal implementation**

Remove the explicit `scrollOnEraseInDisplay: true` option from `XTermTerminal`. Rely on xterm's default false value, matching VS Code's construction path.

- [ ] **Step 4: Run focused and adjacent terminal tests**

Run:

```bash
pnpm --filter @yyork/web test:browser -- xterm-terminal.browser.spec.tsx terminal-panel.browser.spec.tsx
```

Expected: both browser spec files pass, including session replay/restoration coverage.

- [ ] **Step 5: Verify the live regression**

Reuse `d3k status --json`, open a working terminal at `https://yyork.localhost`, scroll to history, allow new Codex output to arrive, and confirm `viewportY` and visible history anchors remain stable. Return manually to bottom and confirm new output follows live bottom.

- [ ] **Step 6: Run final quality checks**

Run the focused web lint/typecheck path available in package scripts, `npx react-doctor@latest --verbose --diff`, and `git diff --check`. Expected: no new errors from the changed files.
