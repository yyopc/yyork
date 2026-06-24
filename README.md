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
# npm
npm i -g @yyopc/yyork

# Nix flakes
nix profile add github:yyopc/yyork
```

## Basic flow

```bash
yyork ~/Projects/my-app
```

YYOIT © [yyopc](https://github.com/yyopc)
