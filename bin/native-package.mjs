import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const nativePackages = {
  'darwin arm64': {
    target: 'darwin-arm64',
    name: '@yyopc/yyork-darwin-arm64',
    os: 'darwin',
    cpu: 'arm64',
    goos: 'darwin',
    goarch: 'arm64',
  },
  'darwin x64': {
    target: 'darwin-x64',
    name: '@yyopc/yyork-darwin-x64',
    os: 'darwin',
    cpu: 'x64',
    goos: 'darwin',
    goarch: 'amd64',
  },
  'linux arm64': {
    target: 'linux-arm64',
    name: '@yyopc/yyork-linux-arm64',
    os: 'linux',
    cpu: 'arm64',
    goos: 'linux',
    goarch: 'arm64',
  },
  'linux x64': {
    target: 'linux-x64',
    name: '@yyopc/yyork-linux-x64',
    os: 'linux',
    cpu: 'x64',
    goos: 'linux',
    goarch: 'amd64',
  },
  'win32 x64': {
    target: 'windows-x64',
    name: '@yyopc/yyork-windows-x64',
    os: 'win32',
    cpu: 'x64',
    goos: 'windows',
    goarch: 'amd64',
  },
};

const nativePackagesByTarget = Object.fromEntries(
  Object.values(nativePackages).map((metadata) => [metadata.target, metadata])
);

export function nativePackageMetadata(
  platform = process.platform,
  arch = process.arch
) {
  const metadata = nativePackages[`${platform} ${arch}`];
  if (!metadata) {
    throw new Error(
      `yyork does not publish a native npm package for ${platform}/${arch}. ` +
        `Supported platforms: ${supportedNativePackages().join(', ')}.`
    );
  }
  return metadata;
}

export function nativePackageMetadataForTarget(target) {
  const metadata = nativePackagesByTarget[target];
  if (!metadata) {
    throw new Error(
      `yyork does not publish a native npm package for target ${target}. ` +
        `Supported targets: ${supportedNativePackageTargets().join(', ')}.`
    );
  }
  return metadata;
}

export function supportedNativePackages() {
  return Object.values(nativePackages).map((metadata) => metadata.name);
}

export function supportedNativePackageTargets() {
  return Object.keys(nativePackagesByTarget);
}

export function yyorkBinaryName(platform = process.platform) {
  return platform === 'win32' ? 'yyork.exe' : 'yyork';
}

export function zellijBinaryName(platform = process.platform) {
  return platform === 'win32' ? 'zellij.exe' : 'zellij';
}

export function resolveYyorkBinary() {
  const metadata = nativePackageMetadata();
  const require = createRequire(import.meta.url);

  let packageJSONPath;
  try {
    packageJSONPath = require.resolve(`${metadata.name}/package.json`);
  } catch (_error) {
    throw new Error(
      `Unable to find ${metadata.name}, the native yyork package for ` +
        `${process.platform}/${process.arch}. Reinstall @yyopc/yyork with ` +
        `optional dependencies enabled.`
    );
  }

  const binaryPath = resolve(
    dirname(packageJSONPath),
    'bin',
    yyorkBinaryName()
  );
  try {
    accessSync(
      binaryPath,
      process.platform === 'win32' ? constants.F_OK : constants.X_OK
    );
  } catch (_error) {
    throw new Error(
      `The native yyork package ${metadata.name} is installed, but its ` +
        `binary is missing or not executable at ${binaryPath}.`
    );
  }

  return binaryPath;
}

export function runYyork(args, options = {}) {
  const binaryPath = resolveYyorkBinary();
  return spawnSync(binaryPath, args, {
    shell: process.platform === 'win32',
    stdio: options.stdio ?? 'inherit',
    cwd: options.cwd,
    env: options.env,
  });
}
