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
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  nativePackageMetadataForTarget,
  supportedNativePackageTargets,
  yyorkBinaryName,
} from '../../bin/native-package.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJSON = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf8')
);
const options = parseArgs(process.argv.slice(2));
const stageDir = mkdtempSync(join(tmpdir(), 'yyork-npm-release-'));

try {
  mkdirSync(options.packDestination, { recursive: true });

  for (const target of options.targets) {
    const metadata = nativePackageMetadataForTarget(target);
    const archivePath = findGoReleaserArchive(metadata);
    const binaryPath = extractYyorkBinary(archivePath, metadata, target);

    run('node', [
      resolve(rootDir, 'scripts', 'release', 'pack-native-package.mjs'),
      '--target',
      target,
      '--binary',
      binaryPath,
      '--pack-destination',
      options.packDestination,
    ]);
  }

  run('pnpm', ['pack', '--pack-destination', options.packDestination], {
    cwd: rootDir,
  });
  run('node', [
    resolve(rootDir, 'scripts', 'release', 'pack-alias-package.mjs'),
    '--pack-destination',
    options.packDestination,
  ]);

  requirePackedTarballs();
  console.log(`Packed npm release tarballs in ${options.packDestination}`);
} finally {
  if (!options.keepStage) {
    rmSync(stageDir, { recursive: true, force: true });
  } else {
    console.log(`NPM release staging kept at ${stageDir}`);
  }
}

function parseArgs(args) {
  const options = {
    artifactsDir: resolve(rootDir, 'dist'),
    explicitTargets: false,
    keepStage: false,
    packDestination: resolve(rootDir, 'dist', 'npm'),
    targets: supportedNativePackageTargets(),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--artifacts-dir':
        index += 1;
        if (!args[index]) {
          throw new Error('--artifacts-dir requires a path.');
        }
        options.artifactsDir = resolve(args[index]);
        break;
      case '--keep-stage':
        options.keepStage = true;
        break;
      case '--pack-destination':
        index += 1;
        if (!args[index]) {
          throw new Error('--pack-destination requires a path.');
        }
        options.packDestination = resolve(args[index]);
        break;
      case '--target':
        index += 1;
        if (!args[index]) {
          throw new Error('--target requires a supported target name.');
        }
        if (!options.explicitTargets) {
          options.targets = [];
          options.explicitTargets = true;
        }
        options.targets.push(args[index]);
        break;
      case '--help':
        console.log(
          'Usage: node scripts/release/pack-npm-release.mjs [--artifacts-dir DIR] [--pack-destination DIR] [--target TARGET] [--keep-stage]'
        );
        console.log(
          `Supported targets: ${supportedNativePackageTargets().join(', ')}`
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!existsSync(options.artifactsDir)) {
    throw new Error(
      `GoReleaser artifacts dir does not exist: ${options.artifactsDir}`
    );
  }
  delete options.explicitTargets;

  return options;
}

function findGoReleaserArchive(metadata) {
  const suffix = goReleaserArchiveSuffix(metadata);
  const matches = recursiveFiles(options.artifactsDir).filter((entry) =>
    basename(entry).endsWith(suffix)
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected one GoReleaser archive ending in ${suffix}; ` +
        `found ${matches.length}: ${matches.join(', ')}`
    );
  }

  return matches[0];
}

function extractYyorkBinary(archivePath, metadata, target) {
  const extractDir = resolve(stageDir, target);
  mkdirSync(extractDir, { recursive: true });
  extractGoReleaserArchive(archivePath, metadata, extractDir);

  const binaryName = yyorkBinaryName(metadata.os);
  const candidates = recursiveFiles(extractDir).filter(
    (entry) => basename(entry) === binaryName && !statSync(entry).isDirectory()
  );

  if (candidates.length !== 1) {
    throw new Error(
      `Expected one ${binaryName} binary in ${archivePath}; ` +
        `found ${candidates.length}: ${candidates.join(', ')}`
    );
  }

  chmodSync(candidates[0], 0o755);
  return candidates[0];
}

function goReleaserArchiveSuffix(metadata) {
  const extension = metadata.goos === 'windows' ? '.zip' : '.tar.gz';
  return `_${metadata.goos}_${metadata.goarch}${extension}`;
}

function extractGoReleaserArchive(archivePath, metadata, extractDir) {
  if (metadata.goos === 'windows') {
    run('unzip', ['-q', archivePath, '-d', extractDir]);
    return;
  }

  run('tar', ['-xzf', archivePath, '-C', extractDir]);
}

function requirePackedTarballs() {
  const tarballs = new Set(
    readdirSync(options.packDestination).filter((entry) =>
      entry.endsWith('.tgz')
    )
  );
  const expected = [
    `yyopc-yyork-${packageJSON.version}.tgz`,
    `yyork-${packageJSON.version}.tgz`,
    ...options.targets.map((target) => {
      const metadata = nativePackageMetadataForTarget(target);
      return `${nativeTarballStem(metadata.name)}-${packageJSON.version}.tgz`;
    }),
  ];

  for (const tarball of expected) {
    if (!tarballs.has(tarball)) {
      throw new Error(
        `Expected packed tarball ${tarball}; found ${[...tarballs].join(', ')}.`
      );
    }
  }
}

function nativeTarballStem(packageName) {
  return packageName.replace(/^@/, '').replace('/', '-');
}

function recursiveFiles(root) {
  const entries = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      entries.push(...recursiveFiles(path));
    } else {
      entries.push(path);
    }
  }
  return entries;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    env: options.env ?? process.env,
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
