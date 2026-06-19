#!/usr/bin/env node
// postinstall: compile the yyork Go binary into dist/ when @yyopc/yyork is
// installed as a package. The published tarball ships the embedded dashboard
// (cmd/yyork/dashboard/app/**, built by `prepack`), so this only needs Go.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (!isPackageInstall() && process.env.YYORK_FORCE_POSTINSTALL !== '1') {
  process.exit(0);
}

if (!hasCommand('go', ['version'])) {
  console.error(
    'yyork npm install requires Go 1.25+ on PATH to build the local yyork binary.'
  );
  process.exit(1);
}

const packageJSON = JSON.parse(readFileSync(resolve(rootDir, 'package.json')));
const distDir = resolve(rootDir, 'dist');
const binaryPath = resolve(
  distDir,
  process.platform === 'win32' ? 'yyork.exe' : 'yyork'
);

mkdirSync(distDir, { recursive: true });

const ldflags = [
  '-s',
  '-w',
  `-X github.com/yyopc/yyork/internal/cli.Version=${packageJSON.version}`,
].join(' ');

const result = spawnSync(
  'go',
  ['build', '-trimpath', '-ldflags', ldflags, '-o', binaryPath, '.'],
  {
    cwd: rootDir,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  }
);

if (result.signal) {
  process.kill(process.pid, result.signal);
}
if (result.status !== 0 || !existsSync(binaryPath)) {
  process.exit(result.status ?? 1);
}

installGlobalAgentSkill();

function isPackageInstall() {
  return rootDir.split(sep).includes('node_modules');
}

function hasCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0;
}

function installGlobalAgentSkill() {
  const sourceDir = resolve(rootDir, '.agents', 'skills', 'yyork-cli');
  if (!existsSync(sourceDir)) {
    console.warn(
      'yyork CLI skill was not bundled; skipping global skill install.'
    );
    return;
  }

  const targetDir = resolve(homedir(), '.agents', 'skills', 'yyork-cli');
  mkdirSync(resolve(targetDir, '..'), { recursive: true });
  rmSync(targetDir, { recursive: true, force: true });
  cpSync(sourceDir, targetDir, { recursive: true });
}
