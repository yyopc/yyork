<p align="center">
  <img src="yyork-lettermark-light.svg#gh-light-mode-only" alt="yyork" width="500" />
  <img src="yyork-lettermark-dark.svg#gh-dark-mode-only" alt="yyork" width="500" />
</p>
<p align="center">Your orchestrator-led agentic dev env.</p>

<p align="center">
  <img src="yyork-light.png#gh-light-mode-only" alt="yyork app with orchestrator terminal and canvas preview" width="100%" />
  <img src="yyork-dark.png#gh-dark-mode-only" alt="yyork app with orchestrator terminal and canvas preview" width="100%" />
</p>

> [!WARNING]
> yyork is still being built. Expect rough edges, breaking changes, and unfinished workflows.

## What it does

**yyork** is a development environment for working through an orchestrator agent in a real repo.

- Add a project and yyork opens an orchestrator session as the main thread.
- Let the orchestrator spin up worker sessions for focused tasks when the work needs parallel attention.
- Inspect each session with its terminal, file tree, diffs, and live preview.
- Supports Claude Code and Codex.

## Install

```zsh
# try without installing
npx yyork ~/Projects/my-app

# install with npm
npm i -g yyork

# Nix flakes
nix profile add github:yyopc/yyork
```

## Basic flow

```zsh
yyork ~/Projects/my-app
```

YYOIT © [yyopc](https://github.com/yyopc)
