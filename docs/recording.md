# Recorder selection

Use the vendored `yyoreel` CLI for standalone-URL recordings:

```bash
pnpm exec yyoreel record
```

This fork provides default-on autozoom and 2x physical output dimensions when
`quality` is 80 or higher. Its config file is `yyoreel.config.json`.

For current in-app recordings that must share yyork's existing browser, keep
using the patched `webreel@0.1.4` wrapper:

```bash
pnpm browser:webreel -- record
```

That wrapper injects the shared Chrome endpoint into the patched Webreel CLI.
The vendored yyoreel fork now accepts `YYOREEL_CDP_ENDPOINT` with an HTTP(S)
endpoint, WebSocket debugger URL, or port. This is the forthcoming attach path
for the shared-browser wrapper; keep Webreel active until yyork's wrapper is
migrated and has equivalent integration coverage.

Refresh the vendored fork from the sibling `../yyoreel` checkout with:

```bash
pnpm vendor:yyoreel
```
