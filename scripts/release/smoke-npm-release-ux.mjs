#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
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
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createVerdaccioBootstrapEnv } from './verdaccio-bootstrap-env.mjs';
import { nativePackageMetadata } from '../../bin/native-package.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJSON = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf8')
);
const options = parseArgs(process.argv.slice(2));

await main();

async function main() {
  const tempDir = mkdtempSync(join(tmpdir(), 'yyork-release-ux-'));
  const artifactDir = options.artifactDir;
  const logsDir = resolve(artifactDir, 'logs');
  mkdirSync(logsDir, { recursive: true });

  let verdaccio;
  let server;
  try {
    const registryPort = options.registryPort ?? (await openPort());
    const registryURL = `http://127.0.0.1:${registryPort}`;
    const projectDir = resolve(tempDir, 'project');
    const homeDir = resolve(tempDir, 'home');
    const cacheDir = resolve(tempDir, 'npm-cache');
    const noGoBin = resolve(tempDir, 'no-go-bin');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(cacheDir, { recursive: true });
    createNoGoShim(noGoBin);
    writeFileSync(
      resolve(projectDir, 'package.json'),
      `${JSON.stringify({ private: true }, null, 2)}\n`
    );

    const smokeEnv = {
      ...process.env,
      HOME: homeDir,
      NPM_CONFIG_CACHE: cacheDir,
      NPM_CONFIG_REGISTRY: registryURL,
      NPM_CONFIG_USERCONFIG: resolve(tempDir, '.npmrc'),
      USERPROFILE:
        process.platform === 'win32'
          ? (process.env.USERPROFILE ?? homeDir)
          : homeDir,
      PATH: `${noGoBin}${delimiter}${process.env.PATH ?? ''}`,
      npm_config_cache: cacheDir,
      npm_config_registry: registryURL,
      npm_config_userconfig: resolve(tempDir, '.npmrc'),
    };
    writeFileSync(
      smokeEnv.npm_config_userconfig,
      [
        `registry=${registryURL}`,
        `//127.0.0.1:${registryPort}/:_authToken=yyork-release-smoke`,
        'fund=false',
        'audit=false',
        '',
      ].join('\n')
    );
    await runLogged('git', ['init', '--quiet'], {
      cwd: projectDir,
      env: smokeEnv,
      logPath: resolve(logsDir, 'git-init.log'),
    });

    const verdaccioConfig = writeVerdaccioConfig(tempDir);
    const verdaccioEnv = createVerdaccioBootstrapEnv(smokeEnv, tempDir);
    verdaccio = spawnLogged(
      'npm',
      [
        'exec',
        '--yes',
        '--package',
        'verdaccio@6',
        '--',
        'verdaccio',
        '--config',
        verdaccioConfig,
        '--listen',
        registryURL,
      ],
      {
        cwd: tempDir,
        detached: process.platform !== 'win32',
        env: verdaccioEnv,
        logPath: resolve(logsDir, 'verdaccio.log'),
      }
    );
    await waitForURL(registryURL, {
      label: 'Verdaccio registry',
      process: verdaccio,
      timeoutMs: 180_000,
    });

    const tarballs = expectedTarballs();
    await publishTarballs(tarballs, registryURL, tempDir, smokeEnv, logsDir);
    await runLogged(
      'npm',
      [
        'view',
        `yyork@${packageJSON.version}`,
        'version',
        '--registry',
        registryURL,
      ],
      {
        cwd: projectDir,
        env: smokeEnv,
        logPath: resolve(logsDir, 'npm-view-yyork.log'),
      }
    );

    const execArgs = (...yyorkArgs) => [
      'exec',
      '--yes',
      '--registry',
      registryURL,
      '--package',
      `yyork@${packageJSON.version}`,
      '--',
      'yyork',
      ...yyorkArgs,
    ];

    const versionResult = await runLogged('npm', execArgs('--version'), {
      cwd: projectDir,
      env: smokeEnv,
      logPath: resolve(logsDir, 'yyork-version.log'),
    });
    writeFileSync(
      resolve(artifactDir, 'yyork-version.txt'),
      versionResult.stdout
    );

    const doctorResult = await runLogged('npm', execArgs('doctor', '--json'), {
      allowFailure: true,
      cwd: projectDir,
      env: smokeEnv,
      logPath: resolve(logsDir, 'yyork-doctor-json.log'),
    });
    const doctorJSON = parseJSONFromStdout(doctorResult.stdout, 'yyork doctor');
    writeFileSync(
      resolve(artifactDir, 'yyork-doctor.json'),
      `${JSON.stringify(doctorJSON, null, 2)}\n`
    );
    assertBundledZellij(doctorJSON);

    const serverURL = `http://${options.addr}`;
    writeFileSync(resolve(artifactDir, 'server-url.txt'), `${serverURL}\n`);
    server = spawnLogged(
      'npm',
      execArgs('--open=false', '--addr', options.addr, projectDir),
      {
        cwd: projectDir,
        detached: process.platform !== 'win32',
        env: smokeEnv,
        logPath: resolve(logsDir, 'yyork-server.log'),
      }
    );
    await waitForURL(serverURL, {
      label: 'yyork server',
      process: server,
    });

    await captureBrowserEvidence(serverURL, artifactDir);
    console.log(
      `Release UX smoke passed for ${process.platform}/${process.arch}`
    );
  } finally {
    if (server) {
      await killProcessTree(server);
    }
    if (verdaccio) {
      await killProcessTree(verdaccio);
    }
    if (!options.keepTemp) {
      rmSync(tempDir, {
        force: true,
        maxRetries: 5,
        recursive: true,
        retryDelay: 100,
      });
    } else {
      console.log(`Release UX smoke temp dir kept at ${tempDir}`);
    }
  }
}

function parseArgs(args) {
  const parsed = {
    addr: '127.0.0.1:7331',
    artifactDir: resolve(rootDir, 'dist', 'release-ux-smoke'),
    keepTemp: false,
    packageDir: resolve(rootDir, 'dist', 'npm'),
    registryPort: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--addr':
        parsed.addr = requireValue(args, ++index, arg);
        break;
      case '--artifact-dir':
        parsed.artifactDir = resolve(requireValue(args, ++index, arg));
        break;
      case '--keep-temp':
        parsed.keepTemp = true;
        break;
      case '--package-dir':
        parsed.packageDir = resolve(requireValue(args, ++index, arg));
        break;
      case '--registry-port':
        parsed.registryPort = Number(requireValue(args, ++index, arg));
        if (
          !Number.isInteger(parsed.registryPort) ||
          parsed.registryPort <= 0
        ) {
          throw new Error('--registry-port requires a positive integer.');
        }
        break;
      case '--help':
        console.log(
          'Usage: node scripts/release/smoke-npm-release-ux.mjs [--package-dir DIR] [--artifact-dir DIR] [--addr HOST:PORT] [--registry-port PORT] [--keep-temp]'
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function requireValue(args, index, flag) {
  if (!args[index]) {
    throw new Error(`${flag} requires a value.`);
  }
  return args[index];
}

function expectedTarballs() {
  if (!existsSync(options.packageDir)) {
    throw new Error(
      `NPM package directory does not exist: ${options.packageDir}`
    );
  }

  const nativeMetadata = nativePackageMetadata();
  const required = [
    `yyopc-yyork-${packageJSON.version}.tgz`,
    `yyork-${packageJSON.version}.tgz`,
    `${packageTarballStem(nativeMetadata.name)}-${packageJSON.version}.tgz`,
  ];

  const tarballs = readdirSync(options.packageDir)
    .filter((entry) => entry.endsWith('.tgz'))
    .sort((left, right) => publishPriority(left) - publishPriority(right));
  const names = new Set(tarballs);
  for (const name of required) {
    if (!names.has(name)) {
      throw new Error(
        `Expected ${name} in ${options.packageDir}; found ${tarballs.join(', ')}.`
      );
    }
  }

  return tarballs.map((name) => resolve(options.packageDir, name));
}

function packageTarballStem(packageName) {
  return packageName.replace(/^@/, '').replace('/', '-');
}

function publishPriority(name) {
  if (/^yyopc-yyork-(darwin|linux|windows)-/.test(name)) {
    return 0;
  }
  if (/^yyopc-yyork-\d/.test(name)) {
    return 1;
  }
  if (/^yyork-\d/.test(name)) {
    return 2;
  }
  return 3;
}

async function publishTarballs(tarballs, registryURL, cwd, env, logsDir) {
  for (const tarball of tarballs) {
    const name = tarball.split(/[\\/]/).pop();
    await runLogged(
      'npm',
      [
        'publish',
        tarball,
        '--registry',
        registryURL,
        '--tag',
        'smoke',
        '--access',
        'public',
        '--ignore-scripts',
      ],
      {
        cwd,
        env,
        logPath: resolve(logsDir, `publish-${name}.log`),
      }
    );
  }
}

function writeVerdaccioConfig(tempDir) {
  const storage = posixPath(resolve(tempDir, 'verdaccio-storage'));
  const htpasswd = posixPath(resolve(tempDir, 'verdaccio.htpasswd'));
  const configPath = resolve(tempDir, 'verdaccio.yaml');
  writeFileSync(
    configPath,
    [
      `storage: ${JSON.stringify(storage)}`,
      'max_body_size: 100mb',
      'auth:',
      '  htpasswd:',
      `    file: ${JSON.stringify(htpasswd)}`,
      'uplinks: {}',
      'packages:',
      "  '@yyopc/*':",
      '    access: $all',
      '    publish: $all',
      '    unpublish: $all',
      "  '**':",
      '    access: $all',
      '    publish: $all',
      '    unpublish: $all',
      'log: { type: stdout, format: pretty, level: http }',
      '',
    ].join('\n')
  );
  return configPath;
}

function posixPath(path) {
  return path.replaceAll('\\', '/');
}

function createNoGoShim(binDir) {
  mkdirSync(binDir, { recursive: true });
  const goPath = resolve(
    binDir,
    process.platform === 'win32' ? 'go.cmd' : 'go'
  );
  const script =
    process.platform === 'win32'
      ? '@echo off\r\necho go intentionally unavailable in release UX smoke >&2\r\nexit /b 127\r\n'
      : '#!/bin/sh\necho go intentionally unavailable in release UX smoke >&2\nexit 127\n';
  writeFileSync(goPath, script);
  chmodSync(goPath, 0o755);
}

async function openPort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address) {
          resolvePromise(address.port);
        } else {
          reject(new Error(`Unexpected listener address: ${String(address)}`));
        }
      });
    });
  });
}

async function waitForURL(url, optionsForWait) {
  const started = Date.now();
  const timeoutMs = optionsForWait.timeoutMs ?? 60_000;
  let lastError;

  while (Date.now() - started < timeoutMs) {
    if (
      optionsForWait.process &&
      (optionsForWait.process.exitCode !== null ||
        optionsForWait.process.signalCode !== null)
    ) {
      throw new Error(
        `${optionsForWait.label} exited before it became reachable.`
      );
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(750);
  }

  throw new Error(
    `${optionsForWait.label} did not become reachable at ${url}: ${String(
      lastError
    )}`
  );
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function captureBrowserEvidence(serverURL, artifactDir) {
  const webRequire = createRequire(
    resolve(rootDir, 'internal', 'web', 'package.json')
  );
  const { chromium } = webRequire('playwright');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const tracePath = resolve(artifactDir, 'playwright-trace.zip');
  await context.tracing.start({ screenshots: true, snapshots: true });
  try {
    const page = await context.newPage();
    await page.goto(serverURL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.screenshot({
      fullPage: true,
      path: resolve(artifactDir, 'yyork-dashboard.png'),
    });
    writeFileSync(
      resolve(artifactDir, 'browser-page.json'),
      `${JSON.stringify({ title: await page.title(), url: page.url() }, null, 2)}\n`
    );
  } finally {
    await context.tracing.stop({ path: tracePath });
    await browser.close();
  }
}

function parseJSONFromStdout(stdout, label) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `${label} did not write a JSON object to stdout:\n${stdout}`
    );
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

function assertBundledZellij(doctorJSON) {
  const zellij = doctorJSON.checks?.find((check) => check.id === 'zellij');
  if (zellij?.status !== 'ok' || zellij?.source !== 'bundled') {
    throw new Error(`Expected bundled zellij, got ${JSON.stringify(zellij)}.`);
  }
}

function spawnLogged(command, args, spawnOptions) {
  mkdirSync(dirname(spawnOptions.logPath), { recursive: true });
  const child = spawn(command, args, {
    cwd: spawnOptions.cwd,
    detached: spawnOptions.detached ?? false,
    env: spawnOptions.env,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  const append = (chunk) => {
    const text = String(chunk);
    log.push(text);
    writeFileSync(spawnOptions.logPath, log.join(''));
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  child.on('error', append);
  return child;
}

async function runLogged(command, args, runOptions) {
  mkdirSync(dirname(runOptions.logPath), { recursive: true });
  const child = spawn(command, args, {
    cwd: runOptions.cwd,
    env: runOptions.env,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let stdout = '';
  let stderr = '';
  const append = (chunk, stream) => {
    const text = String(chunk);
    output += text;
    if (stream === 'stdout') {
      stdout += text;
    } else {
      stderr += text;
    }
    writeFileSync(runOptions.logPath, output);
  };

  const result = await new Promise((resolvePromise, reject) => {
    child.stdout?.on('data', (chunk) => {
      append(chunk, 'stdout');
    });
    child.stderr?.on('data', (chunk) => {
      append(chunk, 'stderr');
    });
    child.on('error', reject);
    child.on('close', (status, signal) => {
      resolvePromise({ signal, status, stderr, stdout });
    });
  });

  if (!runOptions.allowFailure && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}.\n${tail(
        `${result.stdout}${result.stderr}`
      )}`
    );
  }
  return result;
}

async function killProcessTree(child) {
  if (!child.pid || child.exitCode !== null) {
    return;
  }
  const closed = new Promise((resolvePromise) => {
    child.once('close', resolvePromise);
  });
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (_error) {
      child.kill('SIGTERM');
    }
  }
  await Promise.race([closed, sleep(5_000)]);
}

function tail(text) {
  return text.trim().split('\n').slice(-60).join('\n');
}
