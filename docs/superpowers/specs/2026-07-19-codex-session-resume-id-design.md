# Codex Session Resume ID Recovery Design

## Goal

Keep each yyork Codex session bound to its original resumable Codex transcript across repeated `SessionStart` hooks and machine reboots, then repair the currently corrupted yyork-project session rows without changing their yyork IDs or workspaces.

## Design

`metadata.agentSessionId` is the canonical native conversation identifier. The first non-empty `SessionStart.session_id` wins. Later `SessionStart` events may refresh activity state but must not replace an existing canonical identifier.

The immediate repair is data-only: identify corrupted Codex rows whose stored IDs do not resolve to a rollout filename, map them to their original rollout using the yyork row creation time, project path, and Codex history, back up `~/.yyork/state.db`, and replace only `metadata.agentSessionId`. Any failed post-reboot Zellij runtime is force-deleted under the same yyork session name so the normal revive path recreates it from the repaired transcript.

## Error handling

- Empty hook session IDs remain ignored.
- Existing canonical IDs remain untouched.
- Rows without an unambiguous canonical transcript are reported and not mutated.
- Session rows, workspaces, branches, and project metadata are never deleted during repair.

## Verification

- A regression test sends two different `SessionStart` IDs and proves the first remains stored.
- Focused CLI, session, server, and durability-provider tests pass.
- Every repaired yyork-project Codex row points to an existing rollout filename.
- The orchestrator terminal resumes its original conversation at `https://yyork.localhost`.

