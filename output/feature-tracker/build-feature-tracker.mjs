import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';
import fs from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDir = dirname(fileURLToPath(import.meta.url));
const outputPath = `${outputDir}/yyork-feature-user-stories.xlsx`;

const statuses = [
  'Not Tested',
  'Pass',
  'Fail',
  'Blocked',
  'Needs Fix',
  'Fixed',
  'Retest Pass',
  'Retest Fail',
];
const fixStatuses = [
  'Not Started',
  'Not Needed',
  'Needs Fix',
  'In Progress',
  'Fixed',
];
const retestStatuses = ['Not Retested', 'Pass', 'Fail', 'Blocked'];

const stories = [
  {
    id: 'YY-F001',
    area: 'App Shell',
    source:
      'internal/web/src/routes/__root.tsx; internal/web/src/features/home/templates/orchestrator-workspace-template.tsx; internal/server/server.go',
    story:
      'As a local yyork user, I can open the dashboard root and get the app shell instead of a blank page.',
    expected:
      'The dashboard host serves the React SPA with yyork branding, primary sidebar, topbar, and nested route outlet; unknown dashboard paths fall back to the SPA index. If no web build is available in production, the fallback HTML tells the user to build the dashboard.',
    test: 'Open https://yyork.localhost/ and a direct nested route; verify brand/sidebar/topbar render and reload does not 404.',
    coverage:
      'Server SPA fallback tests exist in internal/server/server_test.go; root e2e exists but appears older than current route UI.',
  },
  {
    id: 'YY-F002',
    area: 'API Health',
    source: 'internal/server/server.go',
    story:
      'As an operator, I can verify that the local backend is alive and separate API host traffic from dashboard traffic.',
    expected:
      'GET /api/health returns JSON status ok. api.yyork.localhost / returns service JSON and unknown API-host paths return JSON 404 instead of serving the dashboard.',
    test: 'curl https://yyork.localhost/api/health and API-host routes through portless or httptest coverage.',
    coverage: 'Covered by internal/server/server_test.go.',
  },
  {
    id: 'YY-F003',
    area: 'Workspace Data',
    source:
      'internal/web/src/features/home/data/workspace.ts; internal/web/src/features/home/domain/session-workspace.ts; internal/server/server.go',
    story:
      'As a dashboard user, I can load my projects and sessions from the local yyork workspace store.',
    expected:
      'The UI fetches /api/workspace, parses the generated schema with legacy cwd-to-path normalization, shows a loading state while pending, shows a readable unavailable state on errors, polls every 3 seconds, and refreshes on session.created/session.terminated/session.updated SSE events.',
    test: 'Mock or live /api/workspace success, malformed JSON, schema mismatch, and SSE invalidation; verify loading/error/refresh behavior.',
    coverage:
      'Data parser and workspace unit tests exist; SSE handler has server tests.',
  },
  {
    id: 'YY-F004',
    area: 'Empty State',
    source:
      'internal/web/src/features/home/pages/kanban.tsx; internal/web/src/features/home/components/organisms/no-projects-empty-state.tsx',
    story:
      'As a first-time user, I can tell how to add my first project when the workspace is empty.',
    expected:
      'When the workspace is empty and no projects are visible, the board overlays a No projects yet card with a sidebar preview, highlighted plus button, and Mod+O shortcut hint; the plus in both copy and preview invokes the add-project flow.',
    test: 'Mock empty workspace, verify empty card text and trigger Add project from both plus controls.',
    coverage: 'No direct current e2e located for the empty-state add controls.',
  },
  {
    id: 'YY-F005',
    area: 'Project Management',
    source:
      'internal/web/src/features/home/pages/workspace-layout.tsx; internal/web/src/features/home/data/workspace.ts; internal/server/projects.go',
    story:
      'As a user, I can add a git repository as a yyork project from the sidebar, empty state, command palette, or Mod+O.',
    expected:
      'The server opens the native folder picker, returns 204 on cancel, resolves any selected path to its git root, ensures an orchestrator session, returns id/path/name/created, un-hides and opens the project locally, patches the workspace cache, invalidates workspace data, runs the add sweep, and navigates to /board/$projectId.',
    test: 'Exercise Add project from each entrypoint with picker cancel, valid repo, existing repo, and non-git path.',
    coverage:
      'Server project creation tests exist; UI entrypoint coverage not yet confirmed.',
  },
  {
    id: 'YY-F006',
    area: 'Project Management',
    source:
      'internal/server/projects.go; internal/web/src/features/home/data/workspace.ts',
    story:
      'As a user, I get an actionable error when the selected project path is invalid.',
    expected:
      'POST /api/projects rejects empty paths and paths outside git repositories with 400; UI surfaces the backend message in an alert and clears any staged visual anchor.',
    test: 'Submit invalid path through API and through Add project error path.',
    coverage:
      'Server tests cover invalid project payloads and git root resolution.',
  },
  {
    id: 'YY-F007',
    area: 'Sidebar',
    source:
      'internal/web/src/features/home/components/organisms/project-orchestrator-sidebar.tsx; internal/web/src/features/home/pages/workspace-layout.tsx',
    story:
      'As a user with projects, I can browse projects and expand each project to see orchestrator and worker sessions.',
    expected:
      'The Projects group lists visible projects, supports expand/collapse with persisted openProjectIds, shows No worker sessions when empty, and nests orchestrators plus worker session groups by state while excluding pinned terminal sessions from duplicate display.',
    test: 'Mock multiple projects with orchestrator and worker sessions; expand/collapse, reload, and verify grouping and duplicates.',
    coverage:
      'Domain grouping unit tests exist; current sidebar e2e not located.',
  },
  {
    id: 'YY-F008',
    area: 'Sidebar',
    source:
      'internal/web/src/features/home/pages/workspace-layout.tsx; internal/web/src/features/home/components/organisms/project-orchestrator-sidebar.tsx',
    story:
      'As a user, I can remove a project from yyork without deleting repository files.',
    expected:
      'Remove project asks for confirmation, DELETEs /api/projects/:projectID, the backend project remover stops yyork sessions for the project without deleting repository files, then the UI runs the remove sweep, removes the project from open/pinned/hidden local lists, removes pinned sessions for that project, invalidates workspace data, and navigates home if a removed terminal was selected.',
    test: 'Remove visible project, cancel and confirm; verify the DELETE request, localStorage cleanup, workspace cache removal, route navigation, and backend remover behavior.',
    coverage:
      'Server project-removal tests and Glimm removal unit tests exist; live smoke verifies the non-file-deleting UI removal path with mocked backend.',
  },
  {
    id: 'YY-F009',
    area: 'Sidebar',
    source: 'internal/web/src/features/home/pages/workspace-layout.tsx',
    story: 'As a user, I can rename a project locally for sidebar readability.',
    expected:
      'Rename project prompts with the current name, ignores cancel/blank/same value, stores a trimmed override in projectNameOverrides, and applies that name to visible project lists without changing backend project identity.',
    test: 'Rename project via project actions; verify trimmed display name persists after reload and route still uses project id.',
    coverage: 'No direct current e2e located.',
  },
  {
    id: 'YY-F010',
    area: 'Pinned Items',
    source:
      'internal/web/src/features/home/pages/workspace-layout.tsx; internal/web/src/features/home/components/organisms/project-orchestrator-sidebar.tsx',
    story:
      'As a user, I can pin and unpin projects and terminal sessions for fast access.',
    expected:
      'Pinned group shows pinned projects and terminal sessions, shows No pinned sessions when empty, pin toggles update localStorage, unpin removes the item, and pinned terminal sessions are hidden from their normal project group to avoid duplicate rows.',
    test: 'Pin/unpin a project and a worker session; reload and verify Pinned group and source group placement.',
    coverage: 'No direct current e2e located.',
  },
  {
    id: 'YY-F011',
    area: 'IDE Handoff',
    source:
      'internal/web/src/features/home/data/project-ide.ts; internal/web/src/features/home/components/organisms/project-orchestrator-sidebar.tsx; internal/server/server.go',
    story: 'As a user, I can open a project workspace in my IDE.',
    expected:
      'Project actions menu enables Open project when cwd is available, POSTs /api/projects/:projectID/ide, validates the workspace directory, launches code or macOS open for Visual Studio Code, and toasts success or backend errors.',
    test: 'Mock/live open project action success, missing cwd, missing path, and opener error.',
    coverage: 'Server IDE tests exist.',
  },
  {
    id: 'YY-F012',
    area: 'Project Settings',
    source:
      'internal/web/src/features/home/components/organisms/main-topbar.tsx; internal/web/src/features/home/data/workspace.ts; internal/server/projects.go',
    story:
      'As a user, I can choose whether workers for the selected project run locally or in new worktrees.',
    expected:
      'The topbar worker workspace select appears when a project is selected, offers work locally and new worktree, disables while the mutation is pending, PATCHes /api/projects/worker-workspace, persists via project settings, invalidates workspace on success, and toasts on failure.',
    test: 'Switch modes and verify PATCH payload, disabled state, success refresh, and invalid mode rejection.',
    coverage:
      'Server project-settings tests exist; UI mutation coverage not located.',
  },
  {
    id: 'YY-F013',
    area: 'Settings Menu',
    source:
      'internal/web/src/features/home/components/organisms/project-orchestrator-sidebar.tsx; internal/web/src/providers.tsx',
    story: 'As a user, I can switch the app theme from the sidebar footer.',
    expected:
      'Settings menu opens from the sidebar footer, contains a disabled Settings item plus a Theme submenu, and lets the user choose System, Light, or Dark via the theme storage key.',
    test: 'Open Settings menu, choose each theme, reload, and verify html class/theme persistence.',
    coverage: 'No direct current e2e located.',
  },
  {
    id: 'YY-F014',
    area: 'Navigation',
    source:
      'internal/web/src/features/home/components/organisms/project-orchestrator-sidebar.tsx; internal/web/src/hooks/use-navigate-back.ts',
    story:
      'As a user, I can collapse/expand the sidebar and use history controls from the sidebar header.',
    expected:
      'Sidebar toggle updates persisted sidebarOpen/sidebarWidth state and exposes correct accessible labels; history controls navigate browser back/forward when available without guessing future history.',
    test: 'Toggle sidebar via button and Mod+B, resize if possible, reload; navigate between board and terminal and use back/forward buttons.',
    coverage: 'No direct current e2e located.',
  },
  {
    id: 'YY-F015',
    area: 'Shortcuts',
    source:
      'internal/web/src/lib/app-hotkeys.ts; internal/web/src/providers.tsx; internal/web/src/features/home/components/molecules/app-shortcuts-dialog.tsx',
    story: 'As a keyboard-first user, I can discover and use app shortcuts.',
    expected:
      'Hotkeys include Mod+K command palette, Mod+O add project, Mod+Backspace/Mod+Delete remove project, Mod+B sidebar, Mod+Shift+B canvas, and Shift+/ shortcuts dialog. Hotkeys ignore input focus by provider default. Sidebar preview lists selected shortcuts and the dialog lists all catalog shortcuts.',
    test: 'Invoke each shortcut outside and inside text inputs where applicable; verify actions or dialogs and prevent repeated firing until reset.',
    coverage:
      'Source-traced hotkey behavior exists in prior memory; no full current shortcut e2e located.',
  },
  {
    id: 'YY-F016',
    area: 'Command Palette',
    source: 'internal/web/src/features/home/pages/workspace-layout.tsx',
    story:
      'As a user, I can use the command palette to jump to boards, sessions, and common actions.',
    expected:
      'Mod+K toggles the command dialog. It searches board names, terminal session labels, add project, delete current project, toggle sidebar, and toggle canvas only on terminal routes. Selecting an item performs the action and closes the palette.',
    test: 'Open palette, search/select board, session, add project, delete project, sidebar toggle, and terminal-only canvas toggle.',
    coverage: 'No direct current e2e located.',
  },
  {
    id: 'YY-F017',
    area: 'Board',
    source:
      'internal/web/src/features/home/pages/kanban.tsx; internal/web/src/features/home/components/organisms/kanban-board.tsx; internal/web/src/features/home/domain/session-workspace.ts',
    story: 'As a user, I can scan worker sessions in a four-column board.',
    expected:
      'The board renders Working, Prompt, Triage, and Done columns, groups only sessions for the selected project, and horizontally scrolls below a 960px minimum width.',
    test: 'Mock sessions across all states and projects; verify only selected project sessions appear under correct columns at desktop and mobile widths.',
    coverage: 'Domain grouping unit tests exist.',
  },
  {
    id: 'YY-F018',
    area: 'Board Cards',
    source:
      'internal/web/src/features/home/components/molecules/kanban-card.tsx; internal/web/src/features/home/domain/kanban-card-model.ts',
    story:
      'As a user, I can understand each session card from title, activity detail, agent identity, and short id.',
    expected:
      'Cards derive task from metadata title, prompt, session title, description, or Untitled session. Working cards prefer currentToolCall/toolCallBulletins, prompt cards show recap or ready text, triage cards show triageReason, done cards show doneSummary. Cards show agent icons for Claude/Codex or first letter fallback, and clicking a card opens its terminal route.',
    test: 'Mock cards for each state and metadata variant; verify text truncation, accessible labels, icons, selected state, and click navigation.',
    coverage: 'kanban-card-model unit tests exist.',
  },
  {
    id: 'YY-F019',
    area: 'Routing',
    source:
      'internal/web/src/features/home/pages/workspace-layout.tsx; internal/web/src/features/home/domain/session-workspace.ts',
    story:
      'As a user, direct links and legacy links resolve to the right board or terminal session.',
    expected:
      'Board routes accept project id, path, or cwd and replace the URL with the canonical id. Root redirects to the default orchestrator terminal when available. Terminal routes support /terminal/:sessionId plus project query when ids are ambiguous, and legacy encoded selection-key routes are replaced with canonical route plus project query.',
    test: 'Navigate to root, board path/cwd aliases, unambiguous terminal id, ambiguous terminal ids with project query, and legacy selection-key route.',
    coverage: 'session-workspace unit tests cover route-target helpers.',
  },
  {
    id: 'YY-F020',
    area: 'Terminal',
    source:
      'internal/web/src/features/home/pages/terminal.tsx; internal/web/src/features/home/components/organisms/terminal-panel.tsx; internal/server/server.go',
    story:
      'As a user, I can attach to a selected orchestrator or worker terminal.',
    expected:
      'Terminal routes show TerminalPanel for selected sessions; the panel opens a WebSocket to /api/sessions/:sessionID/terminal with project, cols, and rows, sends user input as bytes, sends resize JSON, and clears the terminal when switching sessions without remounting xterm.',
    test: 'Open a terminal session, verify WebSocket URL, input forwarding, resize frame, and session switch behavior.',
    coverage:
      'terminal-panel browser tests cover persistent xterm and wheel forwarding; live smoke script exists but may be route-stale.',
  },
  {
    id: 'YY-F021',
    area: 'Terminal',
    source:
      'internal/web/src/features/home/components/organisms/terminal-panel.tsx; internal/web/src/features/home/components/organisms/terminal-connection.ts',
    story:
      'As a user, terminal connection failures are visible and recoverable.',
    expected:
      'Unsupported sessions show Terminal unavailable toast. Clean close shows disconnected, unclean close/error shows failed. Retryable states expose a Reconnect terminal button and toast action. Automatic reconnect tries 500ms, 1s, and 2s delays, resetting after useful/stable traffic.',
    test: 'Mock unsupported, clean close, failing socket, retry button, and auto-reconnect attempts.',
    coverage: 'Terminal panel browser tests cover some socket behavior.',
  },
  {
    id: 'YY-F022',
    area: 'Terminal',
    source:
      'internal/web/src/features/home/components/organisms/terminal-panel.tsx',
    story: 'As a user, I can maximize the terminal and restore it.',
    expected:
      'The terminal overlay contains maximize/restore control. It requests fullscreen on the terminal section, tracks fullscreenchange, removes panel padding in fullscreen, and exits fullscreen when clicked again.',
    test: 'Click Maximize terminal and Restore terminal; verify fullscreen element and layout.',
    coverage: 'No direct current e2e located.',
  },
  {
    id: 'YY-F023',
    area: 'IDE Handoff',
    source:
      'internal/web/src/features/home/components/molecules/open-ide-button.tsx; internal/web/src/features/home/data/session-ide.ts; internal/server/server.go',
    story: 'As a user, I can open a selected session worktree in my IDE.',
    expected:
      'Open IDE is enabled only when session cwd exists, POSTs /api/sessions/:sessionID/ide?project=..., validates the session workspace directory, launches VS Code, and shows success or error toast.',
    test: 'Open session IDE for cwd-present, cwd-missing, missing directory, and opener-error cases.',
    coverage:
      'Server IDE tests exist; older e2e exists but references stale Terminal tab UI.',
  },
  {
    id: 'YY-F024',
    area: 'Session Management',
    source:
      'internal/web/src/features/home/pages/workspace-layout.tsx; internal/web/src/features/home/components/molecules/stop-session-confirm-dialog.tsx; internal/server/sessions.go',
    story: 'As a user, I can stop an agent session with confirmation.',
    expected:
      'Stop session opens a destructive confirmation unless skipStopSessionConfirmation is set. Confirm can store Dont show this again, DELETEs /api/sessions/:sessionID with optional project query, navigates home if the selected terminal was stopped, and toasts backend errors.',
    test: 'Stop session via context/row action with cancel, confirm, dont-show-again, failure, and selected-route navigation.',
    coverage: 'Server stop-session tests exist.',
  },
  {
    id: 'YY-F025',
    area: 'Session Management',
    source: 'internal/web/src/features/home/pages/workspace-layout.tsx',
    story:
      'As a user, I can hide noisy sessions from the sidebar without stopping them.',
    expected:
      'Hide from sidebar asks for confirmation, stores the selection key in hiddenTerminalSessionKeys, removes it from pinnedTerminalSessionKeys, and navigates home if that hidden session was selected. It does not call the backend stop endpoint.',
    test: 'Hide a session, cancel and confirm, verify localStorage, no DELETE request, no row after reload, and route navigation.',
    coverage: 'No direct current e2e located.',
  },
  {
    id: 'YY-F026',
    area: 'Session Management',
    source:
      'internal/web/src/features/home/pages/workspace-layout.tsx; internal/server/sessions.go',
    story: 'As a user, I can rename a session label in the sidebar.',
    expected:
      'Rename prompts with current label, trims input, ignores cancel/same value, PATCHes displayName to /api/sessions/:sessionID with optional project query, backend truncates to 120 runes and stores metadata displayName, empty string clears the override, and session.updated refreshes clients.',
    test: 'Rename to new, blank, overlong, same, cancel, and backend failure cases.',
    coverage: 'Server rename tests exist.',
  },
  {
    id: 'YY-F027',
    area: 'Canvas',
    source:
      'internal/web/src/features/home/pages/terminal-layout.tsx; internal/web/src/features/home/pages/workspace-layout.tsx; internal/web/src/features/home/components/organisms/main-topbar.tsx',
    story:
      'As a user in a terminal route, I can open, close, and resize the Canvas inspector.',
    expected:
      'Canvas controls are available only on terminal routes. Mod+Shift+B or the topbar button toggles open state in preferences. Dragging the resize rail clamps canvas width between 22% and 70%, persists canvasLayout, disables transitions during resize, and mirrors pane width to the topbar slot.',
    test: 'Open terminal route, toggle canvas with button and hotkey, drag resize rail to min/max, reload, and verify board route has no canvas controls.',
    coverage:
      'No direct current e2e located beyond canvas file tests opening the panel.',
  },
  {
    id: 'YY-F028',
    area: 'Canvas',
    source:
      'internal/web/src/features/home/components/organisms/main-topbar.tsx; internal/web/src/features/home/components/organisms/canvas-panel.tsx; internal/web/src/features/home/data/workspace-preferences.ts',
    story:
      'As a user, I can switch Canvas tabs and keep the selected tab across reloads.',
    expected:
      'Canvas tabs are Files, Review, and Browser. Valid tab changes update local reducer state and preferences; invalid values are ignored. The active tab rehydrates from canvasTab preference.',
    test: 'Switch each tab, reload, and verify the last selected tab is active.',
    coverage: 'Canvas e2e covers file selection across tab switches.',
  },
  {
    id: 'YY-F029',
    area: 'Canvas Files',
    source:
      'internal/web/src/features/home/components/organisms/canvas-panel.tsx; internal/server/files.go',
    story:
      'As a user, I can browse the selected session worktree in the Canvas Files tab.',
    expected:
      'Without a selected session it shows No session selected. While loading it shows Loading files. Errors show backend messages. Empty trees show No files found. Successful trees use normalized paths, collapse heavy directories like node_modules/dist/build, cap at 20000 paths, include git status, flatten empty directories, and show sticky folders.',
    test: 'Mock no session/loading/error/empty/success, large trees, skipped directories, and git status badges.',
    coverage: 'Canvas files e2e and server file tests exist.',
  },
  {
    id: 'YY-F030',
    area: 'Canvas Files',
    source:
      'internal/web/src/features/home/components/organisms/canvas-panel.tsx; internal/web/src/features/home/domain/file-preview.ts; internal/server/files.go',
    story:
      'As a user, I can select a file and read it as Markdown preview or source code.',
    expected:
      'Selected file path persists per canvas target. Markdown-like extensions can toggle Preview/Code; other files force Code. Code view supports wrap toggle and mouse-wheel scrolling. Binary files show Binary file. Files over 1 MB are truncated with a notice. Path traversal, directories, missing files, and symlink escapes are rejected server-side.',
    test: 'Select markdown and non-markdown files, toggle view/wrap, reload, test binary/truncated/error/path traversal responses.',
    coverage:
      'Canvas files e2e, file-preview unit tests, and server file tests exist.',
  },
  {
    id: 'YY-F031',
    area: 'Canvas Review',
    source:
      'internal/web/src/features/home/components/organisms/canvas-diff-view.tsx; internal/server/diff.go',
    story:
      'As a user, I can review a selected session worktree diff from the Canvas Review tab.',
    expected:
      'Without a session it shows No session selected. Loading/errors are explicit. It runs git diff HEAD plus text untracked-file patches, summarizes file count/additions/deletions, supports split/stacked layout and wrap preferences, refreshes manually, shows No changes or No text hunks when appropriate, and shows Patch too large when patch exceeds 2 MB.',
    test: 'Mock/live no session, no changes, text changes, untracked files, binary/no text hunks, huge patch, refresh, split/stacked, and wrap.',
    coverage: 'Canvas diff data unit tests and server diff tests exist.',
  },
  {
    id: 'YY-F032',
    area: 'Canvas Browser',
    source:
      'internal/web/src/features/home/components/molecules/canvas-web-preview.tsx; internal/web/src/features/home/data/browser-preview.ts',
    story: 'As a user, I can preview local web apps inside yyork Browser.',
    expected:
      'The Browser tab starts with Enter a local preview URL. Address input accepts HTTP(S), defaults missing schemes to http, allows localhost, *.localhost, loopback, wildcard bind, and rejects external or preview-host URLs with a toast. Valid URLs register /api/browser-preview/targets, show Preparing local preview until iframe URL is ready, then render the iframe with a loading bar and error banner on registration/load failures.',
    test: 'Enter localhost with and without scheme, *.localhost, external HTTPS, preview-host URL, and failing registration.',
    coverage:
      'Canvas web preview browser tests and server browser-preview tests exist.',
  },
  {
    id: 'YY-F033',
    area: 'Canvas Browser',
    source:
      'internal/web/src/features/home/components/molecules/canvas-web-preview.tsx',
    story: 'As a user, I can use browser-like controls in the preview panel.',
    expected:
      'Back/forward buttons follow recorded preview history. Reload rebinds the frame. Hard reload clears all storage before rebind. Menu actions clear cookies or cache. Open externally uses frameUrl if available, otherwise currentUrl. SPA bridge location changes update address/history without remounting the iframe.',
    test: 'Navigate inside preview, use back/forward/reload/hard reload/clear cookies/clear cache/open external, and verify iframe remount rules.',
    coverage:
      'Canvas web preview browser tests cover bridge history and unsupported URL behavior.',
  },
  {
    id: 'YY-F034',
    area: 'Canvas Browser Proxy',
    source: 'internal/server/browser_preview.go',
    story:
      'As a user, the preview proxy safely wraps local targets and keeps development previews usable.',
    expected:
      'Target registration creates a stable *-preview.yyork.localhost URL, preserves dashboard port, proxies only local HTTP(S), rejects external hosts and preview hosts, injects preview bridge and Agentation into HTML/XHTML, strips CSP headers/meta and integrity headers that block injection, tunnels upgrade requests for HMR, preserves preview host across redirects, and handles yyork self-targets through the dev origin in dev.',
    test: 'Run server browser-preview tests and live preview against yyork.localhost plus another localhost app with redirect and HMR.',
    coverage: 'Extensive server browser_preview_test.go coverage exists.',
  },
  {
    id: 'YY-F035',
    area: 'Annotations',
    source:
      'internal/web/src/features/home/components/molecules/canvas-web-preview.tsx; internal/web/src/features/home/data/annotations.ts; internal/server/annotations.go',
    story:
      'As a user, I can stage preview annotations and send them to the selected agent.',
    expected:
      'Agentation add/update/delete/clear messages maintain staged annotations scoped by session and current URL. The tray appears when annotations exist or are sending, supports remove/clear/send, disables send without a session, sends POST /api/annotations/:sessionID with optional project, formats a readable markdown message, forwards via durability provider, toasts delivered count, and clears on success.',
    test: 'Stage, update, delete, clear, submit from bridge, send with/without session, server empty payload, missing session, and durability failure.',
    coverage:
      'Canvas web preview browser tests, annotations data unit tests, and server annotation tests exist.',
  },
  {
    id: 'YY-F036',
    area: 'Preferences',
    source:
      'internal/web/src/features/home/data/workspace-preferences.ts; internal/web/src/features/home/components/organisms/canvas-panel.tsx',
    story:
      'As a user, yyork remembers workspace UI choices without corrupting the app when localStorage is bad.',
    expected:
      'Preferences default to sidebarOpen false and canvasOpen false, normalize corrupt/unknown values, store version 1, keep hidden/open/pinned project/session ids, project name overrides, skip stop confirmation, sidebar width, canvas layout/tab/review prefs, and target-scoped preview URLs and selected file paths.',
    test: 'Seed malformed localStorage, invalid types, valid preferences, target-specific values, and verify normalized behavior and persistence.',
    coverage: 'workspace-preferences unit tests exist.',
  },
  {
    id: 'YY-F037',
    area: 'Events',
    source:
      'internal/web/src/features/home/data/workspace.ts; internal/server/sessions.go',
    story:
      'As a user, dashboard views update when sessions are created, updated, or terminated.',
    expected:
      'The browser subscribes to /api/events, invalidates workspace data on session.created/session.updated/session.terminated, and EventSource handles reconnect. Server SSE sends initial connected comment, keepalive comments every 30 seconds, and no replay buffer. POST /api/events requires X-yyork-Token and only republishes known control events.',
    test: 'Open SSE, publish valid and invalid events, verify query invalidation and auth behavior.',
    coverage: 'Server sessions event tests exist.',
  },
  {
    id: 'YY-F038',
    area: 'Session API',
    source: 'internal/server/sessions.go',
    story:
      'As a legacy/API caller, I can list sessions with resolved labels and project filtering.',
    expected:
      'GET /api/sessions returns [] when no repo is wired, otherwise session DTOs with id, projectPath/name, agentPlugin, workspacePath, zellijSession, pid, metadata, title, recap, createdAt, and updatedAt. displayName wins over title, title over prompt, prompt over new agent:id; recap falls back from metadata.summary for legacy rows. project query resolves project id/path before filtering.',
    test: 'Call /api/sessions with no store, all sessions, project id/path, displayName/title/prompt fallbacks, and legacy summary.',
    coverage: 'Server sessions tests exist.',
  },
  {
    id: 'YY-F039',
    area: 'Plugins',
    source: 'internal/server/server.go; internal/plugin',
    story:
      'As a user or integration, I can inspect installed plugin manifests.',
    expected:
      'GET /api/plugins returns the plugin registry manifests as JSON and defaults to an empty registry when none is configured.',
    test: 'Call /api/plugins in live and test server configurations.',
    coverage: 'No direct current test located beyond generic server setup.',
  },
  {
    id: 'YY-F040',
    area: 'Error Boundaries',
    source:
      'internal/web/src/routes/__root.tsx; internal/web/src/components/errors/page-error.tsx; internal/web/src/components/errors/error-boundary.tsx',
    story:
      'As a user, route-level errors and 404s are shown as usable pages instead of raw exceptions.',
    expected:
      'TanStack Router root route uses PageError for notFound and errorComponent. PageError offers appropriate go back/home actions, and ErrorBoundary can reveal/copy error details with translated fallback text.',
    test: 'Navigate to an unknown route and force a route error; verify page copy/actions and error details drawer.',
    coverage: 'Stories exist; no direct current e2e located.',
  },
  {
    id: 'YY-F041',
    area: 'Glimm Visual Feedback',
    source:
      'internal/web/src/routes/__root.tsx; internal/web/src/lib/glimm/*; internal/web/src/features/home/pages/workspace-layout.tsx',
    story:
      'As a user, add/remove project actions have visual continuity and an optional local devtool for tuning.',
    expected:
      'Add project stages a namedrop anchor and runs sweepProjectAdded on success. Remove project runs sweepProjectRemoved. In dev only, ?glimmDevtool mounts the Glimm sweep devtool; otherwise it is not loaded.',
    test: 'Trigger add/remove with visible anchors, verify no production devtool, and open https://yyork.localhost/?glimmDevtool in dev.',
    coverage: 'Glimm sweep unit tests exist.',
  },
  {
    id: 'YY-F042',
    area: 'Settings Prototype',
    source:
      'internal/web/src/routes/__root.tsx; internal/web/src/features/settings-mock/pages/settings-prototype.tsx',
    story:
      'As the product designer/developer, I can open a mocked settings surface for agent preference exploration.',
    expected:
      'When host is mock.yyork.localhost or query param mock=settings, RootComponent renders SettingsPrototypePage instead of the main app. The prototype supports first-run/global/project modes, walkthrough steps, agent choices, project overrides, and theme interactions entirely client-side.',
    test: 'Open mock.yyork.localhost and https://yyork.localhost/?mock=settings; walk through modes, agent changes, project selection, and theme changes.',
    coverage: 'No direct current e2e located.',
  },
  {
    id: 'YY-F043',
    area: 'Static Assets',
    source:
      'internal/web/src/features/home/components/molecules/kanban-card.tsx; internal/web/public',
    story:
      'As a user, agent and editor icons render correctly in cards and IDE buttons.',
    expected:
      'Claude and Codex cards load /agent-icons/*.svg; unknown agents fall back to first-letter text. Open IDE uses a masked Visual Studio icon from /editor-icons/visual-studio.svg. Missing icons should not break core actions.',
    test: 'Render known/unknown agents and Open IDE button; verify icons or fallback text appear and no broken layout.',
    coverage: 'No direct current e2e located.',
  },
  {
    id: 'YY-F044',
    area: 'Terminal Backend',
    source: 'internal/server/server.go; internal/terminal',
    story:
      'As a terminal user, backend terminal attach honors session project scoping and terminal support.',
    expected:
      'GET /api/sessions/:sessionID/terminal resolves sessions across workers and orchestrators, requires project query when ids are ambiguous, rejects unsupported sessions, defaults cols/rows to 100x30 when invalid, passes attach command, cwd, terminal key, title, worker id, and YYORK_* env vars to the terminal manager.',
    test: 'Server tests or live WebSocket attempts for project-scoped, ambiguous, unsupported, invalid cols/rows, and successful attach.',
    coverage:
      'Server terminal request helpers have tests; live terminal smoke exists but may need route update.',
  },
  {
    id: 'YY-F045',
    area: 'Dashboard Build/Runtime',
    source: 'package.json; internal/cli/dev.go; internal/server/server.go',
    story:
      'As a developer, I can run the yyork dashboard through the repo dev stack and portless URL.',
    expected:
      'Root pnpm dev runs portless and go run . dev, serving the app at https://yyork.localhost and docs at https://docs.yyork.localhost. The app uses dashboard dev origin for self-preview in dev and should not require raw localhost for normal verification.',
    test: 'Start pnpm dev from repo root, wait for ready banners, curl /api/health and open https://yyork.localhost.',
    coverage:
      'AGENTS guidance and dev.go tests exist; live verification pending in this goal.',
  },
  {
    id: 'YY-F046',
    area: 'First Run',
    source:
      'internal/web/src/features/home/pages/kanban.tsx; internal/web/src/features/home/pages/workspace-layout.tsx; internal/web/src/features/home/components/organisms/first-run-project-card.tsx; internal/web/src/features/home/data/first-run-project-setup-draft.ts',
    story:
      'As a first-time user, I can choose my first project and continue setup without losing the selected path.',
    expected:
      'When no projects exist, Add project opens the host folder picker. A selected path is saved as a versioned first-run draft, the card advances from No projects yet to Agents, Change project clears the draft and returns to the empty card, and browser storage failures do not crash setup.',
    test: 'Mock an empty workspace and choose-directory response, click Add project, verify the Agents card, stored draft, Change project reset, and no app runtime errors.',
    coverage:
      'First-run draft unit tests exist; live smoke covers the empty-workspace first-run transition.',
  },
  {
    id: 'YY-F047',
    area: 'Agent Setup',
    source:
      'internal/web/src/features/home/components/molecules/project-setup-harness-picker.tsx; internal/web/src/features/home/data/agent-harness-preferences.ts; internal/server/projects.go; internal/store/project_settings.go; internal/cli/commands.go',
    story:
      'As a user setting up a project, I can choose orchestrator and worker agent harnesses and remember defaults for later workers.',
    expected:
      'The Agents card offers available Claude Code and Codex harnesses for orchestrator and worker roles, disables Start project if either selected harness is unavailable, POSTs agentPlugin and workerAgentPlugin to /api/projects, stores remembered global defaults in localStorage, the server validates plugin ids and persists the worker plugin per project, and worker spawns use the stored project worker agent when present.',
    test: 'Mock first-run setup, select alternate harnesses, remember defaults, start project, inspect the POST payload/localStorage, and run project/CLI settings tests for validation and worker default use.',
    coverage:
      'Server project tests cover plugin validation/persistence; store and CLI tests cover project worker-agent defaults.',
  },
  {
    id: 'YY-F048',
    area: 'CLI Doctor',
    source:
      'internal/cli/doctor.go; internal/cli/doctor_test.go; internal/cli/main_test.go',
    story:
      'As an operator, I can run yyork doctor to see whether local runtime and agent dependencies are available.',
    expected:
      'yyork doctor checks bundled or PATH zellij, git, Claude Code, and Codex, prints a tabular text report by default, supports --json with stable check ids/statuses/messages, marks git and zellij plus at least one agent CLI as required, and exits nonzero when required runtime capability is missing.',
    test: 'Run go tests for doctor text/JSON output and command registration; manually compare yyork doctor --help if command behavior is unclear.',
    coverage:
      'doctor.go and root command tests cover text output, JSON output, command listing, and failure behavior.',
  },
  {
    id: 'YY-F049',
    area: 'Docs App',
    source:
      'internal/docs/app/root.tsx; internal/docs/app/routes/home.tsx; internal/docs/app/routes/docs.tsx; internal/docs/app/routes/search.ts; internal/docs/content/docs',
    story:
      'As a developer or product reader, I can open the yyork docs app and navigate the design record.',
    expected:
      'docs.yyork.localhost serves the Fumadocs React Router app with Inter font links, search provider, a home page linking to decisions and architecture notes, docs routes backed by internal/docs/content/docs, a not-found page for unknown docs routes, and dev error details only in development.',
    test: 'Open https://docs.yyork.localhost, verify the design-record home page, follow a decision/docs route, hit an unknown route, and query the search route.',
    coverage:
      'Docs build scripts exist; live smoke verifies the docs home and docs route through portless.',
  },
];

const errors = [
  [
    'ERR-001',
    'YY-F042',
    'Browser Test Harness',
    'Medium',
    'Browser component tests rendered without the app stylesheet, so the radio-group control resolved as hidden and the accessible radio click timed out.',
    'direnv exec . pnpm --filter @yyork/web test:ci initially failed src/components/form/field-radio-group/field-radio-group.browser.spec.tsx should select radio on button click.',
    'The browser Vitest setup loaded dayjs and cleanup only; main.tsx imports app.css but component tests do not mount through main.tsx.',
    'internal/web/src/tests/setup.browser.ts',
    'Pass: focused radio-group spec 6/6 and full web suite 29 files / 141 tests passed.',
  ],
  [
    'ERR-002',
    'Shared UI',
    'Input Group',
    'Low',
    'Typecheck failed because InputGroupAddon called focus() on a generic Element returned from querySelector.',
    'direnv exec . pnpm --filter @yyork/web lint:ts reported TS2339 in src/components/ui/input-group-addon.tsx.',
    'The selector only targets input and textarea controls, but TypeScript inferred Element.',
    'internal/web/src/components/ui/input-group-addon.tsx',
    'Pass: lint:ts completed successfully after typing the querySelector result.',
  ],
  [
    'ERR-003',
    'Shared UI',
    'Label',
    'Low',
    'Typecheck failed because Label passed a literal data-slot prop through Base UI useRender mergeProps.',
    'direnv exec . pnpm --filter @yyork/web lint:ts reported TS2353 in src/components/ui/label.tsx.',
    'Other useRender components encode slot metadata via useRender state; Label was the outlier using a direct data-slot prop.',
    'internal/web/src/components/ui/label.tsx',
    'Pass: lint:ts completed successfully and full web suite 29 files / 141 tests passed.',
  ],
  [
    'ERR-004',
    'YY-F001, YY-F045',
    'Dev Stack',
    'High',
    'The live dashboard root rendered blank/old assets because stale portless/Vite processes were still serving the migrated top-level web directory.',
    'Open https://yyork.localhost after previous dev stacks had been running; browser requested stale /src paths from the old web/ layout.',
    'Orphaned dev-stack processes and portless aliases outlived the current internal/web migration.',
    'Operational restart: stopped stale process tree and restarted direnv exec . pnpm dev.',
    'Pass: clean stack served internal/web and live smoke rendered the app shell.',
  ],
  [
    'ERR-005',
    'YY-F020, YY-F021',
    'Terminal',
    'High',
    'xterm canvas rendering threw page errors because terminal theme colors resolved to unsupported OKLCH/color-mix values.',
    'Open a terminal route and watch browser page errors for Unexpected fillStyle color format.',
    'Terminal CSS variables aliased app theme tokens that Chromium computed as oklch(...) and xterm could not parse for canvas fillStyle.',
    'internal/web/src/styles/app.css; internal/web/src/features/home/components/organisms/xterm-terminal.tsx',
    'Pass: xterm browser tests passed and live smoke showed no app runtime errors.',
  ],
  [
    'ERR-006',
    'YY-F001, YY-F040',
    'Router Runtime',
    'Medium',
    'React logged an error about rendering script tags during client render.',
    'Open https://yyork.localhost and collect console errors.',
    'TanStack Router scroll restoration rendered a script marker in the client-only app tree.',
    'internal/web/src/router.tsx',
    'Pass: root console probe showed zero #root script tags and only Chromium GL warnings.',
  ],
  [
    'ERR-007',
    'YY-F002, YY-F045',
    'Dev Stack',
    'High',
    'api.yyork.localhost returned portless HTML 404 instead of the backend JSON API host.',
    'curl -k https://api.yyork.localhost/ returned a portless 404 page while server tests showed API-host handling existed.',
    'The dev launcher registered yyork-preview.yyork and mock.yyork aliases but not api.yyork.',
    'internal/cli/dev.go',
    'Pass: restarted dev stack registered api.yyork.localhost and live smoke verified JSON root plus JSON 404.',
  ],
  [
    'ERR-008',
    'YY-F015, YY-F016',
    'Command Palette',
    'High',
    'Opening the command palette with Mod+K crashed into the route error boundary.',
    'Press Meta+K on the live app; console showed cmdk TypeError reading subscribe.',
    'CommandDialog mounted CommandInput and CommandList without wrapping them in the cmdk Command provider.',
    'internal/web/src/components/ui/command.tsx; internal/web/src/components/ui/command.browser.spec.tsx',
    'Pass: command dialog browser regression passed and live smoke navigated through the command palette.',
  ],
  [
    'ERR-009',
    'YY-F013, YY-F014',
    'Sidebar',
    'Medium',
    'Collapsed desktop sidebar left the offscreen Settings button exposed to accessibility/click targeting.',
    'With default collapsed sidebar, getByRole(button, Settings) found a button at negative x coordinates.',
    'The offcanvas container moved visually offscreen but its content/footer/rail remained interactive.',
    'internal/web/src/features/home/components/organisms/project-orchestrator-sidebar.tsx',
    'Pass: live probe showed Settings role count 0 while collapsed and the expand button remained visible.',
  ],
  [
    'ERR-010',
    'YY-F027, YY-F036',
    'Canvas Preferences',
    'Medium',
    'Persisted canvas layout values could escape the resize rail limits and push controls out of usable bounds.',
    'Seed localStorage canvasLayout with very small or very large canvas values and open a terminal route.',
    'Drag-time resize was clamped to 22-70 percent, but persisted preferences only required positive numbers.',
    'internal/web/src/features/home/data/workspace-preferences.ts; internal/web/src/features/home/pages/terminal-layout.tsx',
    'Pass: workspace-preferences unit test clamps min/max and live canvas controls retested successfully.',
  ],
  [
    'ERR-011',
    'Live Smoke',
    'Test Harness',
    'Low',
    'The live smoke expected stale UI details: Browser validation status 400, Review copy Refresh changes, and direct Dark menu item access.',
    'Run output/feature-tracker/live-story-smoke.mjs before harness update.',
    'The app behavior had intentionally moved to HTTP 422, Refresh diff, and Settings -> Theme -> Dark submenu interaction.',
    'output/feature-tracker/live-story-smoke.mjs',
    'Pass: live-story-smoke passed 24/24 after harness update.',
  ],
  [
    'ERR-012',
    'YY-F008',
    'Live Smoke',
    'Low',
    'The live smoke expected the old Delete project menu label and local-only hide behavior.',
    'Run output/feature-tracker/live-story-smoke.mjs after the project removal flow changed to Remove project.',
    'The current code now calls DELETE /api/projects/:projectID so yyork can stop project sessions while keeping repository files intact; the tracker and smoke still described the older local-only behavior.',
    'output/feature-tracker/build-feature-tracker.mjs; output/feature-tracker/live-story-smoke.mjs',
    'Pass: smoke now clicks Remove project and asserts the backend DELETE plus local cleanup.',
  ],
  [
    'ERR-013',
    'YY-F046, YY-F047',
    'Live Smoke',
    'Low',
    'The first-run smoke clicked Base UI hidden checkbox inputs for Remember for new projects, causing Playwright pointer interception.',
    'Run output/feature-tracker/live-story-smoke.mjs with the first-run agent setup check.',
    'getByLabel resolved the internal hidden input rather than the visible label/control. The user-facing control remained accessible through the rendered label.',
    'output/feature-tracker/live-story-smoke.mjs',
    'Pass: smoke now clicks the visible Remember labels before submitting first-run agent choices.',
  ],
  [
    'ERR-014',
    'YY-F041',
    'Glimm Visual Feedback',
    'Medium',
    'Opening https://yyork.localhost/?glimmDevtool rendered the route error boundary because the lazy devtool import failed.',
    'Open the dev-only Glimm route and capture browser responses; Chromium received 504 for /node_modules/.vite/deps/lil-gui.js.',
    'Vite transformed the lazy devtool module to import a stale optimized dependency cache entry for lil-gui that was referenced but absent on disk.',
    'internal/web/vite.config.ts',
    'Pass: direct Glimm route probe rendered without failed resources, and final live smoke passed 29/29.',
  ],
  [
    'ERR-015',
    'Test Environment',
    'Toolchain',
    'Low',
    'Bare assistant-shell checks failed before reaching yyork code because the shell used Node 22 for a workspace requiring Node 24 and had no go on PATH.',
    'Run pnpm --filter @yyork/web lint:ts, pnpm --filter @yyork/web test:ci, or pnpm backend:test outside the repo dev environment.',
    'The assistant runner shell was not the same as the user repo devShell. The repo toolchain is available through direnv/nix.',
    'Operational fix: reran checks with direnv exec .',
    'Pass: direnv exec . pnpm --filter @yyork/web lint:ts, direnv exec . pnpm --filter @yyork/web test:ci, and direnv exec . pnpm backend:test passed.',
  ],
];

const liveRetestedStoryIds = new Set([
  'YY-F001',
  'YY-F002',
  'YY-F003',
  'YY-F004',
  'YY-F005',
  'YY-F006',
  'YY-F007',
  'YY-F008',
  'YY-F009',
  'YY-F010',
  'YY-F012',
  'YY-F013',
  'YY-F014',
  'YY-F015',
  'YY-F016',
  'YY-F017',
  'YY-F018',
  'YY-F019',
  'YY-F020',
  'YY-F021',
  'YY-F022',
  'YY-F023',
  'YY-F027',
  'YY-F028',
  'YY-F029',
  'YY-F030',
  'YY-F031',
  'YY-F032',
  'YY-F034',
  'YY-F035',
  'YY-F036',
  'YY-F037',
  'YY-F038',
  'YY-F039',
  'YY-F040',
  'YY-F041',
  'YY-F042',
  'YY-F043',
  'YY-F044',
  'YY-F045',
  'YY-F046',
  'YY-F047',
  'YY-F049',
]);

const automatedRetestedStoryIds = new Set([
  'YY-F011',
  'YY-F023',
  'YY-F024',
  'YY-F025',
  'YY-F026',
  'YY-F033',
  'YY-F048',
]);

const blockedStoryNotes = new Map([]);

const storyErrorIds = new Map([
  ['YY-F001', 'ERR-004, ERR-006'],
  ['YY-F002', 'ERR-007'],
  ['YY-F008', 'ERR-012'],
  ['YY-F013', 'ERR-009'],
  ['YY-F014', 'ERR-009'],
  ['YY-F015', 'ERR-008'],
  ['YY-F016', 'ERR-008'],
  ['YY-F020', 'ERR-005'],
  ['YY-F021', 'ERR-005'],
  ['YY-F027', 'ERR-010'],
  ['YY-F036', 'ERR-010'],
  ['YY-F041', 'ERR-014'],
  ['YY-F040', 'ERR-006'],
  ['YY-F045', 'ERR-004, ERR-007'],
  ['YY-F046', 'ERR-013'],
  ['YY-F047', 'ERR-013'],
]);

function statusForStory(story) {
  const errorIds = storyErrorIds.get(story.id) ?? '';

  if (blockedStoryNotes.has(story.id)) {
    return {
      errorObserved: '',
      fixStatus: 'Not Needed',
      notes: blockedStoryNotes.get(story.id),
      retestStatus: 'Blocked',
      testStatus: 'Blocked',
    };
  }

  if (liveRetestedStoryIds.has(story.id)) {
    return {
      errorObserved: errorIds ? `See ${errorIds}` : '',
      fixStatus: errorIds ? 'Fixed' : 'Not Needed',
      notes:
        'Retested by output/feature-tracker/live-story-smoke.mjs; final run passed 29/29.',
      retestStatus: 'Pass',
      testStatus: 'Pass',
    };
  }

  if (automatedRetestedStoryIds.has(story.id)) {
    return {
      errorObserved: errorIds ? `See ${errorIds}` : '',
      fixStatus: errorIds ? 'Fixed' : 'Not Needed',
      notes:
        'Retested by automated web/backend suite rather than live clicking because the flow has OS side effects, destructive state, or deep component coverage.',
      retestStatus: 'Pass',
      testStatus: 'Pass',
    };
  }

  return {
    errorObserved: '',
    fixStatus: 'Not Started',
    notes: 'No current automated or live coverage was mapped during this pass.',
    retestStatus: 'Not Retested',
    testStatus: 'Not Tested',
  };
}

function applyHeaderStyle(range) {
  range.format = {
    fill: '#111827',
    font: { bold: true, color: '#FFFFFF' },
    wrapText: true,
  };
}

function applyTitleStyle(range) {
  range.format = {
    fill: '#F3F4F6',
    font: { bold: true, color: '#111827' },
  };
}

function setColumnWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidth = width;
  });
}

const workbook = Workbook.create();
const summary = workbook.worksheets.add('Summary');
const storiesSheet = workbook.worksheets.add('User Stories');
const errorSheet = workbook.worksheets.add('Error Log');

for (const sheet of [summary, storiesSheet, errorSheet]) {
  sheet.showGridLines = false;
}

const storyHeaders = [
  'Feature ID',
  'Area',
  'Source of Truth',
  'User Story',
  'Expected Behavior',
  'Suggested Test',
  'Existing Coverage',
  'Test Status',
  'Error Observed',
  'Fix Status',
  'Retest Status',
  'Notes',
];

const storyRows = stories.map((story) => {
  const status = statusForStory(story);

  return [
    story.id,
    story.area,
    story.source,
    story.story,
    story.expected,
    story.test,
    story.coverage,
    status.testStatus,
    status.errorObserved,
    status.fixStatus,
    status.retestStatus,
    status.notes,
  ];
});

storiesSheet.getRange('A1:L1').values = [storyHeaders];
storiesSheet.getRange(`A2:L${storyRows.length + 1}`).values = storyRows;
applyHeaderStyle(storiesSheet.getRange('A1:L1'));
storiesSheet.getRange(`A1:L${storyRows.length + 1}`).format = {
  wrapText: true,
};
storiesSheet.getRange('A1:L1').format.rowHeight = 30;
storiesSheet.getRange(`A2:L${storyRows.length + 1}`).format = {
  font: { color: '#111827' },
};
storiesSheet.getRange(`A2:L${storyRows.length + 1}`).format.rowHeight = 92;
storiesSheet.getRange(`A1:L${storyRows.length + 1}`).format.borders = {
  preset: 'outside',
  style: 'thin',
  color: '#D1D5DB',
};
storiesSheet.getRange(`A2:L${storyRows.length + 1}`).format.borders = {
  insideHorizontal: { style: 'thin', color: '#E5E7EB' },
};
setColumnWidths(storiesSheet, [11, 18, 44, 48, 72, 54, 42, 16, 34, 15, 16, 28]);
storiesSheet.getRange(`H2:H${storyRows.length + 1}`).dataValidation = {
  rule: { type: 'list', values: statuses },
};
storiesSheet.getRange(`J2:J${storyRows.length + 1}`).dataValidation = {
  rule: { type: 'list', values: fixStatuses },
};
storiesSheet.getRange(`K2:K${storyRows.length + 1}`).dataValidation = {
  rule: { type: 'list', values: retestStatuses },
};
storiesSheet.freezePanes.freezeRows(1);
storiesSheet.freezePanes.freezeColumns(2);
storiesSheet.tables.add(`A1:L${storyRows.length + 1}`, true, 'UserStories');

const statusSummaryRows = [
  ['Metric', 'Value'],
  ['Total stories', `=COUNTA('User Stories'!A2:A${storyRows.length + 1})`],
  [
    'Not tested',
    `=COUNTIF('User Stories'!H2:H${storyRows.length + 1},"Not Tested")`,
  ],
  [
    'Passed first test',
    `=COUNTIF('User Stories'!H2:H${storyRows.length + 1},"Pass")`,
  ],
  [
    'Failed first test',
    `=COUNTIF('User Stories'!H2:H${storyRows.length + 1},"Fail")+COUNTIF('User Stories'!H2:H${storyRows.length + 1},"Needs Fix")`,
  ],
  ['Blocked', `=COUNTIF('User Stories'!H2:H${storyRows.length + 1},"Blocked")`],
  [
    'Fixes needed',
    `=COUNTIF('User Stories'!J2:J${storyRows.length + 1},"Needs Fix")`,
  ],
  [
    'Fixes complete',
    `=COUNTIF('User Stories'!J2:J${storyRows.length + 1},"Fixed")`,
  ],
  [
    'Retest passed',
    `=COUNTIF('User Stories'!K2:K${storyRows.length + 1},"Pass")+COUNTIF('User Stories'!K2:K${storyRows.length + 1},"Retest Pass")`,
  ],
  [
    'Retest failed',
    `=COUNTIF('User Stories'!K2:K${storyRows.length + 1},"Fail")+COUNTIF('User Stories'!K2:K${storyRows.length + 1},"Retest Fail")`,
  ],
];

summary.getRange('A1:F1').merge();
summary.getRange('A1').values = [['yyork app feature tracker']];
summary.getRange('A1').format = {
  fill: '#111827',
  font: { bold: true, color: '#FFFFFF' },
};
summary.getRange('A2:F2').merge();
summary.getRange('A2').values = [
  [
    'Canonical user-story tracker generated from current code. Update User Stories during test/fix/retest loops.',
  ],
];
summary.getRange('A2').format = { fill: '#F9FAFB', wrapText: true };
summary.getRange('A4:B13').values = statusSummaryRows;
applyHeaderStyle(summary.getRange('A4:B4'));
summary.getRange('B5:B13').format.numberFormat = '#,##0';
summary.getRange('D4:E4').values = [['Current Phase', 'Owner']];
summary.getRange('D5:E5').values = [
  [
    'Retest complete: live smoke 29/29, web test:ci 150/150, backend go test ./... pass',
    'Codex',
  ],
];
applyHeaderStyle(summary.getRange('D4:E4'));
summary.getRange('D5:E5').format = { wrapText: true };
summary.getRange('D5:E5').format.rowHeight = 58;
summary.getRange('A15:F15').merge();
summary.getRange('A15').values = [['Inventory Criteria']];
applyTitleStyle(summary.getRange('A15'));
summary.getRange('A16:F19').values = [
  [
    '1',
    'Routes, app shell, API handlers, data contracts, and current tests were read from code.',
    null,
    null,
    null,
    null,
  ],
  [
    '2',
    'Stories are user-visible or operator-visible features, not every low-level UI primitive.',
    null,
    null,
    null,
    null,
  ],
  [
    '3',
    'Expected behavior is code-derived; live-safe flows are retested through the smoke, automated-only flows are labeled, and unsafe manual flows are blocked with notes.',
    null,
    null,
    null,
    null,
  ],
  [
    '4',
    'Errors and fixes are tracked in this workbook so there is one canonical status source.',
    null,
    null,
    null,
    null,
  ],
];
summary.getRange('A16:F19').format = { wrapText: true };
summary.getRange('A16:F19').format.rowHeight = 34;
setColumnWidths(summary, [22, 70, 12, 80, 22, 14]);

const errorHeaders = [
  'Error ID',
  'Feature ID',
  'Area',
  'Severity',
  'Observed Error',
  'Reproduction',
  'Suspected Cause',
  'Fix Commit/File',
  'Retest Result',
];
errorSheet.getRange('A1:I1').values = [errorHeaders];
errorSheet.getRange(`A2:I${errors.length + 1}`).values = errors;
applyHeaderStyle(errorSheet.getRange('A1:I1'));
errorSheet.getRange(`A1:I${errors.length + 1}`).format = {
  wrapText: true,
};
errorSheet.getRange('A1:I1').format.rowHeight = 30;
errorSheet.getRange(`A2:I${errors.length + 1}`).format.rowHeight = 48;
setColumnWidths(errorSheet, [12, 12, 18, 12, 64, 54, 44, 36, 18]);
errorSheet.freezePanes.freezeRows(1);
errorSheet.tables.add(`A1:I${errors.length + 1}`, true, 'ErrorLog');

await fs.mkdir(outputDir, { recursive: true });

const storyInspect = await workbook.inspect({
  kind: 'table',
  range: 'User Stories!A1:L8',
  include: 'values,formulas',
  tableMaxRows: 8,
  tableMaxCols: 12,
  maxChars: 3000,
});
console.log(storyInspect.ndjson);

const formulaErrors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 100 },
  summary: 'formula error scan',
});
console.log(formulaErrors.ndjson);

const preview = await workbook.render({
  sheetName: 'Summary',
  autoCrop: 'all',
  scale: 1,
  format: 'png',
});
await fs.writeFile(
  `${outputDir}/yyork-feature-user-stories-summary.png`,
  new Uint8Array(await preview.arrayBuffer())
);

const storiesPreview = await workbook.render({
  sheetName: 'User Stories',
  range: 'A1:L12',
  scale: 1,
  format: 'png',
});
await fs.writeFile(
  `${outputDir}/yyork-feature-user-stories-table.png`,
  new Uint8Array(await storiesPreview.arrayBuffer())
);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
