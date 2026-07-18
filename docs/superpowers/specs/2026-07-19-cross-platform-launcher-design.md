# Cross-Platform yyork Launcher Design

**Date:** 2026-07-19

## Summary

yyork remains a browser-based web application. This design adds a small
cross-platform companion launcher for macOS, Windows, and Linux. The launcher
starts or reuses the existing local yyork server, opens the dashboard in the
user's default browser, remains available in the operating system's tray or
menu bar after browser tabs close, and delivers actionable native worker
notifications.

The launcher does not embed a browser, render yyork in a desktop window, or
duplicate the web interface. The initial tray menu contains only **Open yyork**
and **Quit yyork**. Rich worker status, launch-at-login controls, and a custom
popover remain outside this implementation.

## Goals

- Launch yyork from Spotlight on macOS, Windows Search/Start Menu, or a Linux
  application menu.
- Reuse a healthy server advertised by `~/.yyork/server.json`; otherwise start
  the packaged yyork server without opening a duplicate browser window.
- Open the running web application in the default browser on initial launch,
  explicit application relaunch, tray activation, or **Open yyork**.
- Keep the server and launcher running after every yyork browser tab closes.
- Offer **Quit yyork**, which gracefully shuts down the advertised server and
  exits the launcher.
- Deliver native notifications when a worker finishes a turn or needs human
  triage.
- Open the relevant yyork terminal route when the user activates a
  notification, when the operating system supports notification actions.
- Preserve the existing CLI, single-binary server, global npm installation,
  and bundled Zellij behavior.
- Continue shipping a signed and notarized macOS DMG while making global npm
  installation expose the launcher on all three platforms.

## Non-Goals

- Embedding yyork in a WebView or desktop window.
- Replacing the browser-based interface with native UI.
- A rich tray popover, worker counters, or status dashboard.
- Launch at login, automatic updates, or background system services.
- Windows MSI/MSIX or Linux deb, rpm, Snap, Flatpak, or AppImage packaging in
  this iteration.
- Guaranteeing actionable Linux notifications on desktop environments whose
  notification service does not advertise action support.

## Existing Foundations

The current root command starts the integrated dashboard/API server at
`127.0.0.1:7331` and already accepts `--open=false`. The server writes its
address, process ID, and control token to `~/.yyork/server.json`, exposes
`GET /api/health`, and accepts an authenticated
`POST /api/control/shutdown`. These contracts will be reused rather than
creating a second server protocol.

The server's event bus already emits `session.created`, `session.updated`, and
`session.terminated` through `GET /api/events`. Worker hook metadata exposes
the meaningful notification states:

- `prompt`: a worker completed its turn and is waiting for another prompt.
- `triage`: a worker is blocked on human action, with `triageReason` when
  available.

Native npm packages already contain architecture-specific `yyork` and
`zellij` executables. The release workflow already builds those executables
with GoReleaser and packs them into OS/CPU-specific npm packages.

## Architecture

### Process model

The release adds a separate `yyork-launcher` executable. Keeping it separate
preserves the existing `CGO_ENABLED=0` yyork server builds while allowing the
tray executable to use native desktop APIs.

On startup, the launcher:

1. Acquires a per-user launcher lock under the yyork data directory.
2. If another launcher owns the lock, waits briefly for a healthy advertised
   server, opens it in the default browser, and exits without adding a second
   tray icon.
3. Reads `~/.yyork/server.json` and probes the advertised server's health
   endpoint.
4. Reuses a healthy advertised server regardless of whether it was started by
   the CLI or an earlier launcher.
5. Treats an unreachable advertisement as stale and starts the packaged
   sibling `yyork` executable with `--open=false`.
6. Waits for a newly advertised healthy server with a bounded timeout.
7. Opens the server origin in the default browser and starts the tray and
   notification loops.

Closing browser tabs has no effect on the launcher or server. If a child
server exits unexpectedly, the launcher reports the failure through a native
notification but does not enter an unbounded restart loop.

### Shared Go launcher core

Shared Go code owns:

- runfile discovery and health checks;
- server process startup and bounded readiness polling;
- the single-instance lock;
- browser URL construction and opening;
- tray command coordination;
- SSE reconnection with bounded exponential backoff;
- worker snapshot comparison and notification deduplication;
- graceful shutdown through the existing authenticated control endpoint.

The platform layer exposes narrow interfaces for tray presentation,
notifications, application registration, and browser opening. No session or
server rules live in platform-specific files.

### Tray shell

The tray uses `fyne.io/systray`, a small Go library supporting macOS, Windows,
and Linux without bringing in a desktop window or browser runtime. The first
release exposes exactly:

- **Open yyork**: health-check the advertised server, start it when absent,
  and open the browser.
- separator;
- **Quit yyork**: request graceful server shutdown, wait for the owned child
  process when applicable, release launcher resources, and exit.

Clicking or relaunching the application is equivalent to **Open yyork** where
the operating system provides such an activation event.

### Worker notifications

After connecting to `/api/events`, the launcher loads the current workspace as
its baseline without displaying historical notifications. On each
`session.updated`, it refreshes the affected session data and compares the
new worker state and timestamps with its in-memory snapshot.

It emits a notification only for a new transition into:

- `prompt` with a newer `lastAssistantMessageAt` or `lastActivityAt`: title
  **Worker finished**, body containing the worker title and recap when
  available;
- `triage` with a newer `lastActivityAt`: title **Worker needs attention**,
  body containing the worker title and `triageReason` when available.

Orchestrator sessions do not generate worker notifications. A launcher
restart establishes a fresh baseline and does not replay old events. Repeated
`session.updated` events with the same state timestamp are deduplicated.

Each notification carries the route:

`<server-origin>/terminal/<escaped-session-id>?project=<escaped-project-id>`

Notification activation opens that route in the default browser. On Linux,
the adapter checks the notification server's `actions` capability. When it is
unavailable, yyork still displays an informational notification and the user
can open yyork from the tray.

## Platform Adapters and Development Environments

### macOS

- Toolchain: Go plus Xcode Command Line Tools on a macOS runner.
- Tray: the shared systray library's AppKit/Objective-C implementation.
- Notifications: a small Objective-C CGO bridge using
  `UNUserNotificationCenter` and `UNUserNotificationCenterDelegate`.
- Activation: the delegate forwards the notification URL to the shared Go
  browser opener.
- Packaging: `yyork.app` uses `LSUIElement=1`, contains the launcher, yyork,
  and Zellij executables, and is signed with the hardened runtime. The DMG is
  signed, notarized, stapled, and attached to the GitHub release.

Objective-C is preferred over Swift for this narrow adapter because it links
directly through CGO and avoids a separate Swift helper process or static
library bridge. The resulting notification and menu-bar behavior is still
native AppKit/UserNotifications behavior.

### Windows

- Toolchain: Go on a Windows GitHub Actions runner.
- Tray: the shared systray library's Win32 implementation; the binary is built
  with the Windows GUI subsystem so no console window appears.
- Notifications: a Windows-only Go adapter over WinRT/COM toast APIs.
- Registration: global npm installation creates a Start Menu shortcut with a
  stable yyork AppUserModelID, which Windows requires for desktop toasts.
- Activation: toast activation launches `yyork-launcher` with the encoded
  yyork route. That short-lived second process opens the route in the default
  browser and exits when the per-user lock shows that the resident launcher
  is already running, so it never adds another tray icon.

### Linux

- Toolchain: Go on an Ubuntu GitHub Actions runner.
- Tray: the shared systray library's StatusNotifierItem D-Bus implementation,
  avoiding a GTK application dependency.
- Notifications: a Linux-only Go adapter over
  `org.freedesktop.Notifications`.
- Activation: register the specification's `default` action and handle
  `ActionInvoked` when the notification service advertises action support.
- Registration: global npm installation writes a user-level `.desktop` file
  and icon under XDG data directories.

## Installation and Packaging

### Native npm packages

Each native package gains the platform launcher executable and launcher
assets next to the existing yyork and Zellij executables. The wrapper's
postinstall remains safe for normal project dependencies: desktop
registration occurs only for a global install.

For global installs:

- macOS copies the complete signed `yyork.app` into
  `~/Applications/yyork.app` so Spotlight can index it;
- Windows installs a per-user Start Menu shortcut targeting the packaged
  launcher and assigns the stable AppUserModelID;
- Linux installs a per-user `.desktop` entry and icon using XDG paths.

Registration is idempotent and replaces only yyork-owned launcher artifacts.
Failure to register the desktop entry is warning-only so an otherwise valid
CLI installation remains usable. The release smoke test treats registration
failure as fatal in its isolated test home.

### macOS DMG

The macOS release job consumes the existing arm64 and x64 GoReleaser
artifacts, builds the corresponding launcher executables, assembles signed app
bundles, and creates the signed DMG. Release publication requires these
repository secrets:

- `APPLE_CERTIFICATE_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_TEAM_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`

Published tag builds fail rather than silently releasing an unsigned DMG when
credentials are missing. Non-publishing workflow runs use ad-hoc signing and
skip notarization while still verifying bundle and DMG assembly.

## Error Handling

- Invalid or missing runfiles are treated as no advertised server.
- An advertised server is reused only after a successful health response.
- Server startup has a fixed deadline and produces a native error
  notification when it cannot become healthy.
- SSE disconnects retry with bounded exponential backoff and reset after a
  successful connection.
- Notification permission denial or unsupported Linux actions do not stop the
  server, tray, or browser launcher.
- Quit attempts graceful authenticated shutdown first, then terminates only a
  child server process owned by this launcher if graceful shutdown times out.
  It never sends an operating-system signal to an unrelated advertised PID.
- Desktop-registration errors never corrupt or remove unrelated shortcuts,
  application entries, or app bundles.

## Testing and Verification

### Automated tests

- Go unit tests cover healthy server reuse, stale-runfile recovery, readiness
  timeout, single-instance behavior, browser route construction, SSE
  reconnection, state-transition detection, and notification deduplication.
- Platform adapter contract tests use fakes for notification delivery and
  activation callbacks.
- OS-native compile tests run on macOS, Windows, and Ubuntu CI runners.
- Node packaging tests verify every native package contains the correct
  launcher and registration assets.
- Global-install smoke tests use isolated home/profile directories and verify
  the macOS app bundle, Windows Start Menu shortcut, or Linux desktop entry.
- `pnpm release:check` continues proving installation and execution with Go
  intentionally unavailable.

### Runtime verification

- Launch from the platform application surface and confirm the default browser
  opens the existing web application.
- Close every browser tab and confirm the server and tray remain running.
- Launch yyork again and confirm it reuses the same advertised PID and does
  not create a second tray icon.
- Drive a worker from `working` to `prompt` and `triage`, confirm one native
  notification per transition, and activate it to open the matching terminal
  route.
- Select **Quit yyork** and confirm the runfile disappears after graceful
  shutdown.
- On macOS, verify the final app and DMG signatures, notarization ticket, and
  Gatekeeper assessment.

## Source and Dependency Constraints

- Preserve all unrelated dirty-worktree changes.
- Keep the web interface in `internal/web` unchanged unless a route bug blocks
  notification activation.
- Keep the existing server binary buildable with `CGO_ENABLED=0`.
- Add CGO/native requirements only to the separate launcher build.
- Pin new Go dependencies to explicit versions and retain their license files
  or notices where distribution requires them.
- Do not add Electron, Tauri, a WebView, or another browser runtime.
