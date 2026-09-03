# Live Codex Terminal Theme Design

## Goal

Make a running Codex worker adapt between yyork's light and dark terminal palettes without restarting the worker, matching Codex in a native terminal.

## Architecture

Codex enables terminal focus reporting and re-queries OSC 10/11 foreground/background colors whenever it receives a focus-gained event. The durable terminal host must preserve that focus-reporting mode in reconnect snapshots. While no browser is attached, the host may answer startup color queries from its safe fallback palette; while a browser is attached, it must leave those queries unanswered so xterm can return its active CSS-derived palette.

The reused xterm instance will request one palette refresh after each session replay and after each app theme flip. It will send focus-gained only when the attached application enabled focus reporting, preventing focus bytes from leaking into shells or agents that did not opt in.

## Data Flow

1. Codex writes `CSI ? 1004 h`; terminalhost records focus reporting as enabled.
2. A browser attaches; terminalhost includes `CSI ? 1004 h` in its repaint snapshot.
3. After xterm parses the replay, it sends `ESC [ I` once.
4. Codex re-queries OSC 10/11.
5. Terminalhost forwards the queries but suppresses its fallback response because a browser is attached.
6. xterm answers from the active `--terminal-foreground` and `--terminal-background` values.
7. Codex redraws using the new semantic palette.
8. A later light/dark class change repeats steps 3-7 without restarting the process.

## Constraints

- Do not restart, stop, or replace active Codex sessions on theme changes.
- Preserve the current startup fallback for headless sessions.
- Preserve the single xterm instance across session switches.
- With multiple browser clients, the most recently focused/theme-refreshed client owns the shared PTY palette, matching a single active native terminal.

## Verification

- Go tests cover headless fallback responses, attached-browser OSC ownership, and focus-mode reconnect snapshots.
- Browser tests cover initial replay sync and light-to-dark-to-light refresh signals.
- A live Codex worker is inspected before and after both theme transitions without changing its session id.
- Webreel records the verified transition at 60 FPS and quality 90.
