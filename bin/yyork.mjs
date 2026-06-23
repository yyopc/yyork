#!/usr/bin/env node
// Thin launcher for the published @yyopc/yyork package: resolve the native
// package for this OS/CPU and exec its prebuilt yyork binary. Everything else
// lives in the Go binary. From a source checkout, run the CLI with `go run .`
// or the repo's `yyork` pnpm script.
import { runYyork } from './native-package.mjs';

let result;
try {
  result = runYyork(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exit(result.status ?? 1);
}
