<p align="center">
  <img src="internal/web/public/favicon.svg" alt="yyork" width="84" />
</p>
<h1 align="center">yyork</h1>
<p align="center">Run AI coding agents in parallel, each inside its own durable workspace.</p>

<p align="center">
  <img src="yyork-light.png#gh-light-mode-only" alt="yyork app showing parallel AI coding agents in isolated workspaces" width="100%" />
  <img src="yyork-dark.png#gh-dark-mode-only" alt="yyork app showing parallel AI coding agents in isolated workspaces" width="100%" />
</p>

> [!WARNING]
> yyork is still being built. Expect rough edges, breaking changes, and unfinished workflows. There is no merge flow yet, and cleanup commands can remove session worktrees and branches. Push or merge anything important before stopping a session.

## What it does

yyork is a local app for supervising multiple AI coding agents at once.

- Each session runs in its own `git worktree` and branch.
- [Zellij](https://zellij.dev) keeps agent sessions durable, invisibly — a session looks like a bare terminal running the agent CLI.
- The app shows live session state from your machine.
- A per-session canvas adds the workspace file tree, a review diff of the session's changes, and an embedded browser preview of your dev server.
- Annotations dropped on the previewed page go straight back to the session's agent.
- Claude Code and Codex run as their normal CLIs; yyork wraps the workspace around them.

## Install

```bash
npm i -g @yyopc/yyork
```

## Basic flow

```bash
yyork ~/Projects/my-app

# optional/manual worker spawn
yyork spawn --type worker --prompt "add a health-check endpoint"
yyork session list
yyork stop <sessionId>
```

`yyork ~/Projects/my-app` starts the app and ensures the project has a
yyork-owned orchestrator in its own worktree and Zellij session. That
orchestrator can delegate workers with `yyork spawn --type worker --prompt ...`;
nested spawns keep targeting the original project.
Session state stays in `~/.yyork/state.db`, with no external orchestrator
runtime required.

## Development

```bash
nix develop
# or, with direnv:
direnv allow

pnpm install
pnpm dev
pnpm test
```

The Nix dev shell supplies the repo-local Go, Node.js, pnpm, and helper tooling.
Inside that shell, `yyork` is a development shortcut for `pnpm dev`.

## Release

```bash
nix develop
pnpm release:check
```

`release:check` builds the app, stages the native package for the current
OS/CPU, packs the thin `@yyopc/yyork` wrapper, installs both into an isolated
temp prefix with `go` intentionally unavailable, and runs the installed
`yyork` binary. The native package step fetches and caches the pinned Zellij
binary under `third_party/zellij/<platform>/` before copying it into the
tarball.

Distribution builds run in GitHub Actions. The release workflow uses
GoReleaser to build stripped platform-specific `yyork` archives and publish
the GitHub release assets. A dependent npm packaging job wraps those exact
archives into native npm packages with bundled Zellij, smoke-tests install with
`go` unavailable, uploads the npm tarballs, and publishes the native packages
before the `@yyopc/yyork` wrapper.

YYOIT © [yyopc](https://github.com/yyopc)
