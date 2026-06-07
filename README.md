<p align="center">
  <img src="web/public/favicon.svg" alt="yyork" width="84" />
</p>
<h1 align="center">yyork</h1>
<p align="center">Run a fleet of AI coding agents in parallel — each in its own durable, isolated workspace.</p>


---

yyork spawns AI coding agents into isolated, durable workspaces and lets you
supervise them from a single dashboard. Point it at a git repo, hand an agent a
prompt, and it goes to work in its own worktree while you start the next one.

- **Parallel** — every session gets its own `git worktree` and branch, so agents never step on each other.
- **Durable** — sessions outlive your browser, a server restart, and even the agent process exiting; [Zellij](https://zellij.dev) keeps the pane alive so you can always read what happened.
- **Local-first** — it all runs on your machine. State is one SQLite file at `~/.yyork/state.db` — no account, no cloud.
- **Bring your own agent** — drives the [Claude Code](https://www.claude.com/product/claude-code) and [Codex](https://github.com/openai/codex) CLIs, unchanged.

## Requirements

- **Go 1.25+** and **Node.js 22+ / pnpm** — to build the server, CLI, and dashboard
- **[Zellij](https://zellij.dev)** — hosts the durable sessions
- **git** — sessions run in per-session worktrees
- **An agent CLI on your `PATH`** — Claude Code (default) or Codex
- **Nix** with flakes — optional, for the dev shell

## Install

yyork ships as a single binary that embeds the dashboard — build it once:

```bash
git clone https://github.com/yyopc/yyork.git && cd yyork
pnpm install
pnpm backend:build      # build + embed the dashboard, compile ./yyork
```

Drop `./yyork` somewhere on your `PATH`, or run it in place.

## Quick start

```bash
# 1. Start the dashboard + API on 127.0.0.1:7331 (opens your browser)
./yyork

# 2. From any git repo, hand an agent a task
cd ~/Projects/my-app
yyork spawn --prompt "add a health-check endpoint"

# 3. Watch it work — click the session in the dashboard, or attach from a shell
zellij attach <sessionId>

# 4. When you're done
yyork session list          # what's running
yyork stop <sessionId>      # kill the session, remove its worktree + branch
```

`spawn` creates a `yyork/<sessionId>` worktree off your repo's default branch,
launches the agent in a fresh Zellij session, and the session appears in the
dashboard within milliseconds (live over SSE — no polling). From the dashboard
you can open a live terminal, rename a session, jump into your IDE, and stop it.

> [!WARNING]
> There's no in-app review or merge yet, and both `yyork stop` and a reboot
> **delete the `yyork/<sessionId>` branch**. Push or merge before you stop — e.g.
> have the agent run `git push -u origin yyork/<sessionId>` or `gh pr create`.

## Agents

yyork drives real agent CLIs; choose one per session with `--agent`:

- **claude-code** *(default)* — [Claude Code](https://www.claude.com/product/claude-code)
- **codex** — [Codex](https://github.com/openai/codex)

Other `spawn` flags:

- `--prompt <text>` — the task for the agent *(required)*
- `--permissions <mode>` — `default` | `accept-edits` | `auto` | `bypass-permissions`
- `--system-prompt-file <path>` — a system prompt to launch the agent with

## FAQ

**How is this different from running Claude Code or Codex directly?**
It's the layer around them. Those CLIs run one agent in your working tree; yyork
runs many at once — each in an isolated worktree on its own branch — keeps them
alive in Zellij, and gives you one dashboard to supervise the fleet. The agents
themselves are unchanged.

**Where does the work end up?**
On the session's `yyork/<sessionId>` branch in your repo. Push or merge it before
stopping the session (see the warning above).

**Does anything leave my machine?**
No. The server binds to `127.0.0.1` and all state is a SQLite file under
`~/.yyork`. Your agent CLI talks to whatever model provider you've configured it
with — yyork doesn't sit in the middle.

## Development

For dashboard work, run the dev stack instead of the binary — Vite serves with
hot reload and proxies `/api` to the Go server:

```bash
nix develop && pnpm install && yyork   # Vite on :3000 + Go API
# or, without Nix:
pnpm dev
```

Run `pnpm test` for the backend, CLI, and frontend tests, and `pnpm run` to list
every script (including the `e2e:live-terminal` suite).

---

MIT © [yyopc](https://github.com/yyopc)
