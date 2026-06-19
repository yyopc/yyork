#!/usr/bin/env node
// Thin launcher for the published @yyopc/yyork package: exec the yyork binary
// that the postinstall step (bin/install-yyork.mjs) compiled into dist/.
// Everything else — the verbs, help, version, and the `dev` stack — lives in
// the Go binary. From a source checkout, run the CLI with `go run .` (exposed
// as the `yyork` pnpm script).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binary = resolve(
  rootDir,
  'dist',
  process.platform === 'win32' ? 'yyork.exe' : 'yyork'
);

if (!existsSync(binary)) {
  console.error(
    'Unable to find the yyork binary. Reinstall @yyopc/yyork with npm scripts ' +
      'enabled and Go 1.25+ available on PATH.'
  );
  process.exit(1);
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exit(result.status ?? 1);
}
