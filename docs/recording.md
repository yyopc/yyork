# Recorder selection

Use the vendored `yyoreel` CLI for standalone-URL recordings:

```bash
pnpm exec yyoreel record
```

This fork provides default-on autozoom and 2x physical output dimensions when
`quality` is 80 or higher. Its config file is `yyoreel.config.json`.

For in-app recordings that must share yyork's existing browser, use the yyoreel
wrapper:

```bash
pnpm browser:yyoreel -- record
```

That wrapper discovers the active d3k/shared-browser endpoint and injects it as
`YYOREEL_CDP_ENDPOINT`. Yyoreel creates and closes its own page target while
leaving the shared Chrome process running.

Refresh the vendored fork from the sibling `../yyoreel` checkout with:

```bash
pnpm vendor:yyoreel
```
