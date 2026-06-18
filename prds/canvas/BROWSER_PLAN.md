# Canvas Browser Implementation Todo

Companion to [PRD.md](./PRD.md). This is the working checklist for turning the
Canvas Browser tab into a VS Code Simple Browser-style local preview surface.

## Scope

yyork Browser supports local development previews only:

- `https://yyork.localhost` and other `*.localhost` portless previews.
- `http://localhost:*`
- `http://127.0.0.1:*`
- `http://[::1]:*`

yyork Browser does not try to be a general web browser. External sites such as
Google, Facebook, GitHub, and arbitrary internet URLs should be rejected or shown
as unsupported. Users already have a real browser for that.

Do not keep the CDP/headless/screenshot renderer as a Browser-tab fallback. The
Browser tab should be a live iframe surface with local-preview instrumentation.

Hard constraints:

- Annotation and preview instrumentation must be vendored with yyork. User
  preview apps must not install yyork, Agentation, or any annotation dependency.

## VS Code References

Use upstream VS Code as the baseline reference before implementing each slice.
Do not cargo-carry its Electron/webview details into yyork; extract the product
behavior and security posture.

- `microsoft/vscode/extensions/simple-browser/src/simpleBrowserView.ts`
  - Webview panel lifecycle.
  - `retainContextWhenHidden`.
  - Webview options: scripts/forms/local resources.
  - Simple toolbar: back, forward, reload, address input, open externally.
  - Iframe sandbox: scripts, forms, same-origin, downloads.
- `microsoft/vscode/extensions/simple-browser/src/simpleBrowserManager.ts`
  - One active view model.
  - Restore existing view instead of creating duplicate panels.
- `microsoft/vscode/extensions/simple-browser/src/extension.ts`
  - Command registration and URL handoff.
- `microsoft/vscode/extensions/simple-browser/media/main.css`
  - Minimal grid layout: toolbar row plus full-height iframe content.
- `microsoft/vscode/extensions/simple-browser/preview-src/index.ts`
  - Generated into `media/index.js` at build time.
  - Toolbar behavior for address input, back, forward, reload, and open
    externally.
  - Reload is implemented by reassigning `iframe.src` with request-id query
    parameters because iframe reload behavior is limited.
- Current yyork implementation:
  - `web/src/features/home/components/molecules/canvas-web-preview.tsx`
  - `web/src/features/home/data/browser-preview.ts`
  - `web/src/features/home/data/browser-preview.unit.spec.ts`

Before coding a milestone, inspect the current `main` version of the VS Code
files above. If we need more than occasional reference, clone the VS Code repo
outside the yyork working tree.

## Current State

- Live iframe preview exists.
- Local-only URL validation exists.
- The 3-dot menu contains hard reload, clear cookies, and clear cache.
- DOM event capture works for same-origin dogfooding with
  `https://yyork.localhost`.
- The old screenshot viewport is not used by the React Browser tab.

Known gaps:

- Old CDP/headless backend code still needs deletion or isolation.
- DOM events do not work across normal iframe origin boundaries yet.
- History is React-local and does not know about SPA navigation inside previews.
- Clear cookies/cache only works when the parent can access the iframe origin.
- No persistent last-url/history model per Canvas target yet.
- No dedicated dogfood e2e suite for the Browser tab yet.

## Implementation Order

### B0. Reference Snapshot

- [x] Inspect latest VS Code Simple Browser source files listed above.
- [x] Record any behavior we intentionally copy, adapt, or reject.
- [x] Verify the current VS Code iframe sandbox and toolbar behavior.
- [x] Verify whether VS Code has any localhost-specific URL opener behavior that
  should influence yyork.

Reference snapshot from VS Code `main` on 2026-06-08:

- Copy: the Browser surface is an iframe-based preview, not a screenshot stream.
- Copy: keep the toolbar small: back, forward, reload, address input, open
  external.
- Copy: use one active preview model instead of creating duplicate Browser
  surfaces for the same task.
- Copy: iframe sandbox allows scripts, forms, same-origin, and downloads for
  local preview usability.
- Copy: local host detection includes `localhost`, `127.0.0.1`, `[::1]`,
  `0.0.0.0`, and `[::]`.
- Adapt: yyork also supports `*.localhost` for portless previews.
- Adapt: yyork keeps hard reload, clear cookies, clear cache, and DOM events in
  its Canvas-specific Browser UI.
- Reject: VS Code's `frame-src *` / arbitrary manual URL behavior. yyork Browser
  remains local/portless-preview-only.
- Reject: VS Code's reload behavior that mutates the preview URL with request-id
  query parameters as the only reload mechanism. yyork should keep URL identity
  stable and use iframe key reloads unless a bridge/proxy milestone needs a
  scoped cache-busting request.
- Reject: relying only on iframe browser history. yyork needs explicit event
  capture/history state so agents can reason about preview interactions.

Acceptance:

- [x] We have a short note in this file or a follow-up implementation comment that
  states which VS Code behaviors are being used for the next milestone.

### B1. Remove Screenshot Browser Split-Brain

- [x] Find all frontend calls to the browser snapshot/command API.
- [x] Delete or disconnect unused screenshot Browser UI code.
- [x] Delete or quarantine unused server routes for snapshot, click, scroll,
  navigate, reload, and browser session state if no other feature uses them.
- [x] Remove obsolete tests that prove screenshot behavior.
- [x] Keep the yyork Browser tab live-iframe only.

Implementation note:

- `internal/server/server.go` no longer imports or constructs a BrowserManager.
- `/api/browser/{browserID}/snapshot` and `/api/browser/{browserID}/command`
  are no longer registered.
- The untracked CDP/headless files `internal/server/browser.go` and
  `internal/browser/manager.go` were removed from this checkout.
- No screenshot-specific Browser frontend tests existed in the current tree;
  the current Browser frontend tests cover local URL validation instead.

Acceptance:

- [x] `rg "browser snapshot|Browser viewport|screenshot|snapshot"` has no Browser
  UI path implying screenshots.
- [x] Browser tab still dogfoods `https://yyork.localhost`.
- [x] TypeScript and focused Browser tests pass.

### B2. Local Preview URL Model

- [x] Keep validation local-only.
- [x] Normalize local preview URLs without surprising protocol rewrites.
- [x] Preserve explicit `https://` input, especially `https://yyork.localhost`.
- [x] Reject arbitrary external hosts with a clear unsupported state.
- [x] Persist last Browser URL per Canvas target.
- [x] Add history seed from the persisted URL.

Implementation note:

- `workspace-preferences.ts` now stores Browser preview URLs in
  `canvasPreviewUrls`, keyed by Canvas target:
  `session:<projectId>:<sessionId>`, `project:<projectId>`, or `cwd:<cwd>`.
- The active Canvas tab is stored in `canvasTab`, so selecting Browser survives
  Canvas close/reopen and yyork page refresh.
- The old `canvasPreviewUrl` field remains a read-only legacy fallback and is
  cleared by new Browser URL writes.
- Stored Browser URLs are normalized through the same local-only validator, so
  unsupported persisted hosts are dropped instead of replayed.
- `CanvasWebPreview` already seeds its local history from `defaultUrl`; target
  scoped persistence now feeds that value per project/session.
- Dogfood verification with `https://yyork.localhost` restored the Browser
  iframe after reloading yyork, and `https://google.com` showed the unsupported
  state without changing the iframe.

Acceptance:

- [x] `https://yyork.localhost` remains the dogfood default when explicitly entered.
- [x] `https://google.com` and `https://facebook.com` do not load in yyork Browser.
- [x] Reloading yyork restores the last Browser URL for that project/session target.

### B3. Preview Bridge Contract

Add a small instrumentation contract that yyork injects into proxied local
preview HTML responses. It runs inside the preview document at runtime, but it is
owned and shipped by yyork. User preview apps must not add source imports,
package dependencies, plugins, or build-time config for this bridge.

Message types:

- `yyork:preview-ready`
- `yyork:location-changed`
- `yyork:dom-event`
- `yyork:storage-cleared`
- `yyork:storage-clear-failed`

Captured browser events:

- `click`
- `input`
- `change`
- `keydown`
- `submit`
- `focusin`
- `scroll`

Captured navigation events:

- initial `location.href`
- iframe load
- `history.pushState`
- `history.replaceState`
- `popstate`
- `hashchange`

Storage commands from parent to bridge:

- `yyork:clear-cache`
- `yyork:clear-cookies`
- `yyork:clear-storage`

Acceptance:

- [x] Same-origin dogfood continues to work.
- [x] A yyork-proxied preview page emits DOM events through `postMessage`.
- [x] Event payloads include timestamp, URL, event type, selector, text/value when
  safe, and optional coordinates.

Agentation integration note:

- `agentation@3.0.2` is installed as a yyork web dependency only. User preview
  apps still must not install Agentation or add source imports.
- `web/vite.preview.config.ts` emits a yyork-owned Agentation IIFE bundle into
  the embedded dashboard assets at `__yyork_browser/agentation.js`.
- The preview proxy injects that bundle into HTML responses alongside the
  preview bridge, so Agentation runs inside the proxied preview document and can
  render its normal element highlighter without user app dependencies.
- Agentation lifecycle messages use `source: "yyork-preview-agentation"` and
  are accepted by the Browser parent listener so annotation add/update/delete
  events can flow into the existing DOM events tray.

### B4. Local Preview Injection Path

Build a local-only proxy/injection path so yyork can instrument preview apps
without needing direct iframe DOM access.

- [x] Add a server route that proxies local preview URLs.
- [x] Restrict proxy targets to the same local-only allowlist as the frontend.
- [x] Inject the vendored preview bridge into HTML responses.
- [x] Preserve non-HTML assets without mutation.
- [x] Preserve headers needed for local app behavior where safe.
- [x] Block redirects to unsupported hosts.
- [x] Add clear error states for unsupported content or blocked redirects.

Implementation note:

- `POST /api/browser-preview/targets` registers a local-only target and returns
  a synthetic `*-preview.yyork.localhost` URL for the iframe.
- Preview registration accepts a yyork-owned `previewName`; project Browser
  tabs send the selected project name so URLs use the intended
  `appname-preview.yyork.localhost` shape instead of port-derived hostnames.
- yyork self-preview is special-cased to `yyork-preview.yyork.localhost`, both
  when yyork is reached through `yyork.localhost` and when the current dev
  process is reached through `127.0.0.1:<port>`.
- Preview-host requests are reverse-proxied server-side by yyork; HTML responses
  receive yyork-vendored bridge and Agentation scripts, and non-HTML responses
  pass through unchanged.
- CSP and Integrity policy headers are stripped on injected HTML responses
  because yyork is deliberately adding a runtime script. User app source code,
  package dependencies, plugins, and build config stay untouched.
- Local redirects are rewritten through the same preview host model. Unsupported
  redirects fail with an explicit proxy error.

Acceptance:

- [x] A sample app on `http://localhost:<port>` can be loaded through yyork Browser.
- [x] DOM events flow from the preview even though the original app origin is not
  `https://yyork.localhost`.
- [x] Unsupported external redirects are blocked instead of silently loading.

### B5. History and Navigation

- [x] Use bridge `location-changed` messages as the source of truth.
- [x] Track back/forward state from yyork Browser history entries.
- [x] Implement toolbar back/forward against iframe history or Browser history.
- [x] Keep address input synchronized with iframe navigation.
- [x] Handle SPA navigation without a full iframe reload.
- [x] Avoid toolbar flicker during scroll or unrelated DOM events.

Implementation notes (landed):

- The iframe binds to a `navigation {id, url}` value that only changes on
  user-driven navigation (address bar, back/forward, reload). Bridge
  `location-changed` messages update history and the address bar but never
  rebind the iframe, so SPA navigation inside the preview does not reload it.
- The on-load `contentWindow.location.href` read is gone; the bridge is the
  only frame-side truth source. (It was cross-origin garbage behind the
  preview proxy and double-pushed history entries.)
- A frame-originated change matching the adjacent history entry (in-frame
  popstate back/forward) moves the index instead of pushing a duplicate.
- Toolbar back/forward navigates by rebinding the frame to the recorded
  entry — a reload of that URL, not in-frame history traversal, which a
  cross-origin parent cannot drive without new bridge commands.

Acceptance:

- Back/forward works for:
  - direct address-bar navigation,
  - iframe link clicks,
  - SPA `pushState`,
  - hash changes.
- Scrolling a preview does not change toolbar state or trigger reload flicker.

### B6. Reload, Hard Reload, Cache, and Cookies

- [x] Keep one normal reload button in the address bar.
- [x] Keep hard reload in the 3-dot menu.
- [x] Send storage-clearing commands through the bridge when proxied.
- [x] Fall back to same-origin direct clearing only for dogfood iframe access.
- [x] Show a small failure toast when storage cannot be cleared.
- [x] Confirm clear-cache and clear-cookies do not create duplicate reloads.

Implementation notes (landed):

- Clear commands resolve before the single frame rebind: same-origin frames
  are cleared directly; proxied previews go through the bridge and must
  acknowledge with storage-cleared / storage-clear-failed (2s timeout).
  The old blind 120ms wait could remount the frame mid-clear.
- Failures (bridge error or no ack) surface as one toast; the reload still
  proceeds. The viewport no longer routes clear failures into the inline
  error banner.
- Dogfooded on https://yyork.localhost: hard reload cleared localStorage +
  cookies through the real bridge, and clear-cookies removed cookies while
  preserving localStorage (scope check), one reload each.

Acceptance:

- Normal reload refreshes iframe content.
- Hard reload clears Cache API, local storage, session storage, and cookies that
  JavaScript can delete, then reloads.
- Clear cookies and clear cache work for bridge-enabled previews.

### B7. DOM Event Review Surface

- [ ] Keep the compact DOM events tray.
- [ ] Add event filtering by type.
- [ ] Add copy JSON for a selected event.
- [ ] Cap retained events to a bounded number.
- [ ] Make event rows stable under high-frequency input.
- [ ] Consider hiding noisy scroll events by default if they dominate the tray.

Acceptance:

- User interactions inside a preview produce readable, bounded event rows.
- Agents can consume copied event JSON without scraping UI text.

### B8. Tests and Dogfood Harness

- [ ] Unit-test URL validation.
- [ ] Unit-test bridge message validation.
- [ ] Add a tiny local preview fixture app.
- [ ] Add Browser-tab e2e coverage for `https://yyork.localhost`.
- [ ] Add Browser-tab e2e coverage for `http://localhost:<fixture-port>`.
- [ ] Assert there is no screenshot viewport in the Browser tab.
- [ ] Assert arbitrary external URLs are rejected.
- [ ] Assert back/forward, reload, hard reload, clear cache/cookies, and DOM
  event capture.

Acceptance:

- Dogfood e2e proves yyork can preview yyork.
- Fixture e2e proves non-yyork local previews work through the bridge/proxy.

## Working Rules

- Implement one milestone at a time.
- Dogfood `https://yyork.localhost` after every Browser milestone.
- Do not add arbitrary external browsing support.
- Do not reintroduce screenshot/CDP rendering as a Browser-tab fallback.
- Keep toolbar controls compact and VS Code-like: icon buttons, address input,
  open external, and a menu for less frequent actions.
- Keep the Browser tab usable as a web app surface; do not require Electron.
