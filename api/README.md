# API Contracts

The Go server owns the workspace response shape in `internal/session`.

Run this after changing exported workspace/session JSON fields:

```sh
pnpm api:generate
```

That command is a two-step pipeline:

1. `pnpm api:generate:openapi` writes `api/openapi.generated.json` from the Go
   structs.
2. `pnpm api:generate:zod` runs `openapi-zod-client` with
   `api/session-workspace-contract.hbs` to regenerate
   `internal/web/src/features/home/domain/session-workspace-contract.generated.ts`.

If `openapi-zod-client` is not installed yet, install it as a dev dependency
before running the full pipeline:

```sh
pnpm add -D openapi-zod-client
```
