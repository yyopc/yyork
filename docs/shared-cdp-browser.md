# Shared CDP browser workflow

Use one dedicated Chrome process and one tab per tool. The normal `@playwright/test`
suite remains isolated; this workflow is only for interactive browser work and
yyoreel runs that explicitly opt in.

## Start or select the browser

```bash
pnpm browser:shared:start
pnpm browser:shared:status
```

If d3k is already ready, `browser:shared:start` selects its browser via
`d3k cdp-port` and exits without starting another process. If d3k is not running,
the command starts Chrome with a dedicated profile and then starts d3k with
`--external-cdp-base`.

The external fallback defaults to port `9222` and
`~/.yyork/browser/shared-cdp-profile`. Both are configurable:

```bash
YYORK_SHARED_CDP_PORT=9333 \
YYORK_SHARED_CHROME_PROFILE="$HOME/.yyork/browser/yyork-cdp" \
YYORK_SHARED_CHROME_PATH="/path/to/Google Chrome" \
pnpm browser:shared:start
```

Set `YYORK_SHARED_CDP_ENDPOINT` to select an already-running, explicitly trusted
automation browser. Other commands otherwise discover d3k's port automatically.

## Agent Browser

```bash
pnpm browser:agent -- open https://yyork.localhost
pnpm browser:agent -- snapshot -i
```

The wrapper uses a stable agent-browser session, creates/selects the labeled
`yyork-agent-browser` tab, and rejects commands that could switch to another
tool's tab. `open` navigates that reserved tab; `close` closes only that tab.

## Interactive Playwright CLI

Point the wrapper at an already-installed Playwright CLI, attach it, and use the
named session for subsequent interactive commands:

```bash
export PLAYWRIGHT_CLI_BIN="$(command -v playwright-cli)"
export PLAYWRIGHT_CLI_SESSION=yyork-shared-playwright

pnpm browser:playwright:attach
"$PLAYWRIGHT_CLI_BIN" -s="$PLAYWRIGHT_CLI_SESSION" snapshot
"$PLAYWRIGHT_CLI_BIN" -s="$PLAYWRIGHT_CLI_SESSION" goto https://yyork.localhost
pnpm browser:playwright:detach
```

Attach creates a fresh active Playwright tab. Keep that tab selected for the
interactive session; detach closes it and disconnects without closing Chrome.
Do not use this session for `@playwright/test`; `pnpm e2e` keeps its deterministic,
isolated browser lifecycle.

## Yyoreel

```bash
pnpm browser:yyoreel -- preview -c path/to/yyoreel.config.json --verbose
pnpm browser:yyoreel -- record -c path/to/yyoreel.config.json
```

The wrapper sets `YYOREEL_CDP_ENDPOINT` from the discovered shared browser.
Yyoreel creates a fresh target for each video and closes only that target/client
afterward. Running `pnpm exec yyoreel ...` without the environment variable
preserves yyoreel's isolated Chrome launch/kill behavior.

## Security and ownership

- Never point this workflow at the normal Chrome profile. CDP grants complete
  control over tabs, cookies, storage, and page content.
- The fallback launcher binds CDP to loopback and always supplies a dedicated
  `--user-data-dir`; it refuses to adopt an unknown process already using the
  configured port.
- Treat the dedicated automation profile as sensitive. Do not commit, copy, or
  share it, and do not put credentials in command arguments or recordings.
- Agent Browser, Playwright CLI, and every yyoreel video use separate tabs. Do
  not manually switch one tool to another tool's tab.
