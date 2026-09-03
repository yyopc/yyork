# Settings Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Paper settings screen at `/settings`, persist every control, apply the defaults to yyork behavior, and prove the route with automated tests plus a Webreel recording.

**Architecture:** Keep the TanStack route thin and place the screen under a dedicated `settings` feature. Reuse the existing theme provider, agent-default storage, project-settings API, app sidebar, and topbar; add one small local preference module for the global worker-workspace default and expose the existing stop-confirmation preference through `WorkspaceContext` so changes take effect immediately.

**Tech Stack:** React 19, TanStack Router, Base UI/shadcn primitives, Tailwind v4 semantic tokens, Vitest Browser, Playwright, Go `net/http`, Webreel.

## Global Constraints

- Match the sole approved Paper artboard at 1440x900: 760px content column, 96px desktop inset, 56px top padding, 72px rows, Geist, and semantic `app.css` colors.
- Keep only five controls: theme, default worker workspace, stop confirmation, default orchestrator, and default worker.
- Use `internal/web/public/agent-icons/claude-agent.svg` and `codex-agent.svg` exactly.
- Keep project-specific workspace controls contextual; do not add project settings UI.
- Preserve unrelated dirty-worktree changes and do not commit.

---

### Task 1: Persist the global worker-workspace default

**Files:**
- Create: `internal/web/src/features/settings/data/settings-preferences.unit.spec.ts`
- Create: `internal/web/src/features/settings/data/settings-preferences.ts`

**Interfaces:**
- Produces: `readSettingsPreferences(): SettingsPreferences` and `writeSettingsPreferences(preferences: SettingsPreferences): void`.
- Produces: `SettingsPreferences = { defaultWorkerWorkspaceMode: WorkerWorkspaceMode }` with `local` as the defensive fallback.

- [ ] **Step 1: Write the failing unit tests** for default, invalid JSON, normalization, and persistence.
- [ ] **Step 2: Run the focused unit test** with `pnpm --filter @yyork/web test:unit -- src/features/settings/data/settings-preferences.unit.spec.ts`; expect failure because the module does not exist.
- [ ] **Step 3: Implement versioned localStorage persistence** under `yyork.settings.preferences`, normalizing all stale or invalid values to `local`.
- [ ] **Step 4: Re-run the focused unit test**; expect all cases to pass.

### Task 2: Make the settings controls functional and faithful

**Files:**
- Create: `internal/web/src/features/settings/components/molecules/settings-row.tsx`
- Create: `internal/web/src/features/settings/components/molecules/settings-agent-select.tsx`
- Create: `internal/web/src/features/settings/pages/settings.tsx`
- Create: `internal/web/src/features/settings/pages/settings.browser.spec.tsx`
- Modify: `internal/web/src/features/home/pages/workspace-context.ts`
- Modify: `internal/web/src/features/home/pages/workspace-layout.tsx`

**Interfaces:**
- Consumes: `useTheme`, `readAgentHarnessDefaults`, `writeAgentHarnessDefaults`, and the settings preference API from Task 1.
- Extends `WorkspaceContextValue` with `confirmBeforeStoppingSessions: boolean` and `onConfirmBeforeStoppingSessionsChange(value: boolean): void`.
- Produces: `SettingsPage` with accessible labels and stable `data-testid` hooks for recording.

- [ ] **Step 1: Write the failing browser test** that renders the page in `ThemeProvider` and `WorkspaceContext`, changes all five controls, and asserts theme, localStorage, and immediate stop-confirmation callbacks.
- [ ] **Step 2: Run the focused browser test** with `pnpm --filter @yyork/web test:browser -- src/features/settings/pages/settings.browser.spec.tsx`; expect failure because the page does not exist.
- [ ] **Step 3: Build the two reusable molecules**: a responsive 72px settings row and an agent select that renders the supplied 12px SVG assets.
- [ ] **Step 4: Build `SettingsPage`** with the Paper copy, two editorial sections, segmented theme control, workspace select, semantic switch, and two agent selects.
- [ ] **Step 5: Wire stop confirmation through the live workspace reducer** by storing the inverse `skipStopSessionConfirmation` value and updating layout state in the same window.
- [ ] **Step 6: Re-run the focused browser test**; expect all interactions to pass.

### Task 3: Add the route and integrate it into the app shell

**Files:**
- Create: `internal/web/src/routes/_app.settings.tsx`
- Modify: `internal/web/src/routes/__root.tsx`
- Modify: `internal/web/src/features/home/components/organisms/project-orchestrator-sidebar.tsx`
- Modify: `internal/web/src/features/home/components/organisms/project-orchestrator-sidebar.browser.spec.tsx`
- Modify: `internal/web/src/features/home/components/organisms/main-topbar.tsx`
- Modify: `internal/web/src/features/home/pages/workspace-layout.tsx`
- Generated: `internal/web/src/route-tree.gen.ts`

**Interfaces:**
- Produces: `/settings` as a child of the existing `_app` shell.
- Changes the sidebar footer from a disabled settings menu to a direct TanStack `Link` with active styling.
- Adds `minimal?: boolean` to `MainTopbar` so settings shows the yyork brand without project or canvas actions.

- [ ] **Step 1: Extend the sidebar browser test** to require a real `/settings` link and active-state classes; run it and confirm the old dropdown fails the expectation.
- [ ] **Step 2: Add the route file** as a thin `createFileRoute('/_app/settings')` wrapper around `SettingsPage`.
- [ ] **Step 3: Replace the root-level `?mock=settings` override** with an unconditional router outlet.
- [ ] **Step 4: Convert the sidebar footer to a direct link** and mark it active on `/settings`.
- [ ] **Step 5: Render the minimal topbar on the settings pathname** while preserving all existing workspace routes.
- [ ] **Step 6: Run the focused sidebar and settings browser tests**; expect both to pass and route generation to include `/settings`.

### Task 4: Apply the workspace default when projects are created

**Files:**
- Modify: `internal/server/projects_test.go`
- Modify: `internal/server/projects.go`
- Modify: `internal/web/src/features/home/data/workspace.unit.spec.ts`
- Modify: `internal/web/src/features/home/data/workspace.ts`
- Modify: `internal/web/src/features/home/pages/workspace-layout.tsx`

**Interfaces:**
- Extends `POST /api/projects` with optional `workerWorkspaceMode: 'local' | 'new-worktree'`.
- Reuses `ProjectSettingsRepo.SetWorkerWorkspaceMode` after the project path resolves.
- Extends `createProjectMutationOptions` input with `workerWorkspaceMode`.

- [ ] **Step 1: Add a failing Go handler test** proving create-project validates and stores `workerWorkspaceMode` together with the worker agent.
- [ ] **Step 2: Run `go test ./internal/server -run 'TestHandleCreateProject'`**; expect the new test to fail because the field is ignored.
- [ ] **Step 3: Implement request validation and persistence** without changing existing project-scoped precedence.
- [ ] **Step 4: Add a failing web data test** proving the JSON body carries the selected workspace default.
- [ ] **Step 5: Extend the mutation and project-setup caller** to read `SettingsPreferences` when creating a project.
- [ ] **Step 6: Re-run both focused suites**; expect all create-project cases to pass.

### Task 5: Verify the route and record the full flow

**Files:**
- Create: `internal/web/e2e/settings.spec.ts`
- Create: `artifacts/settings-route/webreel.config.json`
- Create: `artifacts/settings-route/settings-paper-reference.png`
- Create: `artifacts/settings-route/settings-implementation.png`
- Create: `artifacts/settings-route/videos/settings-route-e2e.mp4`
- Create: `design-qa.md`

**Interfaces:**
- The Playwright test opens `/settings`, changes every control, reloads, and verifies persistence plus return navigation.
- The Webreel config drives the d3k-owned yyork browser at `https://yyork.localhost`, demonstrates every control, revisits the route, and captures the final state.

- [ ] **Step 1: Add the failing Playwright flow** and confirm `/settings` or its interactions fail before the route is complete.
- [ ] **Step 2: Run focused static verification**: web unit/browser tests, TypeScript lint, Go server tests, and web build.
- [ ] **Step 3: Start or reuse `pnpm d3k:agent`**, open `https://yyork.localhost/settings`, test the interactions, and check `d3k errors --context`.
- [ ] **Step 4: Capture the implementation at 1440x900**, compare it with the exported Paper artboard, fix all P0/P1/P2 drift, and write `design-qa.md` with `final result: passed`.
- [ ] **Step 5: Validate and preview Webreel** with the project-pinned CLI and shared d3k browser.
- [ ] **Step 6: Record the MP4**, verify it exists and is non-empty, and inspect its final frame.
- [ ] **Step 7: Run React Doctor and the final focused verification set**; report only fresh results.
