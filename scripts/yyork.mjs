#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveDevConfig, UsageError } from './yyork-config.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliArgs = process.argv.slice(2);
if (cliArgs.length === 1 && (cliArgs[0] === '--help' || cliArgs[0] === '-h')) {
  printHelp();
  process.exit(0);
}
if (
  cliArgs.length === 1 &&
  (cliArgs[0] === '--version' || cliArgs[0] === '-v')
) {
  printVersion();
  process.exit(0);
}
if (cliArgs.length > 0) {
  if (cliArgs[0].startsWith('-')) {
    exitWithUsageError(`Unknown option: ${cliArgs[0]}`);
  }
  runBackendCLI(cliArgs);
}

const webDir = resolve(rootDir, 'web');
let devConfig;
try {
  devConfig = resolveDevConfig({ env: process.env, webDir });
} catch (error) {
  if (error instanceof UsageError) {
    exitWithUsageError(error.message);
  }

  throw error;
}
const { backendHost } = devConfig;
const backendPort = await findAvailablePort(devConfig.backendPort, backendHost);
const webPort = await findAvailableWebPort(devConfig.webPort);
const backendOrigin = `http://${backendHost}:${backendPort}`;
const webOrigin = `http://localhost:${webPort}`;

const backend = startBackend(backendHost, backendPort);
const web = spawn('pnpm', ['--dir', 'web', 'dev'], {
  cwd: rootDir,
  env: {
    ...process.env,
    VITE_BACKEND_ORIGIN: backendOrigin,
    VITE_PORT: String(webPort),
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

printStartupBanner({ backendOrigin, webOrigin });

let shuttingDown = false;
const children = [backend, web];

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal));
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const other of children) {
      if (other !== child) {
        other.kill('SIGTERM');
      }
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function startBackend(host, port) {
  const backendArgs = [
    'run',
    './cmd/yyork',
    '--addr',
    `${host}:${port}`,
    '--open=false',
  ];

  if (hasCommand('go', ['version'])) {
    return spawn('go', backendArgs, {
      cwd: rootDir,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
  }

  if (process.platform !== 'win32' && hasCommand('nix', ['--version'])) {
    return spawn('nix', ['develop', '--command', 'go', ...backendArgs], {
      cwd: rootDir,
      stdio: 'inherit',
    });
  }

  console.error(
    'Unable to start the backend: install Go or run from a Nix dev shell.'
  );
  process.exit(1);
}

function runBackendCLI(args) {
  const backendArgs = ['run', './cmd/yyork', ...args];
  if (hasCommand('go', ['version'])) {
    const result = spawnSync('go', backendArgs, {
      cwd: rootDir,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
    process.exit(result.status ?? 1);
  }

  const builtBackend = resolve(rootDir, 'yyork');
  if (existsSync(builtBackend)) {
    const result = spawnSync(builtBackend, args, {
      cwd: rootDir,
      stdio: 'inherit',
    });
    process.exit(result.status ?? 1);
  }

  if (process.platform !== 'win32' && hasCommand('nix', ['--version'])) {
    const result = spawnSync(
      'nix',
      ['develop', '--command', 'go', ...backendArgs],
      {
        cwd: rootDir,
        stdio: 'inherit',
      }
    );
    process.exit(result.status ?? 1);
  }

  console.error(
    'Unable to run the CLI: install Go or run from a Nix dev shell.'
  );
  process.exit(1);
}

function hasCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0;
}

// Vite-style highlighted banner for the two dev origins. Mirrors the Go
// backend's banner (internal/logging). Color is enabled on a TTY and
// suppressed when NO_COLOR is set or output is piped.
function printStartupBanner({ backendOrigin, webOrigin }) {
  const color = Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env);
  const paint = (codes, text) =>
    color ? `\u001b[${codes}m${text}\u001b[0m` : text;

  const badge = paint('1;30;48;5;212', ' yyork ');
  const arrow = paint('38;5;212', '➜');
  const label = (text) => paint('38;5;241', text.padEnd(7));
  const value = (text) => paint('4;38;5;86', text);

  process.stdout.write(`\n  ${badge}\n`);
  process.stdout.write(`  ${arrow}  ${label('web')}  ${value(webOrigin)}\n`);
  process.stdout.write(
    `  ${arrow}  ${label('backend')}  ${value(backendOrigin)}\n\n`
  );
}

function exitWithUsageError(message) {
  console.error(message);
  console.error('Run yyork --help for usage.');
  process.exit(1);
}

function printHelp() {
  console.log(`yyork

Start the local yyork dashboard and API/terminal server.

Usage:
  yyork
  pnpm dev

Environment:
  YYORK_BACKEND_HOST  Backend bind host. Default: 127.0.0.1
  YYORK_BACKEND_PORT  Preferred backend port. Default: 7331
  VITE_PORT               Preferred web port. Default: web/.env or 3000

Options:
  -h, --help     Show this help text.
  -v, --version  Show package version.
`);
}

function printVersion() {
  const packageJSON = JSON.parse(
    readFileSync(resolve(rootDir, 'package.json'))
  );
  console.log(packageJSON.version);
}

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    child.kill(signal);
  }
}

async function findAvailablePort(startPort, host) {
  for (let port = startPort; port < startPort + 100; port++) {
    if (await canListen(port, host)) {
      return port;
    }
  }

  throw new Error(`No available backend port found from ${startPort}`);
}

async function findAvailableWebPort(startPort) {
  for (let port = startPort; port < startPort + 100; port++) {
    if (
      (await canListen(port, '127.0.0.1')) &&
      (await canListen(port, '::1', { ignoreUnavailableHost: true }))
    ) {
      return port;
    }
  }

  throw new Error(`No available web port found from ${startPort}`);
}

function canListen(port, host, options = {}) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once('error', (error) => {
      if (
        options.ignoreUnavailableHost &&
        (error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT')
      ) {
        resolvePort(true);
        return;
      }

      resolvePort(false);
    });
    server.once('listening', () => {
      server.close(() => resolvePort(true));
    });
    server.listen({ host, port });
  });
}
