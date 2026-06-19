# API Contracts

The Go server owns the workspace response shape in `internal/session`.

Run this after changing exported workspace/session JSON fields:

```sh
pnpm api:generate
```

That command regenerates the web Zod/TypeScript contract at
`web/src/features/home/domain/session-workspace-contract.generated.ts`.
