#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJSON = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf8')
);
const outputPath = resolve(rootDir, 'yyork');
const goBinDir = process.env.GOBIN
  ? resolve(rootDir, process.env.GOBIN)
  : resolve(rootDir, 'go-bin');
const goBinPath = resolve(goBinDir, 'yyork');
const ldflags = [
  `-X github.com/yyopc/yyork/internal/cli.Version=${packageJSON.version}`,
].join(' ');

run('go', ['build', '-ldflags', ldflags, '-o', outputPath, '.'], {
  cwd: rootDir,
});

mkdirSync(goBinDir, { recursive: true });
copyFileSync(outputPath, goBinPath);
chmodSync(goBinPath, 0o755);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}.`
    );
  }
}
