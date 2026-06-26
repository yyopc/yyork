 ---
name: yyork-cli
description: Operate yyork's CLI correctly for local agent orchestration. Use when an agent needs to start or reason about the yyork dashboard/server, spawn yyork worker or orchestrator sessions, list sessions, send follow-up messages, stop sessions, work with yyork.localhost/portless dev startup, or avoid planned-but-unimplemented yyork commands.
---

# yyork CLI

## Overview

Use this skill to choose yyork commands from the actual CLI surface, not from guessed orchestration terminology. If a command or flag is unclear, run `yyork <command> --help` first; in the yyork source checkout, use `go run . <command> --help` when testing the local CLI implementation.

## Command Surface

Implemented public operational verbs:

- `yyork [projectPath] [--addr <host:port>] [--open=false]`: start the local dashboard/API server. `projectPath` must resolve inside a git repo. There is no public `start` or `dashboard` verb.
- `yyork spawn [--json] [--flags]`: spawn a session. Defaults to `--type worker` and `--agent claude-code`.
- `yyork session list [--json] [--project <absolute-project-path>]`: list known sessions.
- `yyork send [--json] --session <id> [--project <absolute-project-path>] "<message>"`: send a follow-up message to a session.
- `yyork stop [--json] <sessionID>`: terminate a session, remove its worktree when applicable, and delete its store row.

Hidden/internal or dev-only surfaces:

- `yyork dev` is driven by `pnpm dev` in the yyork repo. Prefer `pnpm dev`; it runs `portless run`, which launches `go run . dev`.
- `yyork hooks ...` is the machine hook entrypoint for Codex/Claude Code lifecycle hooks. Do not call it manually except for explicit hook cleanup work.

Commands shown under `PLANNED` in help, such as `status`, `open`, `batch-spawn`, `plugin`, `review`, or `verify`, are not implemented. Do not use a planned command until help shows it under `COMMANDS`.

## Starting yyork

For normal use:

```bash
yyork /absolute/path/to/project
```

Use `--open=false` when running headless or when a browser launch would be noisy:

```bash
yyork /absolute/path/to/project --open=false
```

In the yyork source checkout, start the dev stack with:

```bash
pnpm dev
```

Under portless, use `https://yyork.localhost` as the stable local URL after the ready banner appears. The hidden `dev` command gets web host/port from `PORTLESS_URL`, `PORT`, `HOST`, `VITE_HOST`, and `VITE_PORT`; backend port is ephemeral unless `YYORK_BACKEND_PORT` is set.

## Spawning Sessions

Orchestrators coordinate; workers implement scoped tasks.

Spawn a worker:

```bash
yyork spawn --json --type worker --prompt "Implement the focused task, run the relevant checks, and summarize the result."
```

Rules:

- Worker sessions require a non-empty `--prompt`.
- `--type` accepts only `worker` or `orchestrator`.
- Worker workspace mode comes from the project's topbar setting: `work locally` or `new worktree`. Public `yyork spawn` does not accept a workspace override.
- Orchestrator sessions always run in the main project worktree.
- Workers spawned from an orchestrator inherit `YYORK_PROJECT_PATH`; do not override it unless intentionally targeting a different absolute project path.
- Project IDs are absolute project paths, not slugs. Use the path shown by `yyork session list` or `$YYORK_PROJECT_PATH` for `--project`.
- Use `--agent codex` only when the Codex plugin is the intended runtime; otherwise the default is `claude-code`.
- Use `--permissions <mode>` only when the target agent plugin supports the mode you are passing. Check `yyork spawn --help` and local plugin code if unsure.
- Use `--json` whenever you need to parse yyork output. Human output is for display only.

For multi-line prompts, build a shell variable to avoid quoting mistakes:

```bash
prompt=$(cat <<'EOF'
Implement the scoped change described here.

Include:
- exact files to inspect
- constraints
- checks to run
- expected final summary
EOF
)

yyork spawn --json --type worker --prompt "$prompt"
```

## Coordinating Sessions

List sessions before sending or stopping:

```bash
yyork session list --json
yyork session list --json --project "$YYORK_PROJECT_PATH"
```

The JSON shape is `{"sessions":[...],"count":N}`. Use each session's `id`, `projectPath`, `kind`, `agent`, and `state` fields for follow-up commands.

Send a follow-up:

```bash
yyork send --json --session <id> "Please run the missing test and report the output."
```

Add `--project <absolute-project-path>` when IDs may be ambiguous across projects:

```bash
yyork send --json --project "$YYORK_PROJECT_PATH" --session <id> "Continue with the narrower fix."
```

Stop only when intentionally ending work:

```bash
yyork stop --json <sessionID>
```

`stop` is idempotent for missing IDs, but for real sessions it kills the Zellij session, removes the session worktree when applicable, and deletes the store row. Make sure useful changes are pushed, merged, or otherwise preserved before stopping a worker.

## Orchestrator Habits

- Inspect repository and session context before spawning workers.
- Spawn small, independently checkable worker tasks rather than broad vague goals.
- Put enough context in each prompt: task, relevant paths, constraints, verification command, and expected final answer.
- Avoid implementing directly from the orchestrator unless explicitly asked; use workers for code changes.
- Prefer CLI commands over direct edits to `~/.yyork/state.db`. Inspect the database only for debugging store-level issues.
- If `yyork` is unavailable, ask the user before installing missing tools. In the yyork source checkout, use `go run .` for local CLI testing.
