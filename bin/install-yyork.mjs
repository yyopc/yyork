#!/usr/bin/env node
// postinstall: finish package-level setup for @yyopc/yyork. The actual app is
// shipped as a prebuilt native package; this step only installs the bundled
// agent skill and runs a warning-only runtime check.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveYyorkBinary } from './native-package.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (!isPackageInstall() && process.env.YYORK_FORCE_POSTINSTALL !== '1') {
  process.exit(0);
}

let binaryPath;
try {
  binaryPath = resolveYyorkBinary();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

installGlobalAgentSkill();
runInstallDoctor(binaryPath);

function isPackageInstall() {
  return rootDir.split(sep).includes('node_modules');
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

function runInstallDoctor(binaryPath) {
  console.log('\nyyork doctor: checking local runtime dependencies...');
  const result = spawnSync(binaryPath, ['doctor'], {
    cwd: rootDir,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    console.warn(`yyork doctor could not run: ${result.error.message}`);
    return;
  }
  if (result.signal) {
    console.warn(`yyork doctor stopped with signal ${result.signal}.`);
    return;
  }
  if (result.status !== 0) {
    console.warn(
      'yyork installed, but doctor found missing dependencies. ' +
        'Install the missing tools before running sessions.'
    );
  }
}
