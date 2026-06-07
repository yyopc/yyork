import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(webDir, '..');
const stackTimeoutMs = Number(
  process.env.LIVE_TERMINAL_STACK_TIMEOUT_MS ?? 90_000
);
const terminalTimeoutMs = Number(
  process.env.LIVE_TERMINAL_TIMEOUT_MS ?? 20_000
);
const isReconnectMode = process.argv.includes('--reconnect');
const isSoakMode = process.argv.includes('--soak');
const isSwitchMode = process.argv.includes('--switch');
const isHeadedMode = process.argv.includes('--headed');
const shouldHoldOpen = process.argv.includes('--hold');
const reconnectCycles = numberOption(
  '--reconnects',
  Number(process.env.LIVE_TERMINAL_RECONNECTS ?? 1)
);
const soakDurationMs = numberOption(
  '--soak-ms',
  Number(process.env.LIVE_TERMINAL_SOAK_MS ?? 60_000)
);
const switchTargetID = stringOption(
  '--switch-target',
  process.env.LIVE_TERMINAL_SWITCH_TARGET
);
const holdDurationMs = numberOption(
  '--hold-ms',
  Number(process.env.LIVE_TERMINAL_HOLD_MS ?? 15_000)
);
const slowMoMs = numberOption(
  '--slow-mo-ms',
  Number(process.env.LIVE_TERMINAL_SLOW_MO_MS ?? (isHeadedMode ? 150 : 0))
);
const requestedBackendPort = portOption(
  '--backend-port',
  process.env.YYORK_BACKEND_PORT
);
const requestedWebPort = portOption('--web-port', process.env.VITE_PORT);
const shouldReuseRunningStack = process.argv.includes('--reuse-running');
const reusedBackendOrigin = stringOption(
  '--backend-origin',
  process.env.LIVE_TERMINAL_BACKEND_ORIGIN ?? 'http://127.0.0.1:7331'
);
const reusedWebOrigin = stringOption(
  '--web-origin',
  process.env.LIVE_TERMINAL_WEB_ORIGIN ?? 'http://localhost:3000'
);
const runMode = liveTerminalRunMode();

validateLiveTerminalOptions();
const stack = shouldReuseRunningStack
  ? reusedStack()
  : startOwnedStack(await chooseStackPorts());
let browser;

try {
  reportRunStart();

  const { backendOrigin, webOrigin } = await stack.origins();
  reportStackOrigins({ backendOrigin, webOrigin });
  await waitForHealthyEndpoint(new URL('/api/health', backendOrigin));

  const workspace = await readWorkspace(backendOrigin);
  const selectedSession = selectTerminalSession(workspace);
  reportSelectedSession('selected', selectedSession);

  browser = await chromium.launch({
    headless: !isHeadedMode,
    slowMo: slowMoMs > 0 ? slowMoMs : undefined,
  });
  const attachment = await openTerminalAttachment(
    browser,
    webOrigin,
    selectedSession
  );
  const resizeResult = await resizeTerminalAttachment(
    attachment.page,
    attachment.terminalSocket,
    selectedSession
  );

  const soakResult = isSoakMode
    ? await soakTerminalAttachment(
        attachment.page,
        attachment.terminalSockets,
        selectedSession
      )
    : undefined;

  const switchResult = isSwitchMode
    ? await switchTerminalAttachment(
        attachment.page,
        attachment.terminalSockets,
        selectedSession,
        selectSwitchTarget(workspace, selectedSession)
      )
    : undefined;

  if (isReconnectMode) {
    await attachment.page.close();
    verifyRuntimeStillAlive(selectedSession);
  }

  const reconnectAttachment = isReconnectMode
    ? await reconnectTerminalAttachment(browser, webOrigin, selectedSession, {
        leaveLastOpen: shouldHoldOpen,
      })
    : undefined;
  const reconnectResult = reconnectAttachment?.result;

  if (attachment.pageErrors.length > 0) {
    throw new Error(
      `Browser page errors:\n${attachment.pageErrors.join('\n')}`
    );
  }

  const holdPage = reconnectAttachment?.holdPage ?? attachment.page;
  if (shouldHoldOpen && !holdPage.isClosed()) {
    await holdOpenPage(holdPage);
  }

  if (!attachment.page.isClosed()) {
    await attachment.page.close();
  }
  if (
    reconnectAttachment?.holdPage &&
    !reconnectAttachment.holdPage.isClosed()
  ) {
    await reconnectAttachment.holdPage.close();
  }
  await browser.close();
  browser = undefined;

  verifyRuntimeStillAlive(selectedSession);

  console.log(
    JSON.stringify(
      {
        activeProjectId: workspace.activeProjectId,
        headed: isHeadedMode,
        holdMs: shouldHoldOpen ? holdDurationMs : undefined,
        mode: runMode,
        receivedFrames: attachment.terminalSocket.received,
        reconnect: reconnectResult,
        resize: resizeResult,
        sentFrames: attachment.terminalSocket.sent,
        soak: soakResult,
        switch: switchResult,
        sessionId: selectedSession.id,
        terminalUrl: attachment.terminalSocket.url,
        workerId: selectedSession.workerId,
        zellijSession: selectedSession.zellijSession,
      },
      null,
      2
    )
  );
} finally {
  if (browser) {
    await browser.close();
  }
  await stack.stop();
}

async function openTerminalAttachment(browser, webOrigin, selectedSession) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const pageErrors = [];
  const terminalSockets = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  page.on('websocket', (socket) => {
    if (!socket.url().includes('/api/sessions/')) {
      return;
    }

    const terminalSocket = {
      closed: false,
      received: 0,
      sent: 0,
      sentPayloads: [],
      url: socket.url(),
    };

    terminalSockets.push(terminalSocket);
    socket.on('framesent', (frame) => {
      terminalSocket.sent += 1;
      terminalSocket.sentPayloads.push(decodeFramePayload(frame.payload));
    });
    socket.on('framereceived', () => {
      terminalSocket.received += 1;
    });
    socket.on('close', () => {
      terminalSocket.closed = true;
    });
  });

  const frontendWorkspaceResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/sessions' &&
      response.status() === 200,
    { timeout: terminalTimeoutMs }
  );
  await page.goto(webOrigin, { waitUntil: 'domcontentloaded' });
  await frontendWorkspaceResponse;

  const selectedWorkerButton = workerButtonLocator(page, selectedSession);
  await selectedWorkerButton.waitFor({
    state: 'visible',
    timeout: terminalTimeoutMs,
  });

  if (!selectedSession.selected) {
    await selectedWorkerButton.evaluate((el) => el.click());
  }
  await page.getByRole('tab', { name: 'Terminal' }).click();
  await page
    .locator('section[aria-label$="terminal panel"]')
    .getByRole('textbox')
    .waitFor({ state: 'visible', timeout: terminalTimeoutMs });

  const terminalSocket = await waitForTerminalSocket(
    terminalSockets,
    selectedSession
  );
  assertTerminalSocket(terminalSocket, selectedSession);
  await waitForSocketFrames(terminalSocket);

  return {
    page,
    pageErrors,
    terminalSocket,
    terminalSockets,
  };
}

function reusedStack() {
  return {
    owned: false,
    async origins() {
      return {
        backendOrigin: reusedBackendOrigin,
        webOrigin: reusedWebOrigin,
      };
    },
    async stop() {},
  };
}

function startOwnedStack(ports) {
  const child = spawn(process.execPath, ['./scripts/yyork.mjs'], {
    cwd: rootDir,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      YYORK_BACKEND_PORT: String(ports.backendPort),
      VITE_PORT: String(ports.webPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    owned: true,
    ports,
    origins() {
      return waitForStackOrigins(child);
    },
    async stop() {
      await stopStack(child);
    },
  };
}

function waitForStackOrigins(child) {
  return new Promise((resolveOrigins, rejectOrigins) => {
    let backendOrigin;
    let settled = false;
    let webOrigin;
    let output = '';

    const timeout = setTimeout(() => {
      fail(
        new Error(
          `Timed out waiting for yyork stack origins.\n\n${output.trim()}`
        )
      );
    }, stackTimeoutMs);

    const fail = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      rejectOrigins(error);
    };

    const maybeResolve = () => {
      if (settled || !backendOrigin || !webOrigin) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolveOrigins({ backendOrigin, webOrigin });
    };

    const capture = (chunk, stream) => {
      const text = chunk.toString();
      output += text;
      stream.write(text);

      const backendMatch = text.match(/yyork backend:\s*(\S+)/);
      if (backendMatch) {
        backendOrigin = backendMatch[1];
      }

      const webMatch = text.match(/yyork web:\s*(\S+)/);
      if (webMatch) {
        webOrigin = webMatch[1];
      }

      maybeResolve();
    };

    child.stdout.on('data', (chunk) => capture(chunk, process.stdout));
    child.stderr.on('data', (chunk) => capture(chunk, process.stderr));
    child.on('error', fail);
    child.on('exit', (code, signal) => {
      if (settled) {
        return;
      }

      fail(
        new Error(
          `yyork stack exited before it was ready: code=${code} signal=${signal}\n\n${output.trim()}`
        )
      );
    });
  });
}

async function waitForHealthyEndpoint(url) {
  const deadline = Date.now() + stackTimeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        return;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function readWorkspace(backendOrigin) {
  const response = await fetch(new URL('/api/workspace', backendOrigin));
  if (!response.ok) {
    throw new Error(`Workspace request failed with ${response.status}`);
  }

  return response.json();
}

function selectTerminalSession(workspace) {
  const sessions = workspace.sessions ?? [];
  const selectedSession = sessions.find(
    (session) => session.selected && session.terminalSupported
  );
  const fallbackSession = sessions.find((session) => session.terminalSupported);
  const session = selectedSession ?? fallbackSession;

  if (!session) {
    throw new Error('No terminal-supported AO worker sessions are active.');
  }

  return session;
}

function selectSwitchTarget(workspace, selectedSession) {
  const session = selectSwitchSession(workspace, selectedSession);
  reportSelectedSession('switch target', session);

  return session;
}

function selectSwitchSession(workspace, selectedSession) {
  const candidates = (workspace.sessions ?? []).filter((session) => {
    if (!session.terminalSupported) {
      return false;
    }

    return (
      session.project !== selectedSession.project ||
      session.id !== selectedSession.id
    );
  });

  if (switchTargetID) {
    const requestedSession = candidates.find((session) => {
      return (
        session.id === switchTargetID || session.workerId === switchTargetID
      );
    });
    if (!requestedSession) {
      throw new Error(
        `LIVE_TERMINAL_SWITCH_TARGET=${switchTargetID} did not match another terminal-supported AO worker session.`
      );
    }

    return requestedSession;
  }

  const session = candidates[0];
  if (!session) {
    throw new Error(
      'Need at least two terminal-supported AO worker sessions for switch smoke.'
    );
  }

  return session;
}

async function waitForTerminalSocket(
  terminalSockets,
  selectedSession,
  startIndex = 0
) {
  const deadline = Date.now() + terminalTimeoutMs;

  while (Date.now() < deadline) {
    const socket = terminalSockets
      .slice(startIndex)
      .find((candidate) =>
        candidate.url.includes(`/api/sessions/${selectedSession.id}/terminal`)
      );
    if (socket) {
      return socket;
    }

    await sleep(100);
  }

  throw new Error(
    `Timed out waiting for terminal websocket for ${selectedSession.workerId}`
  );
}

function assertTerminalSocket(terminalSocket, selectedSession) {
  const socketUrl = new URL(terminalSocket.url);
  if (socketUrl.searchParams.get('project') !== selectedSession.project) {
    throw new Error(
      `Terminal websocket was not project-scoped: ${terminalSocket.url}`
    );
  }
}

async function waitForSocketFrames(terminalSocket) {
  const deadline = Date.now() + terminalTimeoutMs;

  while (Date.now() < deadline) {
    if (terminalSocket.sent > 0 && terminalSocket.received > 0) {
      return;
    }

    await sleep(100);
  }

  throw new Error(
    `Terminal websocket did not exchange frames: sent=${terminalSocket.sent} received=${terminalSocket.received}`
  );
}

async function resizeTerminalAttachment(page, terminalSocket, selectedSession) {
  return resizeTerminalAttachmentTo(page, terminalSocket, selectedSession, {
    width: 1024,
    height: 720,
  });
}

async function resizeTerminalAttachmentTo(
  page,
  terminalSocket,
  selectedSession,
  resizedViewport
) {
  const sentFramesBeforeResize = terminalSocket.sent;
  const viewportBeforeResize = page.viewportSize();

  await page.setViewportSize(resizedViewport);
  await page
    .locator('section[aria-label$="terminal panel"]')
    .getByRole('textbox')
    .waitFor({ state: 'visible', timeout: terminalTimeoutMs });
  const resizeFrame = await waitForResizeControlFrame(
    terminalSocket,
    sentFramesBeforeResize
  );
  verifyRuntimeStillAlive(selectedSession);

  return {
    resizeFrame,
    sentFramesAfterResize: terminalSocket.sent,
    sentFramesBeforeResize,
    viewportAfterResize: resizedViewport,
    viewportBeforeResize,
  };
}

async function waitForResizeControlFrame(terminalSocket, initialSentFrames) {
  const deadline = Date.now() + terminalTimeoutMs;

  while (Date.now() < deadline) {
    const resizeFrame = findResizeControlFrame(
      terminalSocket.sentPayloads.slice(initialSentFrames)
    );
    if (resizeFrame) {
      return resizeFrame;
    }

    await sleep(100);
  }

  throw new Error(
    `Terminal websocket did not send resize control after viewport change: before=${initialSentFrames} after=${terminalSocket.sent}`
  );
}

function findResizeControlFrame(payloads) {
  for (const payload of payloads) {
    if (typeof payload !== 'string') {
      continue;
    }

    try {
      const parsed = JSON.parse(payload);
      if (
        parsed.type === 'resize' &&
        typeof parsed.cols === 'number' &&
        parsed.cols > 0 &&
        typeof parsed.rows === 'number' &&
        parsed.rows > 0
      ) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function decodeFramePayload(payload) {
  if (typeof payload === 'string') {
    return payload;
  }

  if (payload instanceof Uint8Array) {
    return new TextDecoder().decode(payload);
  }

  return undefined;
}

async function soakTerminalAttachment(page, terminalSockets, selectedSession) {
  const startedAt = Date.now();
  const initialTerminalSocketCount = terminalSockets.length;
  const initialReceivedFrames = sumTerminalFrames(terminalSockets, 'received');
  const initialSentFrames = sumTerminalFrames(terminalSockets, 'sent');

  while (Date.now() - startedAt < soakDurationMs) {
    const closedTerminalSockets = terminalSockets.filter(
      (socket) => socket.closed
    );
    if (closedTerminalSockets.length > 0) {
      throw new Error(
        `Terminal websocket closed during soak: ${closedTerminalSockets
          .map((socket) => socket.url)
          .join(', ')}`
      );
    }

    const terminalPanel = page.locator('section[aria-label$="terminal panel"]');
    await terminalPanel
      .getByRole('textbox')
      .waitFor({ state: 'visible', timeout: terminalTimeoutMs });
    verifyRuntimeStillAlive(selectedSession);
    await sleep(1_000);
  }

  return {
    durationMs: Date.now() - startedAt,
    receivedFramesDuringSoak:
      sumTerminalFrames(terminalSockets, 'received') - initialReceivedFrames,
    sentFramesDuringSoak:
      sumTerminalFrames(terminalSockets, 'sent') - initialSentFrames,
    terminalSocketCountDelta:
      terminalSockets.length - initialTerminalSocketCount,
  };
}

async function switchTerminalAttachment(
  page,
  terminalSockets,
  fromSession,
  toSession
) {
  verifyRuntimeStillAlive(fromSession);
  verifyRuntimeStillAlive(toSession);

  const initialTerminalSocketCount = terminalSockets.length;
  const targetWorkerButton = workerButtonLocator(page, toSession);
  await targetWorkerButton.waitFor({
    state: 'visible',
    timeout: terminalTimeoutMs,
  });
  await targetWorkerButton.click();
  await page.getByRole('tab', { name: 'Terminal' }).click();
  await page
    .locator('section[aria-label$="terminal panel"]')
    .getByRole('textbox')
    .waitFor({ state: 'visible', timeout: terminalTimeoutMs });

  const terminalSocket = await waitForTerminalSocket(
    terminalSockets,
    toSession,
    initialTerminalSocketCount
  );
  assertTerminalSocket(terminalSocket, toSession);
  await waitForSocketFrames(terminalSocket);
  const resizeResult = await resizeTerminalAttachmentTo(
    page,
    terminalSocket,
    toSession,
    {
      width: 1200,
      height: 760,
    }
  );

  verifyRuntimeStillAlive(fromSession);
  verifyRuntimeStillAlive(toSession);

  return {
    fromWorkerId: fromSession.workerId,
    receivedFrames: terminalSocket.received,
    resize: resizeResult,
    sentFrames: terminalSocket.sent,
    terminalUrl: terminalSocket.url,
    toWorkerId: toSession.workerId,
  };
}

async function reconnectTerminalAttachment(
  browser,
  webOrigin,
  selectedSession,
  options = {}
) {
  const attempts = [];
  let holdPage;

  for (let cycle = 0; cycle < reconnectCycles; cycle += 1) {
    verifyRuntimeStillAlive(selectedSession);
    const attachment = await openTerminalAttachment(
      browser,
      webOrigin,
      selectedSession
    );

    if (attachment.pageErrors.length > 0) {
      throw new Error(
        `Reconnect browser page errors:\n${attachment.pageErrors.join('\n')}`
      );
    }
    const resizeResult = await resizeTerminalAttachment(
      attachment.page,
      attachment.terminalSocket,
      selectedSession
    );

    attempts.push({
      receivedFrames: attachment.terminalSocket.received,
      resize: resizeResult,
      sentFrames: attachment.terminalSocket.sent,
      terminalUrl: attachment.terminalSocket.url,
    });

    const isLastCycle = cycle === reconnectCycles - 1;
    if (options.leaveLastOpen && isLastCycle) {
      holdPage = attachment.page;
    } else {
      await attachment.page.close();
    }
    verifyRuntimeStillAlive(selectedSession);
  }

  return {
    holdPage,
    result: {
      attempts,
      cycles: reconnectCycles,
    },
  };
}

async function holdOpenPage(page) {
  await page
    .locator('section[aria-label$="terminal panel"]')
    .getByRole('textbox')
    .waitFor({ state: 'visible', timeout: terminalTimeoutMs });
  reportHoldOpen();
  await sleep(holdDurationMs);
}

async function chooseStackPorts() {
  const [backendPort, webPort] = await Promise.all([
    requestedBackendPort ?? randomOpenPort(),
    requestedWebPort ?? randomOpenPort(),
  ]);

  if (backendPort === webPort) {
    throw new Error('Backend and web ports must be different.');
  }

  return { backendPort, webPort };
}

function randomOpenPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();

    server.once('error', rejectPort);
    server.once('listening', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address) {
          resolvePort(address.port);
          return;
        }

        rejectPort(new Error('Could not allocate a random open port.'));
      });
    });
    server.listen(0, '127.0.0.1');
  });
}

function sumTerminalFrames(terminalSockets, key) {
  return terminalSockets.reduce((sum, terminalSocket) => {
    return sum + terminalSocket[key];
  }, 0);
}

function workerButtonLocator(page, selectedSession) {
  const labels = [
    selectedSession.workerId,
    selectedSession.workerId.replace(/^\[|\]$/g, ''),
  ].filter((label, index, labelsList) => {
    return label && labelsList.indexOf(label) === index;
  });

  return page
    .getByRole('button', {
      name: new RegExp(labels.map(escapeRegExp).join('|')),
    })
    .first();
}

function verifyRuntimeStillAlive(selectedSession) {
  const zellijSession = selectedSession.zellijSession;
  if (!zellijSession) {
    throw new Error('Zellij-backed session is missing a session name.');
  }

  const result = spawnSync(
    'zellij',
    ['list-sessions', '--short', '--no-formatting'],
    {
      encoding: 'utf8',
    }
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `zellij list-sessions failed with status ${result.status}.`
    );
  }

  const liveSessions = result.stdout
    .split('\n')
    .map((session) => session.trim())
    .filter(Boolean);
  if (!liveSessions.includes(zellijSession)) {
    throw new Error(`Zellij session ${zellijSession} did not survive attach.`);
  }
}

function liveTerminalRunMode() {
  if (isReconnectMode) {
    return 'reconnect';
  }
  if (isSoakMode) {
    return 'soak';
  }
  if (isSwitchMode) {
    return 'switch';
  }

  return 'attach';
}

function validateLiveTerminalOptions() {
  const enabledModes = [isReconnectMode, isSoakMode, isSwitchMode].filter(
    Boolean
  ).length;
  if (enabledModes > 1) {
    throw new Error(
      'Choose only one live terminal mode: --reconnect, --soak, or --switch.'
    );
  }

  assertPositiveNumber('LIVE_TERMINAL_RECONNECTS', reconnectCycles);
  assertNonNegativeNumber('LIVE_TERMINAL_SOAK_MS', soakDurationMs);
  assertNonNegativeNumber('LIVE_TERMINAL_HOLD_MS', holdDurationMs);
  assertNonNegativeNumber('LIVE_TERMINAL_SLOW_MO_MS', slowMoMs);
  if (shouldReuseRunningStack) {
    validateOrigin('--backend-origin', reusedBackendOrigin);
    validateOrigin('--web-origin', reusedWebOrigin);
  }
}

function assertPositiveNumber(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
}

function assertNonNegativeNumber(name, value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
}

function reportRunStart() {
  process.stderr.write(
    [
      `live terminal smoke: mode=${runMode}`,
      `headed=${String(isHeadedMode)}`,
      stack.owned
        ? `backendPort=${stack.ports.backendPort}`
        : 'reusingStack=true',
      stack.owned ? `webPort=${stack.ports.webPort}` : undefined,
      isReconnectMode ? `reconnects=${reconnectCycles}` : undefined,
      isSoakMode ? `soakMs=${soakDurationMs}` : undefined,
      switchTargetID ? `switchTarget=${switchTargetID}` : undefined,
      shouldHoldOpen ? `holdMs=${holdDurationMs}` : undefined,
      slowMoMs > 0 ? `slowMoMs=${slowMoMs}` : undefined,
    ]
      .filter(Boolean)
      .join(' ') + '\n'
  );
}

function validateOrigin(name, origin) {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new Error(`${name} must be an http or https origin.`);
  }
}

function reportStackOrigins(origins) {
  process.stderr.write(
    `live terminal smoke: backend=${origins.backendOrigin} web=${origins.webOrigin}\n`
  );
}

function reportSelectedSession(label, session) {
  process.stderr.write(
    `live terminal smoke: ${label} ${session.workerId} (${session.id}) project=${session.project}\n`
  );
}

function reportHoldOpen() {
  process.stderr.write(
    `live terminal smoke: holding browser open for ${holdDurationMs}ms\n`
  );
}

async function stopStack(child) {
  const alreadyExited = child.exitCode !== null || child.signalCode !== null;

  terminateStack(child, 'SIGTERM');
  if (alreadyExited) {
    await sleep(500);
    return;
  }

  const exited = await Promise.race([
    new Promise((resolveExit) => child.once('exit', () => resolveExit(true))),
    sleep(5_000).then(() => false),
  ]);

  if (!exited) {
    terminateStack(child, 'SIGKILL');
  }
}

function terminateStack(child, signal) {
  if (!child.pid) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') {
      child.kill(signal);
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numberOption(name, fallback) {
  const prefix = `${name}=`;
  const value = process.argv
    .filter((argument) => argument.startsWith(prefix))
    .at(-1);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value.slice(prefix.length));
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number.`);
  }

  return parsed;
}

function portOption(name, fallback) {
  const value = stringOption(name, fallback);
  if (!value) {
    return undefined;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`${name} must be an integer port between 1 and 65535.`);
  }

  return port;
}

function stringOption(name, fallback) {
  const prefix = `${name}=`;
  const value = process.argv
    .filter((argument) => argument.startsWith(prefix))
    .at(-1);
  if (!value) {
    return fallback;
  }

  return value.slice(prefix.length);
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}
