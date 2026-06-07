# Canvas PRD

## Goal

Canvas should give a user one in-app inspection surface for the work an AO worker is doing. The first version renders:

- A project or worker file tree.
- Code diffs for a project or worker worktree.
- A local web preview inside the app when the target can be framed.

The user should be able to supervise a worker without bouncing between the AO dashboard, an editor, a browser, and a terminal for every small inspection step.

## Product context

yyork is a local-first Agent Orchestrator dashboard for parallel AI coding work. The current app has:

- A single project/sidebar navigation surface.
- A main workspace where sidebar selection drives the active project or terminal target.
- Real AO workspace data from `/api/workspace`.
- Project and session `cwd` fields from AO metadata.
- Zellij-backed terminal attachment for supported sessions.

Canvas extends the existing workspace instead of adding another navigation rail.

## Inspiration

The interaction model is inspired by the Codex app's thread side panel. Files, Browser, Review, and Terminal are presented as side-panel tabs, not as separate products.

For yyork, the matching concept is:

- Sidebar-driven target selection: project rows open the Kanban board, and session rows open terminals.
- Canvas trigger: a compact right-side toggle button in the selected target header.
- Canvas tabs: `Files`, `Review`, `Browser`.
- Active renderer: the implementation detail behind whichever Canvas tab is selected.

## Default decisions

These are the defaults this PRD chooses.

- Canvas is a contextual right-side panel for the selected project or worker, not a top-level workspace tab.
- The theme switcher should not occupy the right-side workspace action slot; hide/remove it from the sidebar settings menu or workspace chrome so this slot can hold the Canvas toggle.
- Canvas renders exactly one internal tab at a time: Files, Review, or Browser.
- Canvas is read-only in the MVP.
- The selected worker session is the default target. If no worker is selected, use the active project.
- The in-app browser is a local preview iframe first, not a full arbitrary browser.
- Use thin internal adapters around Pierre libraries because both libraries are still moving.
- Preserve the current visual direction: compact, borderless, monospaced, shadcn-first, with square corners.

## Non-goals

- No file editing in the Canvas MVP.
- No full IDE replacement.
- No PR review submission flow.
- No arbitrary external browser with full Chrome-level behavior inside the Vite web app.
- No simultaneous three-pane Canvas that renders Files, Review, and Browser at once.
- No second permanent sidebar.
- No dependency version promise in this PRD. Verify install versions during implementation.

## References

- [Diffs](https://diffs.com/) and [Diffs docs](https://diffs.com/docs)
- [Trees](https://trees.software/) and [Trees docs](https://trees.software/docs)

Useful facts from the current docs:

- `@pierre/diffs` provides React components such as `PatchDiff`, `FileDiff`, `File`, and `UnresolvedFile`, with Shiki-based theming and Shadow DOM/CSS Grid rendering.
- `@pierre/diffs` docs say the library is in early active development and APIs may change.
- `@pierre/trees` provides a path-first model, React wrapper, search, selection, Git status, row annotations, SSR helpers, and virtualization.
- `@pierre/trees` docs say the library is beta and can have small API shifts.

## User stories

1. As a user supervising multiple workers, I can toggle the right-side Canvas panel and inspect the selected worker's worktree without opening my IDE.
2. As a user reviewing a worker, I can see the current diff for that worker and switch between split and stacked layouts.
3. As a user validating a web change, I can open a local preview URL in the app and keep AO context visible.
4. As a user switching workers, the Canvas target follows the selected worker unless I pin a different target.
5. As a user on a project with many files, the file tree stays responsive and searchable.
6. As a user on a blocked browser URL, I get a clear message and an external-open action.

## UX model

### Workspace navigation

Keep the workspace driven by the left sidebar:

```text
Project row -> Kanban board
Session row -> Terminal
```

Do not add a top-level `Canvas` tab. Canvas is opened by a right-side toggle button in the selected target header. That button should use the far-right workspace action space that was previously available to theme/settings chrome.

The selected project or session owns the main surface. Canvas owns its own internal tab switch for `Files`, `Review`, and `Browser` once the right-side panel is open.

### Canvas layout

Canvas is a right-side panel beside the active workspace target:

```text
+--------------------------------------+---------------------+
| Target: Agent Orchestrator / AO-8    | Canvas          X   |
| Terminal or Kanban content           +---------------------+
|                                      | Files Review Browser|
|                                      +---------------------+
|                                      | Tab content         |
+--------------------------------------+---------------------+
```

`Files`, `Review`, and `Browser` are Canvas-internal tabs. Selecting a tab changes what renders in the shared Canvas area; the tabs are not three panels shown side by side.

Use a compact header, not cards. Controls should be icon-first with tooltips where the icon is not obvious.

### Empty state

When there is no target:

- Show the three Canvas tabs as compact actions: Files, Review, Browser.
- Explain the missing target in one sentence.
- Offer `Refresh workspace`.

Do not use a marketing-style empty state.

## Canvas tabs

Only the active Canvas tab should mount its primary renderer and fetch its heavy data. Inactive tabs can keep lightweight preferences, such as selected file path, review layout, or last browser URL, but they should not render a hidden file tree, diff viewer, and iframe simultaneously.

### Files tab

Purpose: inspect the selected target's file hierarchy.

MVP behavior:

- Render a virtualized file tree from the target `cwd`.
- Search by path.
- Show Git status when available.
- Flatten empty directories by default.
- Selecting a file records selection and can later feed a read-only code preview.
- Folders support expand/collapse.
- Refresh reloads paths and Git status.

Preferred library:

- `@pierre/trees/react` behind an internal feature adapter.

Adapter boundary:

```text
CanvasFileTree
  -> accepts BetterAOFileTreeSnapshot
  -> maps to @pierre/trees model
  -> exposes only app-level callbacks
```

The app should not scatter direct `@pierre/trees` calls across feature components.

### Review tab

Purpose: inspect the selected target's changes.

MVP behavior:

- Render the current worktree diff.
- Support split and stacked layout.
- Support line wrapping.
- Support file filtering.
- Show a changed-file summary.
- Show an empty state when there is no diff.
- Refresh recomputes the diff.

Preferred library:

- `@pierre/diffs/react` behind an internal feature adapter.

Adapter boundary:

```text
CanvasDiffView
  -> accepts BetterAODiffSnapshot
  -> chooses PatchDiff or parsed FileDiff path
  -> owns Pierre theme/style mapping
```

The backend should return a normalized diff snapshot. The React app should not shell out or parse the working tree itself.

### Browser tab

Purpose: preview local web output without leaving AO.

MVP behavior:

- URL input.
- Reload.
- Open externally.
- Show current URL and origin.
- Frame local URLs in an iframe.
- Show a useful blocked-state when the target cannot be framed.
- Persist the last URL per Canvas target.

Important browser reality:

A web app cannot reliably embed every external site. Many sites set `X-Frame-Options` or CSP `frame-ancestors` to block framing. This is expected. For those targets, Canvas should show the blocked state and offer `Open externally`.

MVP framing policy:

- Allow `http://localhost:*`, `http://127.0.0.1:*`, and `http://[::1]:*`.
- Allow explicit `https://` URLs only if the user enters them manually.
- Block `file://`, `javascript:`, `data:`, and custom schemes.
- Use a sandboxed iframe profile.
- Use a more permissive sandbox only for localhost previews that need scripts and same-origin behavior.

Future:

- If arbitrary browsing becomes a core requirement, yyork needs a desktop shell or webview-backed runtime. A Vite web dashboard alone cannot provide that.

## Target model

Canvas target selection should be project-scoped, matching the terminal lookup model. Session ids can collide across projects, so every session target must carry both `projectId` and `sessionId`.

```ts
type CanvasTarget =
  | {
      kind: 'project';
      projectId: string;
    }
  | {
      kind: 'session';
      projectId: string;
      sessionId: string;
    };
```

Target resolution:

1. If a worker session is selected, Canvas targets that session.
2. Else if a terminal session is selected, Canvas targets that terminal session.
3. Else target the active project.
4. If the user pins a Canvas target, keep it until the target disappears.

## Frontend state

Extend the existing workspace preference storage, likely as version 2.

```ts
type CanvasTab = 'files' | 'review' | 'browser';

interface CanvasPreferences {
  browserUrlsByTargetKey?: Record<string, string>;
  activeTab: CanvasTab;
  pinnedTargetKey?: string;
  reviewLayout?: 'split' | 'stacked';
  selectedFilePathByTargetKey?: Record<string, string>;
}
```

The target key should include project and session identity.

## Backend API shape

Use project-scoped routes where a session id is involved.

### Tree snapshot

```text
GET /api/projects/{projectID}/canvas/tree
GET /api/sessions/{sessionID}/canvas/tree?project={projectID}
```

Response:

```ts
interface CanvasTreeSnapshot {
  cwd: string;
  generatedAt: string;
  gitStatus?: Record<string, CanvasGitStatus>;
  paths: string[];
  target: CanvasTarget;
}

type CanvasGitStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'ignored';
```

Rules:

- Resolve the `cwd` from the server's trusted workspace/session metadata.
- Do not accept arbitrary filesystem roots from the client.
- Keep path values relative to `cwd`.
- Skip ignored heavyweight directories such as `.git`, `node_modules`, and build outputs unless a later design explicitly needs them.

### Diff snapshot

```text
GET /api/projects/{projectID}/canvas/diff
GET /api/sessions/{sessionID}/canvas/diff?project={projectID}
```

Response:

```ts
interface CanvasDiffSnapshot {
  baseLabel: string;
  cwd: string;
  files: Array<{
    additions: number;
    deletions: number;
    path: string;
    status: CanvasGitStatus;
  }>;
  generatedAt: string;
  patch: string;
  target: CanvasTarget;
}
```

MVP diff source:

- For a worker session, diff the worker `cwd`.
- For a project target, diff the project `cwd`.
- Start with the current uncommitted worktree diff.
- Later add PR/base branch selection when AO task metadata exposes it cleanly.

Implementation note:

- Before choosing Git command flags, check `git diff --help` or the local man page. Do not assume flag behavior from examples.

### Browser metadata

Browser tab can start frontend-only, but a small backend helper is useful later:

```text
GET /api/projects/{projectID}/canvas/browser-targets
GET /api/sessions/{sessionID}/canvas/browser-targets?project={projectID}
```

Potential response:

```ts
interface CanvasBrowserTargets {
  target: CanvasTarget;
  urls: Array<{
    label: string;
    source: 'detected' | 'manual';
    url: string;
  }>;
}
```

Detection can inspect known dev-server ports later. Do not block the MVP on automatic discovery.

## Component design

Suggested feature-local structure:

```text
web/src/features/home/components/organisms/canvas-panel.tsx
web/src/features/home/components/organisms/canvas-file-tree.tsx
web/src/features/home/components/organisms/canvas-diff-view.tsx
web/src/features/home/components/organisms/canvas-browser-view.tsx
web/src/features/home/data/canvas-tree.ts
web/src/features/home/data/canvas-diff.ts
web/src/features/home/data/canvas-preferences.ts
web/src/features/home/domain/canvas.ts
```

Keep the Pierre adapters feature-local. Move to `web/src/components` only if a second feature uses them.

## Visual design

Use the current yyork product language.

- Aesthetic: industrial/utilitarian.
- Density: compact.
- Corners: `rounded-none`.
- Typography: app mono stack.
- Color: restrained. Diff semantic colors should do the work.
- Surfaces: mostly borderless. Use separators and background shifts, not nested cards.
- Focus: visible inset/shared focus treatment. Borderless does not mean focusless.
- Motion: minimal-functional, mostly tab transitions and loading states.

Safe choices:

- Keep the existing left sidebar.
- Keep workspace navigation sidebar-driven instead of adding a top-level Canvas tab.
- Use shadcn primitives and local component APIs.
- Keep Canvas read-only for the first pass.

Creative risks:

- Make Canvas a right-side contextual panel instead of a full workspace view. This keeps terminal or Kanban context visible, but the toggle placement must stay obvious.
- Use Pierre's focused libraries for the tree and diff instead of building from primitives. This gives better performance and interaction quality, but requires adapter insulation because their APIs are still moving.
- Treat the browser as local-preview-first. This avoids promising an impossible arbitrary embedded browser in a normal web app.

## Accessibility

- The Canvas tab switch must be keyboard navigable.
- Files tab should expose tree semantics through the library and keep search reachable by keyboard.
- Review tab needs headings or landmarks for file groups.
- Browser tab needs a clear title, URL label, reload button label, and blocked-state text.
- Icon-only buttons require `aria-label` and tooltips.
- Do not trap focus inside the iframe; users need to get back to AO controls.

## Error states

Files:

- Target has no `cwd`.
- `cwd` no longer exists.
- Permission denied.
- Tree is too large for the first response.

Review:

- Target has no Git repo.
- Git command failed.
- No changes.
- Patch too large for a single render.

Browser:

- Invalid URL.
- Blocked scheme.
- Frame refused or timeout.
- Network failure.

Each error state should include the target label and the recovery action: refresh, open in IDE, open externally, or switch target.

## Performance constraints

- Tree and diff data must be fetched separately. Do not make opening Canvas compute both.
- File tree should stay responsive with at least 10,000 paths.
- Diff rendering should virtualize or progressively render large diffs where the library supports it.
- Large patches should have a cutoff with a clear message and external fallback.
- Canvas refresh must not interrupt terminal websocket streams.

## Security constraints

- Never accept arbitrary filesystem paths from the browser.
- Resolve project/session targets on the backend from trusted workspace metadata.
- Return relative file paths only.
- Block browser schemes that can execute or exfiltrate local data.
- Use iframe sandboxing.
- Treat external HTTPS pages as untrusted and likely frame-blocked.

## Analytics and persistence

Local-only persistence is enough for MVP.

Persist:

- Last Canvas tab.
- Last Browser URL per target.
- Review layout.
- Selected file path per target.
- Optional pinned target.

Do not persist file contents, diffs, or browser page data.

## Implementation plan

### Phase 1: Canvas shell

- Add a right-side Canvas panel that opens beside the selected project/session workspace.
- Add a compact Canvas toggle button to the selected target header.
- Remove or hide the theme option/button from the sidebar settings menu or workspace chrome so the right-side action slot is reserved for the Canvas toggle.
- Add `CanvasPanel` with target header and tab switch.
- Persist Canvas tab in workspace preferences.
- Add Storybook stories for empty, project target, and session target states.

### Phase 2: backend target resolution

- Add helpers that resolve project/session targets by project-scoped identity.
- Add tests for duplicate session ids across projects.
- Reuse existing `workspaceDirectory` safety checks.

### Phase 3: Files tab

- Add tree API.
- Add frontend query.
- Add `CanvasFileTree`.
- Integrate `@pierre/trees/react` through an adapter.
- Render path search and Git status.

### Phase 4: Review tab

- Add diff API.
- Add frontend query.
- Add `CanvasDiffView`.
- Integrate `@pierre/diffs/react` through an adapter.
- Add split/stacked and wrapping controls.

### Phase 5: Browser tab

- Add `CanvasBrowserView`.
- Add URL validation.
- Add sandboxed iframe.
- Persist URL per target.
- Add blocked-frame fallback and external-open action.

### Phase 6: hardening

- Add large tree and large diff fixtures.
- Add e2e coverage for switching target, switching Canvas tab, and browser URL persistence.
- Run manual local-preview validation against a Vite app.
- Verify terminal websocket continues while Canvas tabs refresh.

## Acceptance criteria

- A user can open and close the right-side Canvas panel from the selected target header.
- Canvas defaults to the selected worker session.
- Files tab renders real target paths from backend data.
- Files tab supports search and shows Git status when available.
- Review tab renders the target's current diff.
- Review tab has split/stacked and wrapping controls.
- Browser tab frames localhost URLs and persists the last URL per target.
- Browser tab blocks unsafe schemes.
- Frame-blocked pages show a clear fallback with `Open externally`.
- Duplicate session ids across projects resolve to the correct target.
- The existing terminal attach flow still passes its focused tests.
- The UI follows `rounded-none` and the local borderless surface pattern.

## Test plan

Backend:

- Target resolution tests for project, session, missing project, missing session, and duplicate session id.
- Tree endpoint tests with temp directories.
- Tree endpoint test that does not expose paths outside `cwd`.
- Diff endpoint tests with a temp Git repo.
- Diff endpoint test for no changes.

Frontend:

- `canvas-preferences` normalization tests.
- Canvas target selection tests.
- Files tab loading, empty, error, and ready states.
- Review tab loading, no changes, error, and ready states.
- Browser URL validation tests.

E2E:

- Open Canvas from a selected worker.
- Switch Files -> Review -> Browser.
- Enter a localhost URL and reload.
- Switch worker and confirm target changes.
- Return to Terminal and confirm attachment still renders.

## Open questions

- Should Canvas eventually support side-by-side split with Terminal?
- Should Review diff against uncommitted work only, or against the AO issue base branch?
- Should Files tab open a read-only code view in MVP, or wait until after tree and diff are solid?
- Should browser targets be manually entered only, or detected from process metadata and common dev-server ports?
- Should Canvas be available for orchestrator sessions, or only project and worker targets?

## First implementation recommendation

Build Phase 1 and Phase 2 first. Do not install Pierre dependencies until the shell, target resolution, and state model are landed.

This avoids coupling the core Canvas product shape to beta library APIs. Once the shell works, add Files and Review through adapters, one tab at a time.
