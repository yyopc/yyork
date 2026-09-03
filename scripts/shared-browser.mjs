#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_SHARED_CDP_PORT = 9222;
export const DEFAULT_AGENT_BROWSER_SESSION = 'yyork-shared-agent-browser';
export const DEFAULT_AGENT_BROWSER_TAB = 'yyork-agent-browser';
export const DEFAULT_PLAYWRIGHT_SESSION = 'yyork-shared-playwright';
export const DEFAULT_PLAYWRIGHT_TAB_URL =
  'https://yyork.localhost?yyorkTool=playwright-cli';

export function normalizeCdpEndpoint(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    throw new Error('CDP endpoint is empty.');
  }

  const candidate = /^\d+$/.test(raw) ? `http://127.0.0.1:${raw}` : raw;
  const url = new URL(candidate);
  if (url.protocol === 'ws:') url.protocol = 'http:';
  if (url.protocol === 'wss:') url.protocol = 'https:';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported CDP endpoint protocol: ${url.protocol}`);
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.origin;
}

export function sharedProfileDir(env = process.env) {
  return resolve(
    env.YYORK_SHARED_CHROME_PROFILE ||
      join(homedir(), '.yyork', 'browser', 'shared-cdp-profile')
  );
}

export function chromeLaunchArgs({ port, profileDir }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid YYORK_SHARED_CDP_PORT: ${port}`);
  }
  if (!profileDir) {
    throw new Error('A dedicated Chrome profile directory is required.');
  }

  return [
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${resolve(profileDir)}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--new-window',
    'about:blank',
  ];
}

function commandResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'pipe',
  });
}

function commandOutput(command, args, options = {}) {
  const result = (options.run ?? commandResult)(command, args, options);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(
      `${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`
    );
  }
  return String(result.stdout ?? '').trim();
}

async function endpointIsReady(endpoint, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(new URL('/json/version', endpoint), {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function discoverD3kBrowser({ env, run, fetchImpl }) {
  const statusResult = run('d3k', ['status', '--json'], { env });
  if (statusResult.status === 0) {
    try {
      const status = JSON.parse(String(statusResult.stdout || '{}'));
      if (status.running && status.ready && status.browserConnected) {
        const port = commandOutput('d3k', ['cdp-port'], { env, run });
        const endpoint = normalizeCdpEndpoint(port);
        if (!(await endpointIsReady(endpoint, fetchImpl))) {
          throw new Error(
            `d3k reported an unreachable CDP endpoint: ${endpoint}`
          );
        }
        return {
          endpoint,
          source: 'd3k',
          appUrl: status.appUrl,
          profile: 'd3k project profile',
        };
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('d3k status --json returned invalid JSON.', {
          cause: error,
        });
      }
      throw error;
    }
  }

  return null;
}

export async function discoverSharedBrowser(options = {}) {
  const env = options.env ?? process.env;
  const run = options.run ?? commandResult;
  const fetchImpl = options.fetchImpl ?? fetch;
  const d3kBrowser = await discoverD3kBrowser({ env, run, fetchImpl });

  if (env.YYORK_SHARED_CDP_ENDPOINT) {
    const endpoint = normalizeCdpEndpoint(env.YYORK_SHARED_CDP_ENDPOINT);
    if (!(await endpointIsReady(endpoint, fetchImpl))) {
      throw new Error(
        `YYORK_SHARED_CDP_ENDPOINT is not reachable: ${endpoint}`
      );
    }
    if (d3kBrowser && d3kBrowser.endpoint !== endpoint) {
      throw new Error(
        `YYORK_SHARED_CDP_ENDPOINT (${endpoint}) does not match d3k (${d3kBrowser.endpoint}). Stop or reconfigure d3k before selecting a different browser.`
      );
    }
    return d3kBrowser ?? { endpoint, source: 'environment' };
  }

  if (d3kBrowser) return d3kBrowser;

  throw new Error(
    'No shared browser is ready. Run `pnpm browser:shared:start` or set YYORK_SHARED_CDP_ENDPOINT.'
  );
}

function findExecutableOnPath(name, env = process.env) {
  const lookup = commandResult(
    platform() === 'win32' ? 'where' : 'which',
    [name],
    { env }
  );
  if (lookup.status !== 0) return null;
  return String(lookup.stdout).trim().split(/\r?\n/, 1)[0] || null;
}

export function findSharedChrome(env = process.env) {
  if (env.YYORK_SHARED_CHROME_PATH) {
    const configured = resolve(env.YYORK_SHARED_CHROME_PATH);
    if (!existsSync(configured)) {
      throw new Error(`YYORK_SHARED_CHROME_PATH does not exist: ${configured}`);
    }
    return configured;
  }

  const candidates =
    platform() === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : platform() === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
          ];

  const fileCandidate = candidates.find((candidate) => existsSync(candidate));
  if (fileCandidate) return fileCandidate;

  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium']) {
    const executable = findExecutableOnPath(name, env);
    if (executable) return executable;
  }

  throw new Error(
    'No Chrome-compatible browser was found. Set YYORK_SHARED_CHROME_PATH; this workflow never installs a browser.'
  );
}

function metadataPath(profileDir) {
  return join(profileDir, 'yyork-shared-browser.json');
}

function readOwnedBrowser(profileDir) {
  try {
    return JSON.parse(readFileSync(metadataPath(profileDir), 'utf8'));
  } catch {
    return null;
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForEndpoint(endpoint, child, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Shared Chrome exited before CDP became ready (code ${child.exitCode}).`
      );
    }
    if (await endpointIsReady(endpoint)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }
  throw new Error(`Timed out waiting for shared Chrome at ${endpoint}.`);
}

async function ensureExternalChrome(env = process.env) {
  const port = Number(env.YYORK_SHARED_CDP_PORT || DEFAULT_SHARED_CDP_PORT);
  const endpoint = normalizeCdpEndpoint(port);
  const profileDir = sharedProfileDir(env);
  const owned = readOwnedBrowser(profileDir);

  if (await endpointIsReady(endpoint)) {
    if (
      owned &&
      processIsAlive(owned.pid) &&
      normalizeCdpEndpoint(owned.endpoint) === endpoint &&
      resolve(owned.profileDir) === profileDir
    ) {
      return { endpoint, pid: owned.pid, profileDir, reused: true };
    }
    throw new Error(
      `${endpoint} is already in use by a browser this repo did not start. Set YYORK_SHARED_CDP_PORT to another port rather than attaching implicitly.`
    );
  }

  mkdirSync(profileDir, { recursive: true });
  const executable = findSharedChrome(env);
  const child = spawn(executable, chromeLaunchArgs({ port, profileDir }), {
    detached: true,
    env,
    stdio: 'ignore',
  });
  child.unref();
  await waitForEndpoint(endpoint, child);

  const metadata = {
    endpoint,
    executable,
    pid: child.pid,
    profileDir,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(
    metadataPath(profileDir),
    `${JSON.stringify(metadata, null, 2)}\n`,
    {
      mode: 0o600,
    }
  );
  return { endpoint, pid: child.pid, profileDir, reused: false };
}

function runInteractive(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: options.env ?? process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited from signal ${signal}.`));
      } else if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} exited with code ${code}.`));
      }
    });
  });
}

async function runD3kWithExternalBrowser(endpoint, env) {
  await runInteractive(
    'd3k',
    [
      '--no-agent',
      '--no-tui',
      '-t',
      '--no-portless',
      '--command',
      'pnpm run dev',
      '--app-url',
      'https://yyork.localhost',
      '--startup-timeout',
      '120',
      '--external-cdp-base',
      endpoint,
    ],
    { env }
  );
}

async function startOrSelectSharedBrowser(env = process.env) {
  try {
    const shared = await discoverSharedBrowser({ env });
    if (shared.source === 'd3k') {
      console.log(JSON.stringify({ ...shared, selected: true }, null, 2));
      return;
    }
    console.log(
      JSON.stringify({ ...shared, selected: true, attachingD3k: true }, null, 2)
    );
    await runD3kWithExternalBrowser(shared.endpoint, env);
    return;
  } catch (error) {
    if (
      env.YYORK_SHARED_CDP_ENDPOINT ||
      !String(error instanceof Error ? error.message : error).startsWith(
        'No shared browser is ready.'
      )
    ) {
      throw error;
    }
  }

  const external = await ensureExternalChrome(env);
  console.log(
    JSON.stringify(
      {
        endpoint: external.endpoint,
        pid: external.pid,
        profileDir: external.profileDir,
        reused: external.reused,
        source: 'yyork dedicated external profile',
      },
      null,
      2
    )
  );

  await runD3kWithExternalBrowser(external.endpoint, env);
}

function agentBrowserBaseArgs(endpoint, env = process.env) {
  return [
    '--session',
    env.YYORK_AGENT_BROWSER_SESSION || DEFAULT_AGENT_BROWSER_SESSION,
    '--cdp',
    endpoint,
  ];
}

export function rewriteAgentBrowserArgs(
  args,
  label = DEFAULT_AGENT_BROWSER_TAB
) {
  if (args.length === 0) return ['tab'];
  const [command, ...rest] = args;
  if (command === 'open') return ['navigate', ...rest];
  if (command === 'close') return ['tab', 'close', label];
  if (command === 'connect' || command === 'window' || command === 'tab') {
    throw new Error(
      `The shared agent-browser wrapper owns tab selection; "${command}" is not allowed here.`
    );
  }
  return args;
}

async function runAgentBrowser(args, env = process.env) {
  const { endpoint } = await discoverSharedBrowser({ env });
  const label = env.YYORK_AGENT_BROWSER_TAB || DEFAULT_AGENT_BROWSER_TAB;
  const base = agentBrowserBaseArgs(endpoint, env);
  const select = commandResult('agent-browser', [...base, 'tab', label], {
    env,
  });
  if (select.status !== 0) {
    commandOutput(
      'agent-browser',
      [...base, 'tab', 'new', '--label', label, 'about:blank'],
      {
        env,
      }
    );
  }
  await runInteractive(
    'agent-browser',
    [...base, ...rewriteAgentBrowserArgs(args, label)],
    { env }
  );
}

function playwrightCli(env = process.env) {
  const configured = env.PLAYWRIGHT_CLI_BIN || env.PWCLI;
  if (configured) {
    const resolved = resolve(configured);
    if (!existsSync(resolved)) {
      throw new Error(`Configured Playwright CLI does not exist: ${resolved}`);
    }
    return resolved;
  }
  const installed = findExecutableOnPath('playwright-cli', env);
  if (installed) return installed;
  throw new Error(
    'playwright-cli is not on PATH. Set PLAYWRIGHT_CLI_BIN to the already-installed CLI; this workflow never installs it.'
  );
}

export function playwrightAttachArgs(endpoint, session) {
  return [
    'attach',
    '--cdp',
    normalizeCdpEndpoint(endpoint),
    '--session',
    session,
  ];
}

async function attachPlaywright(env = process.env) {
  const { endpoint } = await discoverSharedBrowser({ env });
  const cli = playwrightCli(env);
  const session = env.PLAYWRIGHT_CLI_SESSION || DEFAULT_PLAYWRIGHT_SESSION;
  const url = env.YYORK_PLAYWRIGHT_TAB_URL || DEFAULT_PLAYWRIGHT_TAB_URL;
  await runInteractive(cli, playwrightAttachArgs(endpoint, session), { env });
  try {
    await runInteractive(cli, [`-s=${session}`, 'tab-new', url], { env });
  } catch (error) {
    commandResult(cli, [`-s=${session}`, 'detach'], { env });
    throw error;
  }
  console.log(
    `Playwright CLI session "${session}" is attached. Keep its new active tab dedicated to Playwright.`
  );
}

async function detachPlaywright(env = process.env) {
  const cli = playwrightCli(env);
  const session = env.PLAYWRIGHT_CLI_SESSION || DEFAULT_PLAYWRIGHT_SESSION;
  await runInteractive(cli, [`-s=${session}`, 'tab-close'], { env });
  await runInteractive(cli, [`-s=${session}`, 'detach'], { env });
}

export function sharedYyoreelEnv(endpoint, env = process.env) {
  return { ...env, YYOREEL_CDP_ENDPOINT: normalizeCdpEndpoint(endpoint) };
}

export function yyoreelExecArgs(args) {
  return ['exec', 'yyoreel', ...args];
}

async function runYyoreel(args, env = process.env) {
  const { endpoint } = await discoverSharedBrowser({ env });
  await runInteractive('pnpm', yyoreelExecArgs(args), {
    env: sharedYyoreelEnv(endpoint, env),
  });
}

async function showStatus(env = process.env) {
  const shared = await discoverSharedBrowser({ env });
  const version = await fetch(new URL('/json/version', shared.endpoint)).then(
    (response) => response.json()
  );
  console.log(
    JSON.stringify(
      {
        ...shared,
        browser: version.Browser,
        webSocketDebuggerUrl: version.webSocketDebuggerUrl,
      },
      null,
      2
    )
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const forwardedArgs = args[0] === '--' ? args.slice(1) : args;
  switch (command) {
    case 'start':
      await startOrSelectSharedBrowser();
      break;
    case 'status':
      await showStatus();
      break;
    case 'endpoint': {
      const shared = await discoverSharedBrowser();
      process.stdout.write(`${shared.endpoint}\n`);
      break;
    }
    case 'agent-browser':
      await runAgentBrowser(forwardedArgs);
      break;
    case 'playwright-attach':
      await attachPlaywright();
      break;
    case 'playwright-detach':
      await detachPlaywright();
      break;
    case 'yyoreel':
      await runYyoreel(forwardedArgs);
      break;
    default:
      throw new Error(
        'Usage: shared-browser.mjs <start|status|endpoint|agent-browser|playwright-attach|playwright-detach|yyoreel>'
      );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
