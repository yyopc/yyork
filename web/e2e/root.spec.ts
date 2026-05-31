import { expect, type Locator, type Page, test } from '@playwright/test';

async function installFakeTerminalWebSocket(page: Page) {
  await page.addInitScript(() => {
    // These terminal tests assert on rendered text via .ao-terminal's
    // textContent, which only works for wterm's DOM renderer (xterm paints to a
    // canvas). The panel now defaults to xterm, so pin wterm here to keep
    // testing the DOM-render round-trip these specs were written for.
    window.localStorage.setItem('ao-terminal-backend', 'wterm');

    class FakeTerminalWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      binaryType = 'blob';
      messageListenerCount = 0;
      readyState = FakeTerminalWebSocket.CONNECTING;
      url: string;

      constructor(url: string) {
        super();
        this.url = url;
        const terminalWindow = window as Window & {
          __terminalAutoFailWebSockets?: boolean;
          __terminalInitialBackendText?: string;
          __terminalSentPayloads?: Array<number[] | string>;
          __terminalWebSockets?: FakeTerminalWebSocket[];
          __terminalWebSocketUrls?: string[];
        };
        terminalWindow.__terminalSentPayloads =
          terminalWindow.__terminalSentPayloads ?? [];
        terminalWindow.__terminalWebSockets = [
          ...(terminalWindow.__terminalWebSockets ?? []),
          this,
        ];
        terminalWindow.__terminalWebSocketUrls = [
          ...(terminalWindow.__terminalWebSocketUrls ?? []),
          url,
        ];
        window.setTimeout(() => {
          if (this.readyState !== FakeTerminalWebSocket.CONNECTING) {
            return;
          }

          this.readyState = FakeTerminalWebSocket.OPEN;
          this.dispatchEvent(new Event('open'));
          this.pushInitialBackendTextIfReady();
          if (terminalWindow.__terminalAutoFailWebSockets) {
            window.setTimeout(() => this.fail(), 0);
          }
        }, 0);
      }

      addEventListener(
        type: string,
        callback: EventListenerOrEventListenerObject | null,
        options?: AddEventListenerOptions | boolean
      ) {
        if (type === 'message' && callback) {
          this.messageListenerCount += 1;
          this.pushInitialBackendTextIfReady();
        }

        super.addEventListener(type, callback, options);
      }

      removeEventListener(
        type: string,
        callback: EventListenerOrEventListenerObject | null,
        options?: EventListenerOptions | boolean
      ) {
        if (type === 'message' && callback) {
          this.messageListenerCount = Math.max(
            0,
            this.messageListenerCount - 1
          );
        }

        super.removeEventListener(type, callback, options);
      }

      close() {
        this.readyState = FakeTerminalWebSocket.CLOSED;
        this.dispatchEvent(new CloseEvent('close', { wasClean: true }));
      }

      fail() {
        this.readyState = FakeTerminalWebSocket.CLOSED;
        this.dispatchEvent(new CloseEvent('close', { wasClean: false }));
      }

      pushBackendText(message: string) {
        this.dispatchEvent(
          new MessageEvent('message', {
            data: new TextEncoder().encode(message).buffer,
          })
        );
      }

      pushInitialBackendTextIfReady() {
        if (
          this.readyState !== FakeTerminalWebSocket.OPEN ||
          this.messageListenerCount === 0
        ) {
          return;
        }

        const terminalWindow = window as Window & {
          __terminalInitialBackendText?: string;
        };
        const initialBackendText = terminalWindow.__terminalInitialBackendText;
        if (!initialBackendText) {
          return;
        }

        terminalWindow.__terminalInitialBackendText = undefined;
        window.setTimeout(() => this.pushBackendText(initialBackendText), 0);
      }

      send(payload: string | Uint8Array) {
        const terminalWindow = window as Window & {
          __terminalSentPayloads?: Array<number[] | string>;
        };
        terminalWindow.__terminalSentPayloads =
          terminalWindow.__terminalSentPayloads ?? [];

        if (payload instanceof Uint8Array) {
          terminalWindow.__terminalSentPayloads.push(Array.from(payload));
          this.dispatchEvent(
            new MessageEvent('message', {
              data: new TextDecoder().decode(payload),
            })
          );
          return;
        }

        terminalWindow.__terminalSentPayloads.push(payload);
      }
    }

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      value: FakeTerminalWebSocket,
    });
  });
}

function getTerminalWebSocketCount(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __terminalWebSocketUrls?: string[];
        }
      ).__terminalWebSocketUrls?.filter((url) => url.includes('/api/sessions/'))
        .length ?? 0
  );
}

function getLatestTerminalWebSocketURL(page: Page) {
  return page.evaluate(() => {
    const urls =
      (
        window as Window & {
          __terminalWebSocketUrls?: string[];
        }
      ).__terminalWebSocketUrls ?? [];

    return urls.filter((url) => url.includes('/api/sessions/')).at(-1);
  });
}

function getTerminalOpenWebSocketCount(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __terminalWebSockets?: Array<{
            messageListenerCount?: number;
            readyState?: number;
            url?: string;
          }>;
        }
      ).__terminalWebSockets?.filter(
        (socket) =>
          socket.url?.includes('/api/sessions/') &&
          socket.readyState === WebSocket.OPEN &&
          (socket.messageListenerCount ?? 0) > 0
      ).length ?? 0
  );
}

function setTerminalWebSocketsAutoFail(page: Page, enabled: boolean) {
  return page.evaluate((shouldAutoFail) => {
    (
      window as Window & {
        __terminalAutoFailWebSockets?: boolean;
      }
    ).__terminalAutoFailWebSockets = shouldAutoFail;
  }, enabled);
}

function getTerminalSentText(page: Page) {
  return page.evaluate(() => {
    const terminalWindow = window as Window & {
      __terminalSentPayloads?: Array<number[] | string>;
    };
    const decoder = new TextDecoder();

    return (terminalWindow.__terminalSentPayloads ?? [])
      .map((payload) =>
        Array.isArray(payload)
          ? decoder.decode(new Uint8Array(payload))
          : payload
      )
      .join('');
  });
}

function hasTerminalResizeControlMessage(page: Page) {
  return page.evaluate(() => {
    const terminalWindow = window as Window & {
      __terminalSentPayloads?: Array<number[] | string>;
    };

    return (terminalWindow.__terminalSentPayloads ?? []).some((payload) => {
      if (typeof payload !== 'string') {
        return false;
      }

      try {
        const parsed = JSON.parse(payload) as {
          cols?: unknown;
          rows?: unknown;
          type?: unknown;
        };

        return (
          parsed.type === 'resize' &&
          typeof parsed.cols === 'number' &&
          parsed.cols > 0 &&
          typeof parsed.rows === 'number' &&
          parsed.rows > 0
        );
      } catch {
        return false;
      }
    });
  });
}

function getTerminalResizeControlMessages(page: Page) {
  return page.evaluate(() => {
    const terminalWindow = window as Window & {
      __terminalSentPayloads?: Array<number[] | string>;
    };

    return (terminalWindow.__terminalSentPayloads ?? []).flatMap((payload) => {
      if (typeof payload !== 'string') {
        return [];
      }

      try {
        const parsed = JSON.parse(payload) as {
          cols?: unknown;
          rows?: unknown;
          type?: unknown;
        };

        if (
          parsed.type !== 'resize' ||
          typeof parsed.cols !== 'number' ||
          typeof parsed.rows !== 'number'
        ) {
          return [];
        }

        return [
          {
            cols: parsed.cols,
            rows: parsed.rows,
          },
        ];
      } catch {
        return [];
      }
    });
  });
}

async function sendTerminalBackendText(page: Page, text: string) {
  await page.evaluate((message) => {
    const terminalWindow = window as Window & {
      __terminalWebSockets?: Array<
        EventTarget & {
          messageListenerCount?: number;
          pushBackendText?: (message: string) => void;
          readyState?: number;
          url?: string;
        }
      >;
    };
    const socket = terminalWindow.__terminalWebSockets
      ?.filter(
        (candidate) =>
          candidate.url?.includes('/api/sessions/') &&
          candidate.readyState === WebSocket.OPEN &&
          (candidate.messageListenerCount ?? 0) > 0
      )
      .at(-1);

    if (!socket) {
      throw new Error('No fake terminal websocket is connected.');
    }
    if (!socket.pushBackendText) {
      throw new Error('Fake terminal websocket cannot push backend text.');
    }

    socket.pushBackendText(message);
  }, text);
}

async function sendTerminalBackendTextAndWait(
  page: Page,
  terminalPanel: Locator,
  text: string,
  expectedText: string
) {
  const terminal = terminalPanel.locator('.ao-terminal');

  await expect
    .poll(
      async () => {
        await sendTerminalBackendText(page, text);
        await page.waitForTimeout(100);
        return (await terminal.textContent()) ?? '';
      },
      {
        timeout: 15_000,
      }
    )
    .toContain(expectedText);
}

async function dropTerminalWebSocket(page: Page) {
  await page.evaluate(() => {
    const terminalWindow = window as Window & {
      __terminalWebSockets?: Array<
        EventTarget & {
          fail?: () => void;
          messageListenerCount?: number;
          readyState?: number;
          url?: string;
        }
      >;
    };
    const socket = terminalWindow.__terminalWebSockets
      ?.filter(
        (candidate) =>
          candidate.url?.includes('/api/sessions/') &&
          candidate.readyState === WebSocket.OPEN &&
          (candidate.messageListenerCount ?? 0) > 0
      )
      .at(-1);

    if (!socket?.fail) {
      throw new Error('No fake terminal websocket can be dropped.');
    }

    socket.fail();
  });
}

function waitForHomeWorkspacePreferences(page: Page) {
  return expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem('better-ao.home.workspace-preferences')
      )
    )
    .not.toBeNull();
}

test('root route renders the orchestrator workspace', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Agent Orchestrator/);
  await expect(page.getByRole('heading', { name: 'better-ao' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Projects' })
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Kanban' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByLabel('Kanban board')).toBeVisible();
});

test('terminal view is reachable from the root route', async ({ page }) => {
  await page.goto('/');

  await expect(async () => {
    await page.getByRole('tab', { name: 'Terminal' }).click();
    await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 500 }
    );
  }).toPass();

  await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  const terminal = page
    .locator('section[aria-label$="terminal panel"]')
    .getByRole('textbox');
  await expect(terminal).toBeVisible();
  await expect(terminal).toHaveAccessibleName(/\[[A-Z0-9_-]+\] terminal/);
});

test('Open IDE opens the selected terminal session workspace', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'agent-orchestrator_live',
        projects: [
          { id: 'agent-orchestrator_live', name: 'Agent Orchestrator' },
        ],
        sessions: [
          {
            agent: 'codex',
            cwd: '/tmp/ao-live',
            description: 'A selected live worker.',
            id: 'ao-live-1',
            issue: '[PR #1]',
            metadata: '[codex/working]',
            project: 'agent-orchestrator_live',
            selected: true,
            state: 'working',
            terminalSupported: true,
            title: 'Live worker 1',
            workerId: '[AO-1]',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  let openIDERequest:
    | {
        method: string;
        url: string;
      }
    | undefined;
  await page.route('**/api/sessions/*/ide?**', async (route) => {
    openIDERequest = {
      method: route.request().method(),
      url: route.request().url(),
    };
    await route.fulfill({
      body: JSON.stringify({ cwd: '/tmp/ao-live' }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await expect(async () => {
    await page.getByRole('tab', { name: 'Terminal' }).click();
    await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 500 }
    );
  }).toPass();

  const openIDEButton = page.getByRole('button', { name: 'Open IDE' });
  await expect(openIDEButton).toBeEnabled();
  await openIDEButton.click();

  await expect
    .poll(() => openIDERequest)
    .toEqual(
      expect.objectContaining({
        method: 'POST',
      })
    );
  expect(openIDERequest?.url).toContain('/api/sessions/ao-live-1/ide');
  expect(openIDERequest?.url).toContain('project=agent-orchestrator_live');
  await expect(page.getByText('Opened IDE')).toBeVisible();
});

test('project actions can open the project workspace in the IDE', async ({
  page,
}) => {
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'agent-orchestrator_live',
        projects: [
          {
            cwd: '/tmp/agent-orchestrator',
            id: 'agent-orchestrator_live',
            name: 'Agent Orchestrator',
          },
        ],
        sessions: [],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  let openProjectIDERequest:
    | {
        method: string;
        url: string;
      }
    | undefined;
  await page.route('**/api/projects/*/ide', async (route) => {
    openProjectIDERequest = {
      method: route.request().method(),
      url: route.request().url(),
    };
    await route.fulfill({
      body: JSON.stringify({ cwd: '/tmp/agent-orchestrator' }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await waitForHomeWorkspacePreferences(page);
  await page.getByRole('button', { name: 'Expand sidebars' }).click();
  await page
    .getByRole('button', { exact: true, name: 'Agent Orchestrator' })
    .hover();
  await page
    .getByRole('button', { name: 'Agent Orchestrator actions' })
    .click();
  await page.getByRole('menuitem', { name: 'Open project' }).click();

  await expect
    .poll(() => openProjectIDERequest)
    .toEqual(
      expect.objectContaining({
        method: 'POST',
      })
    );
  expect(openProjectIDERequest?.url).toContain(
    '/api/projects/agent-orchestrator_live/ide'
  );
  await expect(page.getByText('Opened project')).toBeVisible();
});

test('selecting a worker card retargets the terminal view', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'agent-orchestrator_live',
        projects: [
          { id: 'agent-orchestrator_live', name: 'Agent Orchestrator' },
        ],
        sessions: [
          {
            agent: 'codex',
            cwd: '/tmp/ao-live',
            description: 'A selected live worker.',
            id: 'ao-live-1',
            issue: '[PR #1]',
            metadata: '[codex/working]',
            project: 'agent-orchestrator_live',
            selected: true,
            state: 'working',
            terminalSupported: true,
            title: 'Live worker 1',
            workerId: '[AO-1]',
          },
          {
            agent: 'claude',
            cwd: '/tmp/ao-live',
            description: 'A second live worker.',
            id: 'ao-live-2',
            issue: '[PR #2]',
            metadata: '[claude/working]',
            project: 'agent-orchestrator_live',
            state: 'working',
            terminalSupported: true,
            title: 'Live worker 2',
            workerId: '[AO-2]',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.goto('/');

  const kanbanBoard = page.getByLabel('Kanban board');
  const cards = kanbanBoard.getByRole('button');
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });

  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThan(1);

  const initialCardText = await cards.first().getAttribute('aria-label');
  const initialWorkerId = initialCardText?.match(/\[[A-Z0-9_-]+\]/)?.[0];
  if (!initialWorkerId) {
    throw new Error(
      `Could not read worker id from initial card: ${initialCardText}`
    );
  }

  await expect(async () => {
    await page.getByRole('tab', { name: 'Terminal' }).click();
    await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 500 }
    );
  }).toPass();

  const terminalPanel = page.locator('section[aria-label$="terminal panel"]');
  const initialTerminal = terminalPanel.getByRole('textbox');
  await expect(initialTerminal).toBeVisible();
  await expect(initialTerminal).toHaveAccessibleName(
    `${initialWorkerId} terminal`
  );
  await initialTerminal.evaluate((element) => {
    element.setAttribute('data-e2e-terminal-instance', 'previous-worker');
  });

  await expect(async () => {
    await page.getByRole('tab', { name: 'Kanban' }).click();
    await expect(page.getByRole('tab', { name: 'Kanban' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 500 }
    );
  }).toPass();

  const targetCard = cards.nth(1);
  const targetText = await targetCard.getAttribute('aria-label');
  const workerId = targetText?.match(/\[[A-Z0-9_-]+\]/)?.[0];
  if (!workerId) {
    throw new Error(`Could not read worker id from target card: ${targetText}`);
  }

  await targetCard.click();
  await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  const terminal = terminalPanel.getByRole('textbox');
  await expect(terminal).toBeVisible();
  await expect(terminal).toHaveAccessibleName(`${workerId} terminal`);
  await expect(terminal).not.toHaveAttribute(
    'data-e2e-terminal-instance',
    'previous-worker'
  );
});

test('root route restores the last active terminal session after reload or tab reopen', async ({
  context,
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  const workspaceBody = JSON.stringify({
    activeProjectId: 'agent-orchestrator_live',
    projects: [{ id: 'agent-orchestrator_live', name: 'Agent Orchestrator' }],
    sessions: [
      {
        agent: 'codex',
        cwd: '/tmp/ao-live',
        description: 'A selected live worker.',
        id: 'ao-live-1',
        issue: '[PR #1]',
        metadata: '[codex/working]',
        project: 'agent-orchestrator_live',
        selected: true,
        state: 'working',
        terminalSupported: true,
        title: 'Live worker 1',
        workerId: '[AO-1]',
      },
      {
        agent: 'claude',
        cwd: '/tmp/ao-live',
        description: 'A second live worker.',
        id: 'ao-live-2',
        issue: '[PR #2]',
        metadata: '[claude/working]',
        project: 'agent-orchestrator_live',
        state: 'working',
        terminalSupported: true,
        title: 'Live worker 2',
        workerId: '[AO-2]',
      },
    ],
  });

  await context.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: workspaceBody,
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  const kanbanBoard = page.getByLabel('Kanban board');
  await expect(
    kanbanBoard.getByRole('button', { name: '[AO-2] Live worker 2' })
  ).toBeVisible({
    timeout: 15_000,
  });

  await kanbanBoard
    .getByRole('button', { name: '[AO-2] Live worker 2' })
    .click();
  await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(
    page
      .locator('section[aria-label$="terminal panel"]')
      .getByRole('textbox', { name: '[AO-2] terminal' })
  ).toBeVisible();

  await page.reload();

  await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(
    page
      .locator('section[aria-label$="terminal panel"]')
      .getByRole('textbox', { name: '[AO-2] terminal' })
  ).toBeVisible();

  const reopenedPage = await context.newPage();
  await installFakeTerminalWebSocket(reopenedPage);
  await reopenedPage.goto('/');

  await expect(
    reopenedPage.getByRole('tab', { name: 'Terminal' })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    reopenedPage
      .locator('section[aria-label$="terminal panel"]')
      .getByRole('textbox', { name: '[AO-2] terminal' })
  ).toBeVisible();
  await reopenedPage.close();
});

test('root route restores sidebar open state after reload or tab reopen', async ({
  context,
  page,
}) => {
  const workspaceBody = JSON.stringify({
    activeProjectId: 'agent-orchestrator_live',
    projects: [{ id: 'agent-orchestrator_live', name: 'Agent Orchestrator' }],
    sessions: [
      {
        agent: 'codex',
        cwd: '/tmp/ao-live',
        description: 'A selected live worker.',
        id: 'ao-live-1',
        issue: '[PR #1]',
        metadata: '[codex/working]',
        project: 'agent-orchestrator_live',
        selected: true,
        state: 'working',
        terminalSupported: true,
        title: 'Live worker 1',
        workerId: '[AO-1]',
      },
    ],
  });

  await context.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: workspaceBody,
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await waitForHomeWorkspacePreferences(page);
  await page.getByRole('button', { name: 'Expand sidebars' }).click();
  await expect(
    page.getByRole('button', { name: 'Collapse project sidebar' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { exact: true, name: 'AO-1' })
  ).toBeVisible();

  await page
    .getByRole('button', { exact: true, name: 'Agent Orchestrator' })
    .click();
  await expect(
    page.getByRole('button', { exact: true, name: 'AO-1' })
  ).toBeHidden();

  await page.reload();

  await expect(
    page.getByRole('button', { name: 'Collapse project sidebar' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { exact: true, name: 'AO-1' })
  ).toBeHidden();

  const reopenedPage = await context.newPage();
  await reopenedPage.goto('/');
  await waitForHomeWorkspacePreferences(reopenedPage);

  await expect(
    reopenedPage.getByRole('button', { name: 'Collapse project sidebar' })
  ).toBeVisible();
  await expect(
    reopenedPage.getByRole('button', { exact: true, name: 'AO-1' })
  ).toBeHidden();
  await reopenedPage.close();
});

test('orchestrator session is reachable from the project tree', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'agent-orchestrator_live',
        orchestrators: [
          {
            agent: 'codex',
            cwd: '/tmp/ao-live',
            description: 'Coordinates workers for the active project.',
            id: 'ao-orchestrator',
            issue: 'Orchestrator',
            kind: 'orchestrator',
            metadata: '[codex/working]',
            project: 'agent-orchestrator_live',
            state: 'working',
            terminalSupported: true,
            title: 'Project orchestrator',
            workerId: '[ORCHESTRATOR]',
          },
        ],
        projects: [
          { id: 'agent-orchestrator_live', name: 'Agent Orchestrator' },
        ],
        sessions: [
          {
            agent: 'codex',
            cwd: '/tmp/ao-live',
            description: 'A selected live worker.',
            id: 'ao-live-1',
            issue: '[PR #1]',
            metadata: '[codex/working]',
            project: 'agent-orchestrator_live',
            selected: true,
            state: 'working',
            terminalSupported: true,
            title: 'Live worker 1',
            workerId: '[AO-1]',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await page
    .getByRole('button', { exact: true, name: 'Orchestrator' })
    .dispatchEvent('click');

  await expect(
    page.getByRole('button', { exact: true, name: 'Orchestrator' })
  ).toHaveAttribute('data-active', 'true');
  await expect(page.getByRole('button', { name: 'AO-1' })).toHaveAttribute(
    'data-active',
    'false'
  );
  await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(
    page
      .locator('section[aria-label$="terminal panel"]')
      .getByRole('textbox', { name: 'Orchestrator terminal' })
  ).toBeVisible();
  await expect
    .poll(() => getLatestTerminalWebSocketURL(page))
    .toContain('/api/sessions/ao-orchestrator/terminal');
  await expect
    .poll(() => getLatestTerminalWebSocketURL(page))
    .toContain('project=agent-orchestrator_live');
});

test('empty AO workspace renders an operational empty state', async ({
  page,
}) => {
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'local',
        projects: [{ id: 'local', name: 'Local' }],
        sessions: [],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');

  await expect(page.getByLabel('Kanban board')).toBeVisible();
  await expect(page.getByText('No AO workers detected')).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText('Start or resume a worker, then refresh this workspace.')
  ).toBeVisible();

  await expect(async () => {
    await page.getByRole('tab', { name: 'Terminal' }).click();
    await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 500 }
    );
  }).toPass();

  await expect(
    page
      .locator('section[aria-label$="terminal panel"]')
      .getByText('No AO workers detected')
  ).toBeVisible();
  await expect(
    page.locator('section[aria-label$="terminal panel"]').getByRole('textbox')
  ).toHaveCount(0);
});

test('workspace refresh picks up newly available AO workers', async ({
  page,
}) => {
  let requestCount = 0;
  await page.route('**/api/workspace', async (route) => {
    requestCount += 1;

    await route.fulfill({
      body: JSON.stringify(
        requestCount === 1
          ? {
              activeProjectId: 'local',
              projects: [{ id: 'local', name: 'Local' }],
              sessions: [],
            }
          : {
              activeProjectId: 'agent-orchestrator_live',
              projects: [
                { id: 'agent-orchestrator_live', name: 'Agent Orchestrator' },
              ],
              sessions: [
                {
                  agent: 'codex',
                  cwd: '/tmp/ao-live',
                  description:
                    'A worker discovered after the workspace refresh.',
                  id: 'ao-live',
                  issue: '[PR #1]',
                  metadata: '[codex/working]',
                  project: 'agent-orchestrator_live',
                  state: 'working',
                  terminalSupported: true,
                  title: 'Live worker',
                  workerId: '[AO-LIVE]',
                },
              ],
            }
      ),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');

  await expect(page.getByText('No AO workers detected')).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole('button', { name: '[AO-LIVE] Live worker' })
  ).toBeVisible({
    timeout: 7_000,
  });
});

test('workspace refresh preserves the selected terminal websocket', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);

  let requestCount = 0;
  await page.route('**/api/workspace', async (route) => {
    requestCount += 1;

    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'agent-orchestrator_live',
        projects: [
          { id: 'agent-orchestrator_live', name: 'Agent Orchestrator' },
        ],
        sessions: [
          {
            agent: 'codex',
            cwd: '/tmp/ao-live',
            description: `Workspace read ${requestCount}`,
            id: 'ao-live',
            issue: '[PR #1]',
            metadata: `[codex/working-${requestCount}]`,
            project: 'agent-orchestrator_live',
            selected: true,
            state: 'working',
            terminalSupported: true,
            title: `Live worker ${requestCount}`,
            workerId: '[AO-LIVE]',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '[AO-LIVE] Live worker 1' })
  ).toBeVisible({
    timeout: 15_000,
  });

  await expect(async () => {
    await page.getByRole('tab', { name: 'Terminal' }).click();
    await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 500 }
    );
  }).toPass();

  const terminal = page
    .locator('section[aria-label$="terminal panel"]')
    .getByRole('textbox');
  await expect(terminal).toBeVisible();
  await expect.poll(() => getTerminalWebSocketCount(page)).not.toBe(0);
  const initialWebSocketCount = await getTerminalWebSocketCount(page);

  await expect
    .poll(() => requestCount, {
      timeout: 7_000,
    })
    .toBeGreaterThan(1);
  await expect
    .poll(async () => {
      await page.waitForTimeout(250);
      return getTerminalWebSocketCount(page);
    })
    .toBe(initialWebSocketCount);
});

test('terminal view switching keeps the selected terminal mounted', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'agent-orchestrator_live',
        projects: [
          { id: 'agent-orchestrator_live', name: 'Agent Orchestrator' },
        ],
        sessions: [
          {
            agent: 'codex',
            cwd: '/tmp/ao-live',
            description: 'A selected live worker.',
            id: 'ao-live',
            issue: '[PR #1]',
            metadata: '[codex/working]',
            project: 'agent-orchestrator_live',
            selected: true,
            state: 'working',
            terminalSupported: true,
            title: 'Live worker',
            workerId: '[AO-LIVE]',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '[AO-LIVE] Live worker' })
  ).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('tab', { name: 'Terminal' }).click();
  await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  const terminalPanel = page.locator('section[aria-label$="terminal panel"]');
  const terminal = terminalPanel.getByRole('textbox');
  await expect(terminal).toBeVisible();
  await terminal.evaluate((element) => {
    element.setAttribute('data-e2e-terminal-instance', 'selected-worker');
  });
  await expect.poll(() => getTerminalWebSocketCount(page)).not.toBe(0);
  const initialWebSocketCount = await getTerminalWebSocketCount(page);

  await page.getByRole('tab', { name: 'Kanban' }).click();
  await expect(page.getByRole('tab', { name: 'Kanban' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByLabel('Kanban board')).toBeVisible();

  await page.getByRole('tab', { name: 'Terminal' }).click();
  await expect(page.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(terminal).toBeVisible();
  await expect(terminal).toHaveAttribute(
    'data-e2e-terminal-instance',
    'selected-worker'
  );
  await expect
    .poll(() => getTerminalWebSocketCount(page))
    .toBe(initialWebSocketCount);
});

test('terminal input and backend output round-trip through the websocket', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'agent-orchestrator_live',
        projects: [
          { id: 'agent-orchestrator_live', name: 'Agent Orchestrator' },
        ],
        sessions: [
          {
            agent: 'codex',
            cwd: '/tmp/ao-live',
            description: 'A selected live worker.',
            id: 'ao-live',
            issue: '[PR #1]',
            metadata: '[codex/working]',
            project: 'agent-orchestrator_live',
            selected: true,
            state: 'working',
            terminalSupported: true,
            title: 'Live worker',
            workerId: '[AO-LIVE]',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '[AO-LIVE] Live worker' })
  ).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('tab', { name: 'Terminal' }).click();
  const terminalPanel = page.locator('section[aria-label$="terminal panel"]');
  const terminal = terminalPanel.getByRole('textbox');
  await expect(terminal).toBeVisible();
  await expect.poll(() => getTerminalOpenWebSocketCount(page)).not.toBe(0);
  await expect.poll(() => hasTerminalResizeControlMessage(page)).toBe(true);
  await expect.poll(() => hasTerminalResizeControlMessage(page)).toBe(true);
  await sendTerminalBackendTextAndWait(
    page,
    terminalPanel,
    'BACKEND_READY\r\n',
    'BACKEND_READY'
  );

  await terminal.click();
  await page.keyboard.type('pwd');
  await page.keyboard.press('Enter');

  await expect.poll(() => getTerminalSentText(page)).toContain('pwd\r');
  await expect(terminalPanel).toContainText('pwd');
});

test('terminal resizes the attached PTY with the viewport', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'agent-orchestrator_live',
        projects: [
          { id: 'agent-orchestrator_live', name: 'Agent Orchestrator' },
        ],
        sessions: [
          {
            agent: 'codex',
            cwd: '/tmp/ao-live',
            description: 'A selected live worker.',
            id: 'ao-live',
            issue: '[PR #1]',
            metadata: '[codex/working]',
            project: 'agent-orchestrator_live',
            selected: true,
            state: 'working',
            terminalSupported: true,
            title: 'Live worker',
            workerId: '[AO-LIVE]',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '[AO-LIVE] Live worker' })
  ).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('tab', { name: 'Terminal' }).click();
  await expect(
    page.locator('section[aria-label$="terminal panel"]').getByRole('textbox')
  ).toBeVisible();
  await expect.poll(() => getTerminalOpenWebSocketCount(page)).not.toBe(0);
  await expect.poll(() => hasTerminalResizeControlMessage(page)).toBe(true);

  const websocketURL = await getLatestTerminalWebSocketURL(page);
  if (!websocketURL) {
    throw new Error('Terminal websocket URL was not captured.');
  }

  const initialURLCols = Number(new URL(websocketURL).searchParams.get('cols'));
  expect(initialURLCols).toBeGreaterThan(100);

  const initialResizeMessages = await getTerminalResizeControlMessages(page);
  const initialResize = initialResizeMessages.at(-1);
  if (!initialResize) {
    throw new Error('Terminal resize control message was not captured.');
  }

  await page.setViewportSize({ height: 650, width: 900 });
  await expect
    .poll(async () => {
      const latestResize = (await getTerminalResizeControlMessages(page)).at(
        -1
      );
      return latestResize ? latestResize.cols < initialResize.cols : false;
    })
    .toBe(true);
});

test('terminal output can be scrolled with the browser wheel', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'agent-orchestrator_live',
        projects: [
          { id: 'agent-orchestrator_live', name: 'Agent Orchestrator' },
        ],
        sessions: [
          {
            agent: 'codex',
            cwd: '/tmp/ao-live',
            description: 'A selected live worker.',
            id: 'ao-live',
            issue: '[PR #1]',
            metadata: '[codex/working]',
            project: 'agent-orchestrator_live',
            selected: true,
            state: 'working',
            terminalSupported: true,
            title: 'Live worker',
            workerId: '[AO-LIVE]',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '[AO-LIVE] Live worker' })
  ).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('tab', { name: 'Terminal' }).click();
  const terminalPanel = page.locator('section[aria-label$="terminal panel"]');
  const terminal = terminalPanel.getByRole('textbox');
  await expect(terminal).toBeVisible();
  await expect.poll(() => getTerminalOpenWebSocketCount(page)).not.toBe(0);
  await expect.poll(() => hasTerminalResizeControlMessage(page)).toBe(true);

  const scrollbackText = Array.from(
    { length: 120 },
    (_, index) => `SCROLL_${index.toString().padStart(3, '0')}\r\n`
  ).join('');
  await sendTerminalBackendTextAndWait(
    page,
    terminalPanel,
    scrollbackText,
    'SCROLL_119'
  );

  await expect
    .poll(() =>
      terminal.evaluate(
        (element) => element.scrollHeight > element.clientHeight
      )
    )
    .toBe(true);
  await terminal.evaluate((element) => {
    element.scrollTop = 0;
  });
  await terminal.hover();
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() => terminal.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
});

test('terminal automatically reconnects after a transient websocket drop', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'agent-orchestrator_live',
        projects: [
          { id: 'agent-orchestrator_live', name: 'Agent Orchestrator' },
        ],
        sessions: [
          {
            agent: 'codex',
            cwd: '/tmp/ao-live',
            description: 'A selected live worker.',
            id: 'ao-live',
            issue: '[PR #1]',
            metadata: '[codex/working]',
            project: 'agent-orchestrator_live',
            selected: true,
            state: 'working',
            terminalSupported: true,
            title: 'Live worker',
            workerId: '[AO-LIVE]',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '[AO-LIVE] Live worker' })
  ).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('tab', { name: 'Terminal' }).click();
  const terminalPanel = page.locator('section[aria-label$="terminal panel"]');
  const terminal = terminalPanel.getByRole('textbox');
  await expect(terminal).toBeVisible();
  await expect.poll(() => getTerminalOpenWebSocketCount(page)).not.toBe(0);
  const initialWebSocketCount = await getTerminalWebSocketCount(page);
  await sendTerminalBackendTextAndWait(
    page,
    terminalPanel,
    'BEFORE_DROP\r\n',
    'BEFORE_DROP'
  );

  await dropTerminalWebSocket(page);
  await expect
    .poll(() => getTerminalWebSocketCount(page))
    .toBeGreaterThan(initialWebSocketCount);
  await expect.poll(() => getTerminalOpenWebSocketCount(page)).not.toBe(0);
  await sendTerminalBackendTextAndWait(
    page,
    terminalPanel,
    'BEFORE_DROP\r\nAFTER_RECONNECT\r\n',
    'AFTER_RECONNECT'
  );
  await expect
    .poll(async () => {
      const text = (await terminalPanel.textContent()) ?? '';
      return text.match(/BEFORE_DROP/g)?.length ?? 0;
    })
    .toBe(1);
});

test('terminal selection is scoped by project when AO worker ids collide', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'project-a',
        projects: [
          { id: 'project-a', name: 'Project A' },
          { id: 'project-b', name: 'Project B' },
        ],
        sessions: [
          {
            agent: 'codex',
            cwd: '/tmp/project-a',
            description: 'A selected project A worker.',
            id: 'ao-1',
            issue: '[PR #1]',
            metadata: '[codex/working]',
            project: 'project-a',
            selected: true,
            state: 'working',
            terminalSupported: true,
            title: 'Project A worker',
            workerId: '[AO-1]',
          },
          {
            agent: 'codex',
            cwd: '/tmp/project-b',
            description: 'A project B worker with the same AO id.',
            id: 'ao-1',
            issue: '[PR #2]',
            metadata: '[codex/working]',
            project: 'project-b',
            state: 'working',
            terminalSupported: true,
            title: 'Project B worker',
            workerId: '[AO-1]',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '[AO-1] Project B worker' }).click();
  await page.getByRole('tab', { name: 'Terminal' }).click();
  await expect(
    page
      .locator('section[aria-label$="terminal panel"]')
      .getByRole('textbox', { name: '[AO-1] terminal' })
  ).toBeVisible();

  await expect
    .poll(() => getLatestTerminalWebSocketURL(page))
    .toContain('project=project-b');
});

test('terminal stops automatic reconnects after bounded flapping websocket retries', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        activeProjectId: 'agent-orchestrator_live',
        projects: [
          { id: 'agent-orchestrator_live', name: 'Agent Orchestrator' },
        ],
        sessions: [
          {
            agent: 'codex',
            cwd: '/tmp/ao-live',
            description: 'A selected live worker.',
            id: 'ao-live',
            issue: '[PR #1]',
            metadata: '[codex/working]',
            project: 'agent-orchestrator_live',
            selected: true,
            state: 'working',
            terminalSupported: true,
            title: 'Live worker',
            workerId: '[AO-LIVE]',
          },
        ],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '[AO-LIVE] Live worker' })
  ).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('tab', { name: 'Terminal' }).click();
  await expect(
    page.locator('section[aria-label$="terminal panel"]').getByRole('textbox')
  ).toBeVisible();
  await expect.poll(() => getTerminalWebSocketCount(page)).not.toBe(0);
  const initialWebSocketCount = await getTerminalWebSocketCount(page);
  await setTerminalWebSocketsAutoFail(page, true);

  await dropTerminalWebSocket(page);
  const maxAutomaticReconnectCount = initialWebSocketCount + 3;
  await expect
    .poll(() => getTerminalWebSocketCount(page), {
      timeout: 5_000,
    })
    .toBe(maxAutomaticReconnectCount);
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(600);
        return getTerminalWebSocketCount(page);
      },
      {
        timeout: 1_800,
      }
    )
    .toBe(maxAutomaticReconnectCount);
});

test('legacy /home route is not mounted', async ({ page }) => {
  const response = await page.goto('/home');

  expect(response?.status()).toBe(404);
});
