import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseEnvFile, resolveDevConfig } from './yyork-config.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const launcherPath = resolve(rootDir, 'scripts/yyork.mjs');
const packageJSON = JSON.parse(readFileSync(resolve(rootDir, 'package.json')));

test('yyork --help prints usage without starting servers', () => {
  const result = runLauncher(['--help']);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /pnpm dev/);
  assertNoServerStart(result);
});

test('yyork --version prints the package version', () => {
  const result = runLauncher(['--version']);

  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    new RegExp(`^${escapeRegExp(packageJSON.version)}\\n?$`)
  );
  assertNoServerStart(result);
});

test('yyork rejects unknown options before starting servers', () => {
  const result = runLauncher(['--bad-option']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown option: --bad-option/);
  assert.match(result.stderr, /yyork --help/);
  assertNoServerStart(result);
});

test('yyork forwards subcommands to the Go CLI', () => {
  const result = runLauncher(['hooks', 'codex', 'stop'], {
    YYORK_SESSION_ID: '',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{}\n');
  assertNoServerStart(result);
});

test('yyork rejects invalid backend port before starting servers', () => {
  const result = runLauncher([], {
    YYORK_BACKEND_PORT: 'bad',
    VITE_PORT: '54551',
  });

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /YYORK_BACKEND_PORT must be an integer port between 1 and 65535/
  );
  assertNoServerStart(result);
});

test('yyork rejects invalid web port before starting servers', () => {
  const result = runLauncher([], {
    YYORK_BACKEND_PORT: '54550',
    VITE_PORT: 'bad',
  });

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /VITE_PORT must be an integer port between 1 and 65535/
  );
  assertNoServerStart(result);
});

test('yyork config parses Vite env files', () => {
  assert.deepEqual(
    parseEnvFile(`
      # ignored comment
      VITE_PORT=4321
      export YYORK_BACKEND_PORT="7654"
      QUOTED='value'
    `),
    {
      YYORK_BACKEND_PORT: '7654',
      QUOTED: 'value',
      VITE_PORT: '4321',
    }
  );
});

test('yyork config uses web/.env VITE_PORT when shell env omits it', () => {
  const webDir = mkdtempSync(resolve(tmpdir(), 'yyork-web-env-'));
  writeFileSync(resolve(webDir, '.env'), 'VITE_PORT=4567\n');

  assert.deepEqual(resolveDevConfig({ env: {}, webDir }), {
    backendHost: '127.0.0.1',
    backendPort: 7331,
    webPort: 4567,
  });
});

test('yyork config lets shell VITE_PORT override web/.env', () => {
  const webDir = mkdtempSync(resolve(tmpdir(), 'yyork-web-env-'));
  writeFileSync(resolve(webDir, '.env'), 'VITE_PORT=4567\n');

  assert.equal(
    resolveDevConfig({
      env: {
        VITE_PORT: '5678',
      },
      webDir,
    }).webPort,
    5678
  );
});

function runLauncher(args, env = {}) {
  return spawnSync(process.execPath, [launcherPath, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

function assertNoServerStart(result) {
  assert.doesNotMatch(result.stdout, /yyork backend:/);
  assert.doesNotMatch(result.stdout, /yyork web:/);
  assert.doesNotMatch(result.stderr, /yyork backend:/);
  assert.doesNotMatch(result.stderr, /yyork web:/);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
