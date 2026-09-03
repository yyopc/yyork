# Changelog

## Unreleased

- Scope `yyork session list` to the current project in both human and JSON output. Use `--all` for global discovery.
- Block cross-project `yyork stop <sessionID>` and `yyork send --session <sessionID>` unless `--project <projectID>` exactly confirms the stored owner.
- Accept project IDs, not filesystem paths, for CLI `--project` filters and overrides.
