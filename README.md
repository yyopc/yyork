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
> yyork is still being built. Expect rough edges, breaking changes, and unfinished workflows. There is no merge flow yet, and cleanup commands can remove session worktrees and branches. Push or merge anything important before stopping a session.

## What it does

yyork is a local dashboard for supervising multiple AI coding agents at once.

- Each session runs in its own `git worktree` and branch.
- [Zellij](https://zellij.dev) keeps agent sessions durable, invisibly — a session looks like a bare terminal running the agent CLI.
- The dashboard shows live session state from your machine.
- A per-session canvas adds the workspace file tree, a review diff of the session's changes, and an embedded browser preview of your dev server.
- Annotations dropped on the previewed page go straight back to the session's agent.
- Claude Code and Codex run as their normal CLIs; yyork wraps the workspace around them.

## Install

```bash
npm i -g @yyopc/yyork
```

The npm package ships the built dashboard and compiles the local `yyork` binary
during install. It also installs the bundled `yyork-cli` agent skill into
`~/.agents/skills/yyork-cli`.

Requirements: Go 1.25+, Node.js 24+, Zellij, git, and an agent CLI on your
`PATH`.

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

## Release

```bash
nix develop
pnpm release:check
pnpm release:publish
```

`release:check` builds the dashboard, packs the npm tarball, installs it into an
isolated temp prefix, and runs the installed `yyork` binary. `release:publish`
publishes `@yyopc/yyork` publicly from `main`; run `npm login` first.

MIT © [yyopc](https://github.com/yyopc)
