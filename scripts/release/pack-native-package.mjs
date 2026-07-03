#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureZellijArtifact, zellijVersion } from './zellij-artifacts.mjs';
import {
  nativePackageMetadata,
  nativePackageMetadataForTarget,
  supportedNativePackageTargets,
  yyorkBinaryName,
  zellijBinaryName,
} from '../../bin/native-package.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const options = parseArgs(process.argv.slice(2));
const metadata = options.target
  ? nativePackageMetadataForTarget(options.target)
  : nativePackageMetadata();
const rootPackageJSON = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf8')
);
const stageParent = mkdtempSync(join(tmpdir(), 'yyork-native-package-'));
const packageDir = resolve(stageParent, metadata.name.replace('@yyopc/', ''));

try {
  await stageNativePackage();

  if (options.publish) {
    const args = ['publish', packageDir, '--access', 'public'];
    if (options.dryRun) {
      args.push('--dry-run');
    }
    run('npm', args, { cwd: rootDir });
  } else {
    const packDestination =
      options.packDestination ?? resolve(rootDir, 'dist', 'npm');
    mkdirSync(packDestination, { recursive: true });
    run('npm', ['pack', packageDir, '--pack-destination', packDestination], {
      cwd: rootDir,
    });
  }
} finally {
  if (!options.keepStage) {
    rmSync(stageParent, { recursive: true, force: true });
  } else {
    console.log(`Native package stage kept at ${packageDir}`);
  }
}

async function stageNativePackage() {
  mkdirSync(resolve(packageDir, 'bin'), { recursive: true });

  writeFileSync(
    resolve(packageDir, 'package.json'),
    `${JSON.stringify(nativePackageJSON(), null, 2)}\n`
  );
  writeFileSync(resolve(packageDir, 'README.md'), nativeReadme());
  copyFileSync(resolve(rootDir, 'LICENSE'), resolve(packageDir, 'LICENSE'));
  copyFileSync(
    resolve(rootDir, 'third_party', 'zellij', 'THIRD_PARTY_NOTICES.md'),
    resolve(packageDir, 'THIRD_PARTY_NOTICES.md')
  );

  stageYyorkBinary(resolve(packageDir, 'bin', yyorkBinaryName(metadata.os)));
  await copyBundledZellij();
}

function nativePackageJSON() {
  return {
    name: metadata.name,
    version: rootPackageJSON.version,
    description: `Prebuilt yyork app runtime for ${metadata.os}/${metadata.cpu}.`,
    homepage: rootPackageJSON.homepage,
    bugs: rootPackageJSON.bugs,
    license: rootPackageJSON.license,
    author: rootPackageJSON.author,
    repository: rootPackageJSON.repository,
    os: [metadata.os],
    cpu: [metadata.cpu],
    files: ['bin/**', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md'],
    publishConfig: {
      access: 'public',
    },
  };
}

function nativeReadme() {
  return `# ${metadata.name}

Native yyork runtime package for ${metadata.os}/${metadata.cpu}.

Install \`@yyopc/yyork\` instead of installing this package directly.
`;
}

function stageYyorkBinary(outputPath) {
  if (options.binary) {
    copyFileSync(options.binary, outputPath);
    chmodSync(outputPath, 0o755);
    return;
  }

  const appIndex = resolve(rootDir, 'internal', 'web', 'build', 'index.html');
  if (!existsSync(appIndex)) {
    throw new Error('internal/web/build is missing. Run pnpm web:build first.');
  }

  const ldflags = [
    '-s',
    '-w',
    `-X github.com/yyopc/yyork/internal/cli.Version=${rootPackageJSON.version}`,
  ].join(' ');

  run(
    'go',
    [
      'build',
      '-trimpath',
      '-buildvcs=false',
      '-ldflags',
      ldflags,
      '-o',
      outputPath,
      '.',
    ],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        CGO_ENABLED: '0',
        GOOS: metadata.goos,
        GOARCH: metadata.goarch,
      },
    }
  );

  chmodSync(outputPath, 0o755);
}

async function copyBundledZellij() {
  const sourcePath = await ensureZellijArtifact(metadata, { rootDir });
  const targetPath = resolve(packageDir, 'bin', zellijBinaryName(metadata.os));
  copyFileSync(sourcePath, targetPath);
  chmodSync(targetPath, 0o755);
  console.log(`Bundled zellij ${zellijVersion} copied from ${sourcePath}`);
}

function parseArgs(args) {
  const options = {
    binary: null,
    dryRun: false,
    keepStage: false,
    packDestination: null,
    publish: false,
    target: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--binary':
        index += 1;
        if (!args[index]) {
          throw new Error('--binary requires a path.');
        }
        options.binary = resolve(args[index]);
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
        options.target = args[index];
        break;
      case '--publish':
        options.publish = true;
        break;
      case '--help':
        console.log(
          'Usage: node scripts/release/pack-native-package.mjs [--target TARGET] [--binary PATH] [--pack-destination DIR] [--publish] [--dry-run] [--keep-stage]'
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

  if (options.binary && !existsSync(options.binary)) {
    throw new Error(`--binary path does not exist: ${options.binary}`);
  }

  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
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
