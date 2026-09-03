# Canvas Files Search Design

**Status:** Approved for implementation  
**Scope:** Canvas Files only

## Goal

Add fast keyboard search to the Canvas Files tree by enabling the search implementation already shipped by `@pierre/trees`. The installed and locked version is `1.0.0-beta.4`; `WorkspaceFileTree` in `internal/web/src/features/home/components/organisms/canvas-panel.tsx` already uses its React `useFileTree` model and currently sets `search: false`.

## Architecture

Keep the existing `WorkspaceFileTree` and `PierreFileTree` integration. In the existing `useFileTree` options:

- change `search` from `false` to `true`;
- set `fileTreeSearchMode: 'hide-non-matches'` explicitly.

Pierre continues to own the model, search state, filtering, search input, focus management, and keyboard event handling inside its tree surface. yyork continues to own only the path list, current file-selection bridge, and file preview. No new yyork component or state boundary is introduced.

## Behavior

When keyboard focus is within the Workspace files tree:

1. Typing an unmodified alphanumeric key opens Pierre's native search input and seeds the query with that key. Letter and number keys include the Unicode categories accepted by Pierre; modified keys using Control, Command, or Option/Alt do not open search.
2. Pierre performs a case-insensitive substring match against canonical file and directory paths. With `hide-non-matches`, matching paths and the ancestor directories needed to locate them remain visible; unrelated paths are hidden.
3. `ArrowDown` and `ArrowUp` move focus to the next or previous matching path. Match navigation does not change the selected file or preview.
4. `Enter` selects the focused match and closes search. For a file match, Pierre emits its normal selection change, the existing `onSelectionChange` handler derives the selected file path, updates local selection, calls `onSelectedFilePathChange`, and the existing file preview loads that file.
5. `Escape` closes search without changing selection, so the existing preview remains unchanged.

The query exists only in memory on the currently mounted Pierre model. Closing search clears it through Pierre's existing behavior; yyork does not store or restore it across Canvas tabs, remounts, worker sessions, or reloads.

## Data Flow

```text
focused Pierre tree -> alphanumeric key -> Pierre search state/input
                    -> filtered Pierre projection and focused match

Enter -> Pierre selection -> existing onSelectionChange
      -> selectedFilePath -> onSelectedFilePathChange -> file preview query

Escape -> Pierre closes search -> existing selection and preview stay unchanged
```

Search changes do not call yyork APIs. Only the existing file-selection path can trigger a file-content request.

## Edge Cases

- An empty or whitespace-only query shows the ordinary tree projection.
- Pierre normalizes search case and path separators; yyork does not add a second normalization layer.
- In `1.0.0-beta.4`, a non-empty query with no matches leaves the ordinary projection visible rather than introducing a yyork-owned empty state. This design preserves that package behavior.
- Search may focus a directory match. Pressing `Enter` selects it in Pierre and closes search, but the existing yyork selection bridge ignores directory paths ending in `/`; the current file preview therefore remains unchanged.
- The first and last matches are navigation boundaries: Pierre does not wrap past them.
- Search availability follows the existing tree lifecycle. Loading, error, empty-workspace, and collapsed-tree states do not gain a separate search control.

## Accessibility and Keyboard Ownership

Pierre owns the interactive search contract. Its native search input uses the package-provided `Search…` placeholder, focus treatment, `aria-controls` relationship to the tree, and `aria-activedescendant` relationship to the focused result. yyork must not intercept, duplicate, or remap the alphanumeric, arrow, Enter, or Escape behavior.

The existing tree keeps its `aria-label="Workspace files"`. Existing pointer selection, tree navigation outside an open search session, focus styling, and file-preview semantics remain unchanged.

## Test Strategy

Add focused browser/component coverage in `internal/web/src/features/home/components/organisms/canvas-panel.browser.spec.tsx` using the real `@pierre/trees` React implementation, not a yyork search mock. Use a small path fixture with at least two file matches and one non-match.

Cover these observable contracts:

- focus the tree, type an alphanumeric key, assert the native `Search…` input opens with the seeded query, matching files remain visible, and the non-match is hidden;
- use `ArrowDown`/`ArrowUp` to move between matches, press `Enter`, and assert search closes, `onSelectedFilePathChange` receives the focused file, and the selected-file preview changes;
- establish a selected file, open a different search, press `Escape`, and assert search closes without another selection callback or preview change.

After the focused automated coverage passes, verify the same three flows in the real app at `https://yyork.localhost` through the existing d3k session. Reuse that session; do not start a second dev stack. Check d3k status and browser/server errors as part of the verification evidence.

## Non-goals

- No yyork-owned search input, button, command, hook, or keyboard handler.
- No query persistence, URL state, local storage, recent searches, or cross-session search state.
- No styling redesign or Pierre search-style overrides.
- No fuzzy search, content search, server-side search, result counts, highlighting changes, custom no-results UI, or match wrapping.
- No search enablement for the Review changed-files tree.
- No dependency changes or package upgrade.
