# Cursor Agent Plugin Design

## Goal

Add Cursor's `agent` CLI as a third yyork agent plugin alongside `codex` and
`claude-code`, with full model choice (every model the harness exposes, not a
pinned one), and with the same session-state fidelity the existing agents have:
title, recap, working/triage/prompt states, resume, and fork.

## Approved decisions

- **Model:** user-selectable across every model the harness offers. Not pinned
  to `kimi-k3-high`.
- **Approval triage:** resolved in this pass, not deferred. yyork drives the
  approval prompt so it can observe it.
- **Turn end:** split — `afterAgentResponse` sets the recap, `stop` sets state
  `prompt`.
- **Env scrub:** prerequisite inside this spec; fixes all agents at once.

## Verified facts (do not re-derive)

Captured from a real `kimi-k3-high` run plus https://cursor.com/docs/hooks:

- Hook payloads use the **same snake_case field names yyork already parses**:
  `hook_event_name`, `session_id`, `tool_name`, `tool_input`, `prompt`,
  `transcript_path`. `hookPayload` decodes them unchanged.
- Project hook config: `<project-root>/.cursor/hooks.json`, schema
  `{"version":1,"hooks":{"<event>":[{"command","type","timeout","failClosed","matcher","loop_limit"}]}}`.
  Hooks run from the project root. `failClosed` defaults false. Exit code 2
  blocks an action; exit 0 with `{}` is "no opinion".
- Cursor also reads Claude's config files (`~/.claude/settings.json`,
  `<ws>/.claude/settings.json`, `<ws>/.claude/settings.local.json`) and merges
  them with its own. This is why the de-dup guard below is mandatory.
- `agent -p` **does** fire hooks (the payload capture was taken under `-p`).
- CLI surface: `--model`, `--list-models`, `--resume [chatId]`, `--continue`,
  `-p --output-format text|json`, `--force`/`--yolo`, `--auto-review`,
  `--sandbox`, `--mode plan|ask`, `--workspace <path>`, `--trust`.

## Prerequisites (land before the plugin)

### P1 — Scrub `YYORK_SESSION_ID` from metadata subprocesses

`runMetadataCommand` (`internal/cli/hooks.go:481-498`) sets neither
`command.Env` nor `command.Dir`, so every title/recap subprocess inherits the
workspace cwd **and** `YYORK_SESSION_ID`. Since `agent -p` fires hooks, a
nested recap call re-enters yyork's own hooks, resolves to the *parent* session
row, overwrites its state, and spawns another recap subprocess.

Fix once, agent-agnostically:

```go
command.Env = append(os.Environ(), "YYORK_SESSION_ID=")
```

`runAgentHook` already no-ops on an empty session id (`hooks.go:172-176`) — the
guard exists and is simply never armed. Codex is currently protected only
incidentally (`--cd $TMPDIR` + `--ignore-user-config`, `codex.go:100-120`);
Claude relies on `--safe-mode`/`--no-session-persistence` with no cwd
relocation, which is an unverified assumption. While implementing, check
whether a nested `claude -p` inside a hooked workspace fires hooks today, and
record the answer.

### P2 — Wire `agent.Config` end to end

`agent.ConfigSpec` / `ConfigField` exist (`agent.go:51-76`) and every config
struct carries a `Config` field, but **nothing populates it**: `LaunchConfig`
at `engine.go:370-377` (and 526, 684) omits `Config:` entirely, and
`config.Load()` is never called on the agent path. Model selection depends on
this, so wire `~/.yyork/config.yaml` → `agent.Config` through the engine into
Launch/Title/Recap/Restore/Fork configs. Codex and Claude keep returning an
empty `ConfigSpec`; behavior is unchanged for them.

## Design

### Plugin package

`internal/plugin/agent/cursor/` — `cursor.go` + `hooks.go`, mirroring the codex
package. Implements `plugin.Plugin`, `agent.Agent`, `agent.Forker`, and the
`hookManager` trio (`GetAgentHooks`, `UninstallHooks`, `AreHooksInstalled`).
Plugin ID: `cursor`.

### Model selection (first real `GetConfigSpec`)

`GetConfigSpec` returns one field:

```go
ConfigField{
  Key: "model", Type: ConfigFieldEnum,
  Description: "Cursor model id (see `agent --list-models`)",
  Default: "auto",
  Enum: <parsed from `agent --list-models`, cached per process>,
}
```

`--list-models` prints `id - Display Name` lines; the id is everything before
the first ` - `. The active model's display half is suffixed `(current)`, which
does not affect id parsing. Roughly 190 ids ship today, shaped
`<family>[-thinking]-<effort>[-fast]` (e.g. `claude-opus-5-thinking-xhigh-fast`,
`kimi-k3-high`, `gemini-3.6-flash-low`); `auto` is the documented default and is
equivalent to omitting the flag. Discovery keeps the list current without yyork
shipping a hardcoded table.

**The `Enum` is advisory, never an allowlist.** Parameterized ids are valid but
are never enumerated — the CLI's own help advertises
`--model 'claude-opus-4-8[context=1m,effort=high,fast=false]'`. Validation must
therefore accept any non-empty string and pass it through verbatim; `Enum` only
drives suggestions. If `--list-models` fails (offline, not logged in), return an
empty `Enum` and still accept arbitrary values rather than blocking spawn.

With ~190 entries a flat picker is unusable, so any future dashboard UI should
group by family and expose effort/speed as secondary axes. That is out of scope
here — v1 is `config.yaml` only.

Every command builder reads `cfg.Config["model"]` and emits `--model <id>` when
non-empty, omitting the flag entirely for `auto`. Parameterized ids
(`claude-opus-4-8[context=1m,effort=high]`) must pass through unmodified.

### Commands

| Purpose | argv |
|---|---|
| Launch | `agent [--model M] [perm flags] --trust -- "<prompt>"` → `PromptDeliveryInCommand` |
| Restore | `agent --resume <agentSessionId> [--model M] [perm flags]` |
| Fork | `agent --resume <id> --workspace <worktree>` (verify; else fall back to fresh launch with context prompt) |
| Title / Recap | `agent -p --output-format text [--model M] --workspace $TMPDIR "<prompt>"` |

`agentSessionId` comes from `sessionStart.session_id`. Title/recap relocate to
`$TMPDIR` so project hooks aren't discovered; P1's env scrub is the real
guard, since `~/.cursor/hooks.json` still loads and Cursor has no
`--ignore-user-config` equivalent.

### System prompt injection (no CLI flag exists)

Cursor's CLI has **no** `--system-prompt`, `--append-system-prompt`, or
instructions-file option — verified against `agent --help`. This is not an
orchestrator-only problem: `engine.go:338-353` renders a system prompt for
*every* session, `DefaultWorkerSystemPrompt` for workers and
`DefaultOrchestratorSystemPrompt` for orchestrators, and passes it as
`LaunchConfig.SystemPrompt` / `SystemPromptFile`. Codex consumes it via
`-c model_instructions_file=`, Claude via `--append-system-prompt`; Cursor has
no equivalent.

Inject it through the **`sessionStart` hook's `additional_context` return**
instead:

```json
{ "additional_context": "<rendered worker.md or orchestrator.md>" }
```

`sessionStart` is one of the events that supports `additional_context` (per the
docs, and confirmed by `HOOK_STEPS_SUPPORTING_ADDITIONAL_CONTEXT` in the CLI
bundle, which lists `sessionStart`, `beforeSubmitPrompt`, `preToolUse`,
`postToolUse`, `postToolUseFailure`). It beats the alternatives on one clear
axis: it does not write into the user's repo the way `.cursor/rules/` or
`AGENTS.md` would.

⚠️ **Correction — `--resume` does not emit `sessionStart`** (verified). An
earlier draft claimed this mechanism "re-applies on every resume"; that is
false. Whether it matters depends on an unverified question:

**Does `additional_context` persist into the conversation transcript?**

- **If yes** — inject at `sessionStart` only. A resumed session restores the
  context along with the transcript, exactly as Codex and Claude restore their
  launch-time system prompt (neither re-passes it on restore either: see
  `codex.go` `GetRestoreCommand`, which passes only the session id).
- **If no** — `sessionStart` injection is insufficient and resumed Cursor
  sessions would silently lose their yyork instructions (worktree conventions,
  fork handoff, dev URLs). Fall back to injecting at **`beforeSubmitPrompt`**,
  which fires on every user message and also supports `additional_context`.
  Stateless and always correct, at the cost of re-sending the prompt each turn —
  acceptable within the 10,000-char carrier limit.

Verify this before implementing the plugin: start a session, confirm the
injected context is in effect, resume it with `--resume`, and check whether the
agent still honors instructions that appear only in the injected block.

Consequence for the driver either way: the injecting branch must return a body
rather than the bare `{}`, must source the rendered prompt (persisted into
session metadata at spawn, or re-rendered from the session row), and must
truncate to the carrier limit rather than let it be silently dropped
(`additional_context exceeded max size; dropping carrier` appears in the
bundle).

Consequence for the driver: the `session-start` branch must be able to return a
body rather than the bare `{}`. It needs the rendered prompt available at hook
time — either persisted into session metadata at spawn, or re-rendered from the
session row's project/workspace fields. There is a size ceiling
(`additional_context exceeded max size; dropping carrier` appears in the bundle,
with a 10,000-char limit), so the driver must truncate and log rather than let
the carrier be silently dropped.

### Permission modes and approval triage

Cursor inverts the model: `preToolUse` *returns* the verdict rather than
announcing a prompt. To observe approvals, yyork must cause them — which is
consistent with yyork already choosing the permission mode at launch.

| yyork mode | Launch flag | `preToolUse` hook returns |
|---|---|---|
| `default` | none | `{"permission":"ask"}` for policy-matched tools |
| `accept-edits` | none | `ask` for `Shell`/`Mcp`; silent for edits |
| `auto` | `--auto-review` | `{}` (server classifier decides) |
| `bypass-permissions` | `--force` | `{}` |

This requires `writeHookResponse` to gain the ability to emit a verdict body
instead of always writing `{}`. Keep exit code 0 in all cases; never exit 2.

Approval state machine:

1. `preToolUse` returns `ask` → state `triage`, `triageReason` from the tool
   summary (reuse `summarizeToolCall`).
2. User allows → `postToolUse` → state `working`.
3. User denies → `postToolUseFailure` (`failure_type: "permission_denied"`) →
   state `working`. **`postToolUseFailure` must be registered** for this.

### Hook event mapping

| yyork event | Cursor event | Purpose |
|---|---|---|
| `session-start` | `sessionStart` | `agentSessionId` from `session_id` |
| `user-prompt-submit` | `beforeSubmitPrompt` | title from `prompt` |
| `pre-tool-use` | `preToolUse` | working state, tool bulletin, approval verdict. **Does not fire for AskQuestion** — see the triage section. |
| `post-tool-use` | `postToolUse` | bulletin, back to working |
| `post-tool-use` | `postToolUseFailure` | back to working after denial/error |
| *(new)* `assistant-response` | `afterAgentResponse` | recap from `text` |
| `stop` | `stop` | state `prompt`, `lastAssistantMessageAt` |

Do **not** register `beforeShellExecution` — it fires in addition to
`preToolUse` for shell tools and would double-count bulletins.

`afterAgentResponse` needs a new branch in `hookFields` that sets only the
recap (reading `text`), leaving the state transition to `stop`. Collapsing the
two would strand aborted/errored turns in `working`, since those produce no
response.

### Question triage — DISPROVEN, contract pending

**The original design here was falsified by verification. Do not implement it.**

Observed on Cursor Agent `2026.07.23-e383d2b`, interactive session
`d0609d42-5a43-48c7-b75e-00c5c32cf92f` (worker `h7snkp`):

- The tool appears in the transcript as **`AskQuestion`** (PascalCase), not
  `askQuestion`.
- Its input is
  `{"title","questions":[{"id","prompt","options":[{"id","label"}],"allow_multiple"}]}` —
  **there is no `run_async` field** in the schema or the observed input.
- **Neither `preToolUse` nor `postToolUse` fired for it.** AskQuestion does not
  traverse the tool-execution pipeline that runs hooks; it most likely routes
  through Cursor's interaction channel (`askQuestionInteractionQuery` /
  `ask_question_interaction_response` appear in the CLI bundle).
- `afterAgentResponse` and `stop` fired only *after* the user answered — so
  while the question is pending, the session is mid-turn and, to yyork,
  indistinguishable from ordinary work.

All three earlier assumptions are therefore void: the `tool_name` match, the
`run_async` gate, and the `questions[0].prompt` extraction. The error was mine:
I inferred hook dispatch from the CLI bundle's hook-input builder, but that
switch maps tool calls for display/telemetry, not for hook delivery. Static
reading of a minified bundle was not sufficient evidence.

**What survives:** approval triage is unaffected — `preToolUse` *does* fire for
ordinary tools (`tool_name: "Shell"`, observed directly), so the permission
verdict mechanism above still stands.

**Also unaffected:** the existing Codex/Claude triage detection
(`request_user_input` / `AskUserQuestion`) is a separate code path and needs no
change.

**RESOLVED — there is no hook-driven question triage on Cursor.** All 18
documented hook events were registered and the scenario re-run. Between the
question being rendered and the user answering it, **zero hooks fired**. Only
after the answer did `afterAgentThought` (emitted twice), `afterAgentResponse`,
and `stop` fire.

The negative result is trustworthy because the rig was independently validated
in the same session: an ordinary interactive Shell call emitted `preToolUse` and
`postToolUse` with `tool_name: "Shell"` (plus `beforeShellExecution` /
`afterShellExecution`). So hooks work in the interactive path; `AskQuestion`
is genuinely outside the hook surface.

**Accepted design:** Cursor sessions do not enter `triage` when the agent asks a
question. They remain in `working` until answered. This is a documented
limitation of Cursor's hook surface, not a yyork defect. Heuristic substitutes —
timing inference, polling, transcript scraping — are rejected; a wrong state is
worse than a coarse one.

**Do not register `afterAgentThought`.** It fires twice per turn, so it would
double-count anything derived from it.

**Operational note (out of scope here):** because nothing fires while a question
is pending, a Cursor worker blocked on a question is indistinguishable from a
long-running turn, and could stall unnoticed in an orchestrated fleet. The
correct mitigation is a general staleness watchdog over `lastActivityAt` at the
yyork level — applicable to every agent, and explicitly *not* a per-agent
inference of triage state. Track separately.

### Hook ownership de-dup (mandatory)

Because Cursor merges Claude's config files, a Claude worker's
`.claude/settings.local.json` fires inside Cursor sessions in `local` workspace
mode — double-firing recap generation (two LLM calls) and racing two
`MergeMetadata` writes. Guard in `runAgentHook`, right after the store opens:

```go
// Hook configs merge from multiple sources (Cursor reads Claude's files too),
// so another agent's hooks can fire inside this session. The store owns truth.
if row, err := repo.Get(ctx, aoSessionID); err == nil &&
    row.AgentPlugin != "" && row.AgentPlugin != agentName {
    writeHookResponse(stdout)
    return 0
}
```

Fail open on empty `AgentPlugin` so pre-existing sessions keep working. This
also cleans up stale hooks left in a reused worktree, and stays correct when a
fourth agent is added.

### Naming disambiguation

Three unrelated meanings of "prompt" collide here; name them apart in code and
comments or the wrong one gets wired:

- yyork state `prompt` (`hookStatePrompt`) — turn complete, awaiting the next
  user message, usually sent by the orchestrator.
- `beforeSubmitPrompt.prompt` — the user's submitted message (title source).
- `askQuestion.questions[].prompt` — the question text (triage reason source).

### Registration sites (full inventory)

**Go:**
- `internal/app/app.go:27` (`defaultAgentPlugin`), `:255` (plugin registry)
- `internal/cli/commands.go:33` (`defaultAgentPlugin`), `:156` (plugin registry)
- `internal/cli/hooks.go:54` (usage string), `65/67` + `70` (`runHooks` switch
  and its error), `89`, `143-145` (`hooksManager`), `153/157`
  (`runCodexHook`/`runClaudeHook` siblings), `497-499` and `508-510`
  (title/recap command switches)
- `internal/session/session.go:43-52` — `NormalizeAgentPlugin`. **Silently**
  rejects unknown ids, so a miss here fails quietly rather than loudly.
- `internal/session/engine.go:185` (`defaultAgent`)
- `internal/server/projects.go:103` and `:108` — two literal
  `"must be claude-code or codex"` validations
- `internal/cli/doctor.go:127,134` — add a `cursor` probe entry

**Frontend** — `src/features/home/domain/agent-harness.ts:1` is canonical:

```ts
export type AgentHarnessId = 'claude-code' | 'codex';
```

Adding `'cursor'` to that union turns `pnpm lint:ts` into an exhaustive finder
for the rest; do it first and let the compiler drive. Known consumers:
`settings/components/molecules/settings-agent-select.tsx` (`:17`/`:22`
`iconPath`, `:44` literal `value === 'claude-code' || value === 'codex'`),
`settings/pages/settings.tsx`,
`home/components/molecules/project-setup-agents-card.tsx`,
`home/components/molecules/project-setup-harness-picker-demo.tsx`,
`home/data/agent-harness-preferences.ts`,
`home/data/first-run-project-setup-draft.ts`,
`home/domain/kanban-card-model.ts`,
`home/components/molecules/kanban-card.tsx`,
`home/demo/agent-harness.fixtures.ts`,
`home/demo/session-workspace.fixtures.ts`,
`settings-mock/pages/settings-prototype.tsx`. Design mocks under
`internal/web/mock/` are optional.

### Icon

Existing icons are a single theme-agnostic file per agent —
`internal/web/public/agent-icons/{claude-agent,codex-agent}.svg`, referenced as
`/agent-icons/<id>.svg` via `AgentHarnessOption.iconUrl?: string` (a single
field, no light/dark pair).

Cursor's brand assets ship an explicit pair:
`~/Downloads/cursor-brand-assets/General Logos/Cube/SVG/{CUBE_2D_DARK,CUBE_2D_LIGHT,CUBE_25D}.svg`.

**Open decision:** either pick the one variant that reads acceptably on both
themes and add it as `cursor-agent.svg` (keeps the existing single-field model),
or extend `iconUrl` into a light/dark pair — which changes a shared type and
every consumer, and would ideally be applied to the Claude and Codex icons too
for consistency. Default to the single-file route unless the cube is illegible
on one theme.

## Error handling

- `agent` binary missing → resolver returns `"agent"` so the user sees a clear
  "command not found", matching `ResolveCodexBinary`.
- `--list-models` failure → empty `Enum`, arbitrary model strings accepted.
- Hook JSON parse failure → Cursor fails open (`failClosed:false`); never set
  `failClosed:true` on yyork hooks.
- Missing `agentSessionId` → `GetRestoreCommand` returns `ok=false` and yyork
  falls back to fresh launch, as with Codex.
- Metadata subprocess failure → title/recap silently skipped (existing
  behavior).

## Verification

**Verify-first — close these before writing Go:**

1. ~~Confirm `beforeSubmitPrompt`, `stop`, `afterAgentResponse` fire with the
   assistant message.~~ **DONE** — all three fired; `afterAgentResponse.text`
   was exactly `"Blue selected."`. Mapping confirmed.
2. ~~Confirm `askQuestion` fires `preToolUse`.~~ **DONE — DISPROVEN.** It does
   not fire; the tool is `AskQuestion` and has no `run_async`. See the triage
   section. Replacement contract is the exhaustive event sweep, still open.
3. ~~Confirm `--resume` resumes.~~ **DONE — PASS.** `agent --resume
   <session_id from sessionStart>` restored the transcript and answered a
   follow-up correctly. `agentSessionId` → resume is confirmed.
4. ~~Check whether `agent`'s TUI enables mouse tracking.~~ **DONE — it does
   not.** Cursor's raw TUI enables only `?2004h` (bracketed paste), `?2031h`
   (colour-scheme change notifications), and `?1004h` (focus events) — none of
   `?1000h/?1002h/?1003h/?1006h/?1015h`. Wheel scrolling therefore works in
   Cursor panes and **the Codex-only predicate in `xterm-terminal.tsx` must not
   be widened.** `?1004h` is already replayed by `snapshotLocked`; `?2031h` is
   not, which may cost theme-change fidelity on reattach — minor, track
   separately.

**All four verify-first items are closed. Plugin implementation is unblocked.**

**Then:**

- `go test ./internal/cli ./internal/session ./internal/plugin/...`
- New tests: hook-config install/uninstall/idempotence for `.cursor/hooks.json`;
  ownership de-dup (foreign agent hook no-ops); `askQuestion` → triage incl. the
  `run_async` gate and `questions[0].prompt` extraction; `afterAgentResponse` →
  recap without state change; `stop` → state `prompt`; env-scrub regression
  asserting a metadata subprocess sees no `YYORK_SESSION_ID`.
- Frontend: `pnpm lint:ts`, agent-select spec covering the new option.
- Live: spawn a Cursor worker with a non-default model, confirm the kanban shows
  title → working → triage (ask a question) → working → prompt, then resume it
  after a restart.

## Out of scope

- `subagentStart`/`subagentStop` mapping onto yyork sessions.
- Per-project model settings in the dashboard (config.yaml only for now).
- `preCompact` / context-pressure surfacing.
