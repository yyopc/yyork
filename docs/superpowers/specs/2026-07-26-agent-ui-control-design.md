# Agent-Driven Dashboard UI Control Design

## Goal

Let any yyork agent session manipulate the user's open yyork.localhost dashboard
on the user's command ("open the command palette", "toggle the canvas", "show me
the worker's diff") through a first-class `yyork ui` CLI verb, riding the
existing authenticated event bus — no browser automation, no CDP.

## Approved decisions

- **Scope (v1):** UI chrome + navigation — command palette, sidebar, canvas
  open/close/toggle, canvas tab switching, session selection, route navigation.
  No mutating actions (mark-viewed, refresh, open-IDE) in v1.
- **Authority:** any session may send UI commands — workers included, no CLI
  enforcement. Prompt guidance covers appropriateness (e.g. a worker opens
  Review on its own diff when presenting results).
- **No connected dashboard:** report `{delivered: false, subscribers: 0}`; the
  agent tells the user to open yyork.localhost. No auto-launch, no replay queue.
- **Foundation:** the frontend command surface is the existing
  `dispatchLayout` action set in
  `internal/web/src/features/home/pages/workspace-layout.tsx` (it already
  drives the live ⌘K palette via the `command-palette` action, plus
  `canvas-tab` and the sidebar/canvas toggles). The SSE dispatcher maps
  `ui.command` events onto those actions; agent verbs and palette entries stay
  in lockstep by construction.

## Design

### Event flow

```
agent: yyork ui open-palette --json
  → control.NewForwardingPublisher() → POST /api/events   (control-token gated)
  → control.ToEvent whitelist → events.Bus.Publish
  → GET /api/events SSE → session-events-subscriber.tsx
  → uiCommandDispatch(command, args) → dispatchLayout / router
```

All rails exist; the new pieces are one event type, one CLI verb, and one
frontend dispatch map.

### Event shape

New constant in `internal/events/events.go`:

- `TypeUICommand Type = "ui.command"` with payload
  `{"command": "<verb>", "args": {…}}` (free-form map per the existing
  `Event.Payload` contract).

`control.ToEvent` (the whitelist that makes unknown envelope types a 400 in
`handlePublishEvent`, `internal/server/sessions.go`) accepts the new type and
requires a non-empty `command` string.

### Command vocabulary (v1)

| Verb | Args | Frontend effect |
|---|---|---|
| `open-palette` / `close-palette` / `toggle-palette` | — | `dispatchLayout({type: 'command-palette', open})` |
| `open-sidebar` / `close-sidebar` / `toggle-sidebar` | — | existing sidebar layout action (same one ⌘B uses) |
| `open-canvas` / `close-canvas` / `toggle-canvas` | — | existing canvas layout action (same one ⌘⇧B uses) |
| `open-canvas-tab` | `tab: files\|review\|browser` | `dispatchLayout({type: 'canvas-tab', …})`, composing preconditions below |
| `select-session` | `sessionId`, optional `projectId` | route/selection navigation to that session's terminal view |
| `navigate` | `route` (app-internal path only) | router navigation |

Explicit `open-`/`close-` variants exist because agents cannot see UI state;
prompt guidance prefers them over `toggle-`. Exact frontend action names are
resolved during implementation from `workspace-layout.tsx` — the table binds
verbs to *capabilities*, not to literal action strings.

**Preconditions compose in the frontend, not the agent.** Canvas tabs render
only on the terminal route with a session selected and are `inert` while the
canvas is closed, so `open-canvas-tab review` internally performs
select-route → open-canvas → switch-tab. Agents send intent; the dispatcher
owns sequencing.

### CLI verb

`yyork ui <verb> [args…] --json` in `internal/cli/commands.go`, registered
top-level alongside `spawn`/`stop`/`send`. It builds the `ui.command` envelope
and publishes through the same forwarding path the hooks use. Output contract:

- `{"command": "...", "delivered": true, "subscribers": N}` on success.
- `{"delivered": false, "subscribers": 0}` when the server is up but no
  dashboard client is subscribed, or when no server is running (plus a human
  hint on stderr in non-JSON mode). Exit 0 in both cases — undelivered is a
  state, not an error.
- Unknown verb / bad args: usage error, exit non-zero, before any network call.

### Subscriber count

`handlePublishEvent` currently replies 204 with no body. For `ui.command`
envelopes it replies `200 {"subscribers": N}` backed by a new
`Bus.SubscriberCount()` (`internal/events`). Existing publishers
(hooks' fire-and-forget `ForwardingPublisher`) ignore response bodies, so the
change is backward compatible; non-`ui.command` envelopes keep the 204 path.

### Frontend dispatch

`session-events-subscriber.tsx` (the existing SSE consumer in
`internal/web/src/features/home/data/`) gains a `ui.command` branch that calls
a small `dispatchUICommand(command, args)` module. That module lives beside
`workspace-layout.tsx`'s action definitions and is the single map from verb →
layout action/router call. Unknown verbs are ignored with a console warning —
never a crash. Multiple connected tabs all react (broadcast semantics, per the
approved decision).

### Prompt guidance

`internal/session/prompts/orchestrator.md` and `worker.md` gain a short
section: when the user asks to manipulate the yyork dashboard, run
`yyork ui <verb> --json`; prefer explicit open/close over toggle; workers use
it to present their own results (e.g. `yyork ui open-canvas-tab --tab review`
after finishing a diff), not to interrupt unrelated user activity; on
`delivered: false`, tell the user to open https://yyork.localhost.

## Error handling

- Publish without a running server: ForwardingPublisher no-ops → CLI reports
  `delivered: false` rather than erroring.
- Malformed `ui.command` envelope: rejected by `control.ToEvent` → 400, CLI
  surfaces it (this path only occurs on version skew between CLI and server).
- Unknown verb reaching an older dashboard bundle: silently ignored client-side
  (console warning) — forward compatibility for new verbs.
- SSE has no replay: a command sent while no tab is connected is dropped by
  design (approved decision), and `subscribers: 0` makes that visible.

## Verification

- `internal/events`: unit test for `SubscriberCount` and `ui.command` publish.
- `internal/server/publish_event_test.go` patterns: valid `ui.command` with
  token → 200 + subscriber count; missing token → 403; unknown type → 400
  (existing behavior unchanged).
- `internal/cli/main_test.go`: `yyork ui toggle-canvas --json` against a stub
  server → delivered payload; no server → `delivered: false`, exit 0; unknown
  verb → usage error.
- Frontend browser spec: inject a synthetic `ui.command` SSE event, assert the
  palette/canvas state changed via the existing layout state; unknown verb
  asserts no crash.
- `internal/session/prompts_test.go`: assert the new `yyork ui` guidance token
  renders in both prompts.
- Manual smoke: from the orchestrator terminal, `yyork ui open-palette` with
  the dashboard open at https://yyork.localhost; verify palette opens and the
  CLI reports `subscribers >= 1`.

## Out of scope (follow-ups)

- Mutating action verbs (mark-viewed, refresh, open-IDE).
- Per-client targeting and command acknowledgment round-trips.
- Auto-launching the browser with replay-on-connect.
- UI state queries (`yyork ui state`) for agents to read panel state.
