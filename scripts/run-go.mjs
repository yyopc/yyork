#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const goArgs = process.argv.slice(2);

if (goArgs.length === 0) {
  console.error('Usage: node ./scripts/run-go.mjs <go args...>');
  process.exit(1);
}

if (hasCommand('go', ['version'])) {
  run('go', goArgs);
} else if (process.platform !== 'win32' && hasCommand('nix', ['--version'])) {
  run('nix', ['develop', '--command', 'go', ...goArgs]);
} else {
  console.error('Unable to run Go: install Go or run from a Nix dev shell.');
  process.exit(1);
}

function hasCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0;
}

function run(command, args) {
  const child = spawn(command, args, {
    cwd: rootDir,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}
