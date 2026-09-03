import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as sharedBrowser from './shared-browser.mjs';
import {
  chromeLaunchArgs,
  discoverSharedBrowser,
  normalizeCdpEndpoint,
  playwrightAttachArgs,
  rewriteAgentBrowserArgs,
} from './shared-browser.mjs';

test('normalizes ports and browser WebSocket URLs to an HTTP CDP base', () => {
  assert.equal(normalizeCdpEndpoint('9333'), 'http://127.0.0.1:9333');
  assert.equal(
    normalizeCdpEndpoint('ws://localhost:9222/devtools/browser/browser-id'),
    'http://localhost:9222'
  );
});

test('shared Chrome launch always uses a dedicated profile and loopback CDP', () => {
  const args = chromeLaunchArgs({
    port: 9333,
    profileDir: '/tmp/yyork-automation-profile',
  });
  assert.ok(args.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(args.includes('--remote-debugging-port=9333'));
  assert.ok(args.includes('--user-data-dir=/tmp/yyork-automation-profile'));
  assert.equal(
    args.some((arg) => arg.includes('Default')),
    false
  );
});

test('discovers the active d3k endpoint through d3k cdp-port', async () => {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'status') {
      return {
        status: 0,
        stdout: JSON.stringify({
          running: true,
          ready: true,
          browserConnected: true,
          appUrl: 'https://yyork.localhost',
        }),
        stderr: '',
      };
    }
    return { status: 0, stdout: '9444\n', stderr: '' };
  };
  const fetchImpl = async () => ({ ok: true });

  const shared = await discoverSharedBrowser({ env: {}, run, fetchImpl });
  assert.equal(shared.endpoint, 'http://127.0.0.1:9444');
  assert.equal(shared.source, 'd3k');
  assert.deepEqual(calls, [
    ['d3k', 'status', '--json'],
    ['d3k', 'cdp-port'],
  ]);
});

test('rejects an explicit endpoint that would split tools from d3k', async () => {
  const run = (_command, args) => {
    if (args[0] === 'status') {
      return {
        status: 0,
        stdout: JSON.stringify({
          running: true,
          ready: true,
          browserConnected: true,
        }),
        stderr: '',
      };
    }
    return { status: 0, stdout: '9222\n', stderr: '' };
  };
  await assert.rejects(
    discoverSharedBrowser({
      env: { YYORK_SHARED_CDP_ENDPOINT: 'http://127.0.0.1:9333' },
      run,
      fetchImpl: async () => ({ ok: true }),
    }),
    /does not match d3k/
  );
});

test('agent-browser open and close stay inside the reserved tab', () => {
  assert.deepEqual(
    rewriteAgentBrowserArgs(['open', 'https://yyork.localhost']),
    ['navigate', 'https://yyork.localhost']
  );
  assert.deepEqual(rewriteAgentBrowserArgs(['close'], 'agent-tab'), [
    'tab',
    'close',
    'agent-tab',
  ]);
  assert.throws(
    () => rewriteAgentBrowserArgs(['tab', 't1']),
    /owns tab selection/
  );
});

test('Playwright attaches by CDP without also supplying a browser name', () => {
  assert.deepEqual(playwrightAttachArgs('9222', 'yyork-playwright'), [
    'attach',
    '--cdp',
    'http://127.0.0.1:9222',
    '--session',
    'yyork-playwright',
  ]);
});

test('Yyoreel wrapper opts into external CDP without changing the parent environment', () => {
  assert.equal(typeof sharedBrowser.sharedYyoreelEnv, 'function');
  const parent = { KEEP: 'yes' };
  const child = sharedBrowser.sharedYyoreelEnv('9222', parent);
  assert.deepEqual(parent, { KEEP: 'yes' });
  assert.equal(child.KEEP, 'yes');
  assert.equal(child.YYOREEL_CDP_ENDPOINT, 'http://127.0.0.1:9222');
  assert.equal(child.WEBREEL_CDP_ENDPOINT, undefined);
});

test('Yyoreel wrapper invokes the installed CLI through pnpm exec', () => {
  assert.equal(typeof sharedBrowser.yyoreelExecArgs, 'function');
  assert.deepEqual(sharedBrowser.yyoreelExecArgs(['record', 'smoke']), [
    'exec',
    'yyoreel',
    'record',
    'smoke',
  ]);
});

test('package scripts expose Yyoreel as the shared-browser recorder', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  );
  assert.equal(
    packageJson.scripts['browser:yyoreel'],
    'node ./scripts/shared-browser.mjs yyoreel'
  );
  assert.equal(packageJson.scripts['browser:webreel'], undefined);
});
