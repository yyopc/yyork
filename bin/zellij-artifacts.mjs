import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { zellijBinaryName } from './native-package.mjs';

export const zellijVersion = '0.44.3';
export const zellijReleaseURL =
  'https://github.com/zellij-org/zellij/releases/tag/v0.44.3';

const zellijArtifacts = {
  'darwin arm64': {
    targetDir: 'darwin-arm64',
    assetName: 'zellij-aarch64-apple-darwin.tar.gz',
    sha256: 'b6acf83a7739cf5f0f4e9bd47709642d4d98acbbf8c34d4a12c6e706f531da61',
  },
  'darwin x64': {
    targetDir: 'darwin-amd64',
    assetName: 'zellij-x86_64-apple-darwin.tar.gz',
    sha256: '59f803faa32cd4e5f316f0dc2d3b7a5530a72553e38ad939286471848a418eeb',
  },
  'linux arm64': {
    targetDir: 'linux-arm64',
    assetName: 'zellij-aarch64-unknown-linux-musl.tar.gz',
    sha256: '15e6534d42644d66973d136c590c49739dcfd6a1a2a0d3d917973f16c81b45fb',
  },
  'linux x64': {
    targetDir: 'linux-amd64',
    assetName: 'zellij-x86_64-unknown-linux-musl.tar.gz',
    sha256: '0f7c346788627f506c0a28296517768633cff24fc822a739f8264b640ecad751',
  },
};

export function zellijArtifactMetadata(metadata) {
  const artifact = zellijArtifacts[`${metadata.os} ${metadata.cpu}`];
  if (!artifact) {
    throw new Error(
      `No pinned zellij artifact for ${metadata.os}/${metadata.cpu}.`
    );
  }
  return {
    ...artifact,
    url: `https://github.com/zellij-org/zellij/releases/download/v${zellijVersion}/${artifact.assetName}`,
  };
}

export function zellijArtifactTargets() {
  return Object.keys(zellijArtifacts);
}

export async function ensureZellijArtifact(metadata, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const artifact = zellijArtifactMetadata(metadata);
  const binaryName = zellijBinaryName(metadata.os);
  const targetPath = resolve(
    rootDir,
    'third_party',
    'zellij',
    artifact.targetDir,
    binaryName
  );

  if (isExecutable(targetPath, metadata.os)) {
    return targetPath;
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'yyork-zellij-'));
  try {
    const archivePath = resolve(tempDir, artifact.assetName);
    await downloadFile(artifact.url, archivePath);
    verifySHA256(archivePath, artifact.sha256);

    const extractDir = resolve(tempDir, 'extract');
    mkdirSync(extractDir, { recursive: true });
    run('tar', ['-xzf', archivePath, '-C', extractDir]);

    const extractedBinary = resolve(extractDir, binaryName);
    if (!existsSync(extractedBinary)) {
      throw new Error(
        `${artifact.assetName} did not contain expected ${binaryName}.`
      );
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(extractedBinary, targetPath);
    chmodSync(targetPath, 0o755);
    writeFileSync(
      resolve(dirname(targetPath), 'VERSION'),
      `${zellijVersion}\n`
    );
    writeFileSync(
      resolve(dirname(targetPath), `${basename(artifact.assetName)}.sha256`),
      `${artifact.sha256}  ${artifact.assetName}\n`
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  if (!isExecutable(targetPath, metadata.os)) {
    throw new Error(`Fetched zellij is not executable at ${targetPath}.`);
  }
  return targetPath;
}

function isExecutable(path, platform) {
  try {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return false;
    }
    if (platform === 'win32') {
      return true;
    }
    return (stat.mode & 0o111) !== 0;
  } catch (_error) {
    return false;
  }
}

function downloadFile(url, targetPath, redirects = 0) {
  if (redirects > 5) {
    return Promise.reject(
      new Error(`Too many redirects while fetching ${url}.`)
    );
  }

  return new Promise((resolvePromise, reject) => {
    const get = url.startsWith('https:') ? httpsGet : httpGet;
    const request = get(url, (response) => {
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        downloadFile(
          new URL(response.headers.location, url).toString(),
          targetPath,
          redirects + 1
        )
          .then(resolvePromise)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(
          new Error(
            `Failed to fetch ${url}: HTTP ${response.statusCode ?? 'unknown'}`
          )
        );
        return;
      }

      const file = createWriteStream(targetPath, { mode: 0o644 });
      response.pipe(file);
      file.on('finish', () => file.close(resolvePromise));
      file.on('error', reject);
    });
    request.on('error', reject);
  });
}

function verifySHA256(path, expected) {
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (actual !== expected) {
    throw new Error(
      `SHA-256 mismatch for ${path}: expected ${expected}, got ${actual}.`
    );
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
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
}
