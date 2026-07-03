import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  extractArtifactArchive,
  findExtractedBinary,
  zellijArtifactMetadata,
} from './zellij-artifacts.mjs';
import {
  nativePackageMetadata,
  nativePackageMetadataForTarget,
  supportedNativePackageTargets,
  yyorkBinaryName,
  zellijBinaryName,
} from '../../bin/native-package.mjs';

test('publishes Windows x64 native package metadata', () => {
  const metadata = nativePackageMetadata('win32', 'x64');

  assert.deepEqual(metadata, {
    target: 'windows-x64',
    name: '@yyopc/yyork-windows-x64',
    os: 'win32',
    cpu: 'x64',
    goos: 'windows',
    goarch: 'amd64',
  });
  assert.equal(nativePackageMetadataForTarget('windows-x64'), metadata);
  assert.equal(yyorkBinaryName(metadata.os), 'yyork.exe');
  assert.equal(zellijBinaryName(metadata.os), 'zellij.exe');
  assert.deepEqual(supportedNativePackageTargets(), [
    'darwin-arm64',
    'darwin-x64',
    'linux-arm64',
    'linux-x64',
    'windows-x64',
  ]);
});

test('pins the Windows x64 Zellij zip artifact', () => {
  const artifact = zellijArtifactMetadata(
    nativePackageMetadata('win32', 'x64')
  );

  assert.equal(artifact.targetDir, 'windows-amd64');
  assert.equal(artifact.assetName, 'zellij-x86_64-pc-windows-msvc.zip');
  assert.equal(
    artifact.sha256,
    '45f25febb588d36f499232b3ba80a9edcde3b3a2a85bebb105a82457b0ca6aef'
  );
  assert.equal(
    artifact.url,
    'https://github.com/zellij-org/zellij/releases/download/v0.44.3/zellij-x86_64-pc-windows-msvc.zip'
  );
});

test('extracts a nested Windows Zellij zip and finds zellij.exe', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'yyork-native-test-'));
  try {
    const sourceDir = resolve(tempDir, 'source');
    const extractDir = resolve(tempDir, 'extract');
    const nestedDir = resolve(sourceDir, 'target', 'release');
    const archivePath = resolve(tempDir, 'zellij-x86_64-pc-windows-msvc.zip');
    const binaryPath = resolve(nestedDir, 'zellij.exe');

    mkdirSync(nestedDir, { recursive: true });
    mkdirSync(extractDir, { recursive: true });
    writeFileSync(binaryPath, 'test binary');
    chmodSync(binaryPath, 0o755);

    const result = spawnSync('zip', ['-q', '-r', archivePath, 'target'], {
      cwd: sourceDir,
      encoding: 'utf8',
    });
    if (result.error) {
      throw result.error;
    }
    assert.equal(result.status, 0, result.stderr);

    extractArtifactArchive(
      archivePath,
      'zellij-x86_64-pc-windows-msvc.zip',
      extractDir
    );

    assert.equal(
      findExtractedBinary(
        extractDir,
        'zellij.exe',
        'zellij-x86_64-pc-windows-msvc.zip'
      ),
      resolve(extractDir, 'target', 'release', 'zellij.exe')
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
