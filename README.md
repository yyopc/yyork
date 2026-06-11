<p align="center">
  <img src="web/public/favicon.svg" alt="yyork" width="84" />
</p>
<h1 align="center">yyork</h1>
<p align="center">Run AI coding agents in parallel, each inside its own durable workspace.</p>

<p align="center">
  <img src="yyork-light.png#gh-light-mode-only" alt="yyork dashboard showing parallel AI coding agents in isolated workspaces" width="100%" />
  <img src="yyork-dark.png#gh-dark-mode-only" alt="yyork dashboard showing parallel AI coding agents in isolated workspaces" width="100%" />
</p>

> [!WARNING]
> yyork is still being built. Expect rough edges, breaking changes, and unfinished workflows. There is no in-app review or merge flow yet, and cleanup commands can remove session worktrees and branches. Push or merge anything important before stopping a session.

## What it does

yyork is a local dashboard for supervising multiple AI coding agents at once.

- Each session runs in its own `git worktree` and branch.
- [Zellij](https://zellij.dev) keeps agent sessions durable.
- The dashboard shows live session state from your machine.
- Claude Code and Codex run as their normal CLIs; yyork wraps the workspace around them.

## Install

```bash
nix profile add github:yyopc/yyork
# or
npm i -g @yyopc/yyork
# or
go install github.com/yyopc/yyork@latest
```

Requirements: Go 1.25+, Node.js 22+ / pnpm for dashboard development, Zellij,
git, and an agent CLI on your `PATH`.

## Basic flow

```bash
yyork ~/Projects/my-app

# optional/manual worker spawn
yyork spawn --type worker --prompt "add a health-check endpoint"
yyork session list
yyork stop <sessionId>
```

`yyork ~/Projects/my-app` starts the dashboard and ensures the project has a
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

MIT © [yyopc](https://github.com/yyopc)
