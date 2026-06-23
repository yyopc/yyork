#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  nativePackageMetadata,
  supportedNativePackages,
  yyorkBinaryName,
  zellijBinaryName,
} from './native-package.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJSON = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf8')
);
const nativeMetadata = nativePackageMetadata();
const tempDir = mkdtempSync(join(tmpdir(), 'yyork-release-'));

try {
  runLogged('pnpm', ['web:build'], 'web-build.log', { cwd: rootDir });
  runLogged(
    'node',
    [
      resolve(rootDir, 'bin', 'pack-native-package.mjs'),
      '--pack-destination',
      tempDir,
    ],
    'native-pack.log',
    { cwd: rootDir }
  );
  runLogged(
    'pnpm',
    ['pack', '--pack-destination', tempDir],
    'wrapper-pack.log',
    {
      cwd: rootDir,
    }
  );

  const wrapperTarballPath = requireTarball(
    `yyopc-yyork-${packageJSON.version}.tgz`
  );
  const nativeTarballPath = requireTarball(
    `yyopc-yyork-${nativeMetadata.os}-${nativeMetadata.cpu}-${packageJSON.version}.tgz`
  );

  const wrapperEntries = tarballEntries(wrapperTarballPath);
  const packedWrapperPackageJSON = packedPackageJSON(wrapperTarballPath);
  requireEntry(wrapperEntries, 'package/bin/yyork.mjs');
  requireEntry(wrapperEntries, 'package/bin/install-yyork.mjs');
  requireEntry(wrapperEntries, 'package/bin/native-package.mjs');
  requireEntry(wrapperEntries, 'package/.agents/skills/yyork-cli/SKILL.md');
  requireEntry(
    wrapperEntries,
    'package/.agents/skills/yyork-cli/agents/openai.yaml'
  );
  requireMissing(wrapperEntries, 'package/main.go');
  requireMissing(wrapperEntries, 'package/internal/web/build/index.html');
  requireNativeDependencyVersions(packedWrapperPackageJSON);

  const nativeEntries = tarballEntries(nativeTarballPath);
  const packedNativePackageJSON = packedPackageJSON(nativeTarballPath);
  requireEntry(
    nativeEntries,
    `package/bin/${yyorkBinaryName(nativeMetadata.os)}`
  );
  requireEntry(
    nativeEntries,
    `package/bin/${zellijBinaryName(nativeMetadata.os)}`
  );
  requireEntry(nativeEntries, 'package/LICENSE');
  requireEntry(nativeEntries, 'package/THIRD_PARTY_NOTICES.md');
  requireEntry(nativeEntries, 'package/package.json');
  requireNativePackageMetadata(packedNativePackageJSON);

  const installPrefix = resolve(tempDir, 'install');
  const installHome = resolve(tempDir, 'home');
  const noGoBin = resolve(tempDir, 'no-go-bin');
  createNoGoShim(noGoBin);

  const installEnv = {
    HOME: installHome,
    PATH: `${noGoBin}${delimiter}${process.env.PATH ?? ''}`,
    USERPROFILE: installHome,
  };
  runLogged(
    'npm',
    [
      'install',
      '-g',
      nativeTarballPath,
      wrapperTarballPath,
      '--prefix',
      installPrefix,
      '--omit=optional',
    ],
    'install.log',
    {
      cwd: rootDir,
      env: installEnv,
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

  run(yyorkBin, ['--version'], { cwd: rootDir, env: installEnv });
  run(yyorkBin, ['--help'], {
    cwd: rootDir,
    env: installEnv,
    stdio: 'ignore',
  });
  requireBundledZellijDoctor(yyorkBin, installEnv);

  console.log(
    `Release check passed: ${wrapperTarballPath} + ${nativeTarballPath}`
  );
  rmSync(tempDir, { recursive: true, force: true });
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  }
  console.error(`Release check artifacts kept at ${tempDir}`);
  process.exit(1);
}

function requireTarball(name) {
  const tarballs = readdirSync(tempDir).filter((entry) =>
    entry.endsWith('.tgz')
  );
  if (!tarballs.includes(name)) {
    fail(`Expected packed tarball ${name}; found ${tarballs.join(', ')}.`);
  }
  return resolve(tempDir, name);
}

function tarballEntries(tarballPath) {
  return capture('tar', ['-tzf', tarballPath], { cwd: rootDir })
    .trim()
    .split('\n')
    .filter(Boolean);
}

function packedPackageJSON(tarballPath) {
  return JSON.parse(
    capture('tar', ['-xOf', tarballPath, 'package/package.json'], {
      cwd: rootDir,
    })
  );
}

function requireNativeDependencyVersions(packedWrapperPackageJSON) {
  const optionalDependencies =
    packedWrapperPackageJSON.optionalDependencies ?? {};
  for (const packageName of supportedNativePackages()) {
    if (optionalDependencies[packageName] !== packageJSON.version) {
      fail(
        `Packed wrapper optional dependency ${packageName} should be ` +
          `${packageJSON.version}, got ${optionalDependencies[packageName]}.`
      );
    }
  }
}

function requireNativePackageMetadata(packedNativePackageJSON) {
  const expected = {
    cpu: [nativeMetadata.cpu],
    name: nativeMetadata.name,
    os: [nativeMetadata.os],
    version: packageJSON.version,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (
      JSON.stringify(packedNativePackageJSON[key]) !== JSON.stringify(value)
    ) {
      fail(
        `Packed native package ${key} should be ${JSON.stringify(value)}, ` +
          `got ${JSON.stringify(packedNativePackageJSON[key])}.`
      );
    }
  }
}

function requireBundledZellijDoctor(yyorkBin, installEnv) {
  const result = spawnSync(yyorkBin, ['doctor', '--json'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, ...installEnv },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw result.error;
  }

  let output;
  try {
    output = JSON.parse(result.stdout);
  } catch (_error) {
    throw new Error(
      `yyork doctor --json did not return JSON.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  const zellij = output.checks?.find((check) => check.id === 'zellij');
  if (zellij?.status !== 'ok' || zellij?.source !== 'bundled') {
    fail(
      `Expected doctor to report bundled zellij, got ${JSON.stringify(zellij)}.`
    );
  }
}

function createNoGoShim(binDir) {
  mkdirSync(binDir, { recursive: true });
  const goPath = resolve(
    binDir,
    process.platform === 'win32' ? 'go.cmd' : 'go'
  );
  const script =
    process.platform === 'win32'
      ? '@echo off\r\necho go intentionally unavailable for release check >&2\r\nexit /b 127\r\n'
      : '#!/bin/sh\necho go intentionally unavailable for release check >&2\nexit 127\n';
  writeFileSync(goPath, script);
  chmodSync(goPath, 0o755);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : undefined,
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

function requireMissing(entries, forbidden) {
  if (entries.includes(forbidden)) {
    fail(`Packed wrapper tarball should not include ${forbidden}.`);
  }
}

function fail(message) {
  throw new Error(message);
}

function tail(text) {
  return text.trim().split('\n').slice(-40).join('\n');
}
