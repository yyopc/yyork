set dotenv-load := false

dev:
    pnpm dev

web-dev:
    pnpm web:dev

web-build:
    pnpm web:build

backend-test:
    go test ./...

build:
    pnpm build

test:
    pnpm test

lint:
    pnpm lint
