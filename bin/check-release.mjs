#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = mkdtempSync(join(tmpdir(), 'yyork-release-'));

try {
  runLogged('pnpm', ['pack', '--pack-destination', tempDir], 'pack.log', {
    cwd: rootDir,
  });

  const tarballs = readdirSync(tempDir).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) {
    fail(`Expected one packed tarball, found ${tarballs.length}.`);
  }

  const tarballPath = resolve(tempDir, tarballs[0]);
  const tarballEntries = capture('tar', ['-tzf', tarballPath], { cwd: rootDir })
    .trim()
    .split('\n');

  requireEntry(tarballEntries, 'package/bin/yyork.mjs');
  requireEntry(tarballEntries, 'package/bin/install-yyork.mjs');
  requireEntry(tarballEntries, 'package/.agents/skills/yyork-cli/SKILL.md');
  requireEntry(
    tarballEntries,
    'package/.agents/skills/yyork-cli/agents/openai.yaml'
  );
  requireEntry(tarballEntries, 'package/main.go');
  requireEntry(
    tarballEntries,
    'package/internal/session/prompts/orchestrator.md'
  );
  requireEntry(tarballEntries, 'package/internal/session/prompts/worker.md');
  requireEntry(
    tarballEntries,
    'package/internal/store/migrations/0001_create_sessions.sql'
  );
  requireEntry(tarballEntries, 'package/cmd/yyork/dashboard/app/index.html');
  requirePattern(
    tarballEntries,
    /^package\/cmd\/yyork\/dashboard\/app\/assets\/.+\.js$/,
    'dashboard JavaScript assets'
  );

  const installPrefix = resolve(tempDir, 'install');
  const installHome = resolve(tempDir, 'home');
  runLogged(
    'npm',
    ['install', '-g', tarballPath, '--prefix', installPrefix],
    'install.log',
    {
      cwd: rootDir,
      env: {
        HOME: installHome,
        USERPROFILE: installHome,
      },
    }
  );

  const yyorkBin =
    process.platform === 'win32'
      ? resolve(installPrefix, 'yyork.cmd')
      : resolve(installPrefix, 'bin', 'yyork');

  if (!existsSync(yyorkBin)) {
    fail(`Installed yyork binary shim was not found at ${yyorkBin}.`);
  }

  const installedSkill = resolve(
    installHome,
    '.agents',
    'skills',
    'yyork-cli',
    'SKILL.md'
  );
  if (!existsSync(installedSkill)) {
    fail(`Installed yyork CLI skill was not found at ${installedSkill}.`);
  }

  run(yyorkBin, ['--version'], { cwd: rootDir });
  run(yyorkBin, ['--help'], { cwd: rootDir, stdio: 'ignore' });

  console.log(`Release check passed: ${tarballPath}`);
  rmSync(tempDir, { recursive: true, force: true });
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  }
  console.error(`Release check artifacts kept at ${tempDir}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    shell: process.platform === 'win32',
    stdio: options.stdio ?? 'inherit',
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

function runLogged(command, args, logName, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : undefined,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  writeFileSync(resolve(tempDir, logName), output);

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}.\n${tail(output)}`
    );
  }
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}.\n${result.stderr}`
    );
  }
  return result.stdout;
}

function requireEntry(entries, expected) {
  if (!entries.includes(expected)) {
    fail(`Packed tarball is missing ${expected}.`);
  }
}

function requirePattern(entries, pattern, label) {
  if (!entries.some((entry) => pattern.test(entry))) {
    fail(`Packed tarball is missing ${label}.`);
  }
}

function fail(message) {
  throw new Error(message);
}

function tail(text) {
  return text.trim().split('\n').slice(-40).join('\n');
}
