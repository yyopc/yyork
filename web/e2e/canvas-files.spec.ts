import { expect, type Page, test } from '@playwright/test';

const SESSION_ID = 'ao-live-1';
const PROJECT_ID = 'agent-orchestrator_live';
const TARGET_KEY = `session:${encodeURIComponent(PROJECT_ID)}:${encodeURIComponent(SESSION_ID)}`;
const SELECTED_FILE = 'README.md';

const workspaceBody = {
  activeProjectId: PROJECT_ID,
  projects: [
    {
      id: PROJECT_ID,
      name: 'Agent Orchestrator',
      workerWorkspaceMode: 'local',
    },
  ],
  sessions: [
    {
      agent: 'codex',
      cwd: '/tmp/ao-live',
      description: 'A selected live worker.',
      id: SESSION_ID,
      issue: '[PR #1]',
      metadata: '[codex/working]',
      project: PROJECT_ID,
      recap: 'A selected live worker.',
      selected: true,
      state: 'working',
      terminalSupported: true,
      title: 'Live worker 1',
      workerId: '[AO-1]',
    },
  ],
};

const filesBody = {
  gitStatus: [],
  paths: ['README.md', 'go.mod', 'web/package.json'],
  truncated: false,
  workspacePath: '/tmp/ao-live',
};

const fileContentBody = {
  binary: false,
  contents: '# yyork\n\nSelected file content for persistence test.\n',
  path: SELECTED_FILE,
  size: 48,
  truncated: false,
  workspacePath: '/tmp/ao-live',
};

async function installFakeTerminalWebSocket(page: Page) {
  await page.addInitScript(() => {
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
        window.setTimeout(() => {
          if (this.readyState !== FakeTerminalWebSocket.CONNECTING) {
            return;
          }

          this.readyState = FakeTerminalWebSocket.OPEN;
          this.dispatchEvent(new Event('open'));
        }, 0);
      }

      addEventListener(
        type: string,
        callback: EventListenerOrEventListenerObject | null,
        options?: AddEventListenerOptions | boolean
      ) {
        if (type === 'message' && callback) {
          this.messageListenerCount += 1;
        }

        super.addEventListener(type, callback, options);
      }

      close() {
        this.readyState = FakeTerminalWebSocket.CLOSED;
        this.dispatchEvent(new CloseEvent('close', { wasClean: true }));
      }

      send(_payload: string | Uint8Array) {}
    }

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      value: FakeTerminalWebSocket,
    });
  });
}

async function installCanvasRoutes(page: Page) {
  await page.route('**/api/workspace', async (route) => {
    await route.fulfill({
      body: JSON.stringify(workspaceBody),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route(
    new RegExp(`/api/sessions/${SESSION_ID}/files(?:\\?|$)`),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }

      await route.fulfill({
        body: JSON.stringify(filesBody),
        contentType: 'application/json',
        status: 200,
      });
    }
  );

  await page.route(
    new RegExp(`/api/sessions/${SESSION_ID}/files/content\\?`),
    async (route) => {
      await route.fulfill({
        body: JSON.stringify(fileContentBody),
        contentType: 'application/json',
        status: 200,
      });
    }
  );
}

function readStoredSelectedFilePath(page: Page) {
  return page.evaluate((targetKey) => {
    const raw = window.localStorage.getItem('yyork.home.workspace-preferences');
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      canvasSelectedFilePaths?: Record<string, string>;
    };

    return parsed.canvasSelectedFilePaths?.[targetKey] ?? null;
  }, TARGET_KEY);
}

async function ensureCanvasOpen(page: Page) {
  const toggle = page.getByRole('button', {
    name: /Canvas side panel/,
  });
  await expect(toggle).toBeVisible({ timeout: 15_000 });

  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click();
  }

  await expect(
    page.getByRole('button', { name: 'Close Canvas side panel' })
  ).toBeVisible();
}

async function openCanvasFilesTab(page: Page) {
  await page.goto(`/terminal/${SESSION_ID}?project=${PROJECT_ID}`);
  await ensureCanvasOpen(page);
  await expect(page.getByRole('tab', { name: 'Files' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByLabel('Workspace files')).toBeVisible();
}

async function switchCanvasTab(page: Page, tab: 'Files' | 'Review' | 'Browser') {
  await ensureCanvasOpen(page);
  await page
    .locator('[data-slot="tabs-trigger"]', { hasText: tab })
    .click({ force: true });
  await expect(
    page.locator('[data-slot="tabs-trigger"]', { hasText: tab })
  ).toHaveAttribute('aria-selected', 'true');
}

async function selectReadmeFile(page: Page) {
  const readmeItem = page.getByRole('treeitem', { name: SELECTED_FILE });
  await expect(readmeItem).toBeVisible();
  await readmeItem.click();
  await expect(page.getByLabel('Selected file')).toContainText(SELECTED_FILE);
  await expect
    .poll(() => readStoredSelectedFilePath(page))
    .toBe(SELECTED_FILE);
}

test('canvas persists selected file across canvas tab switches', async ({
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await installCanvasRoutes(page);
  await openCanvasFilesTab(page);
  await selectReadmeFile(page);

  await switchCanvasTab(page, 'Review');
  await switchCanvasTab(page, 'Files');
  await expect(page.getByLabel('Selected file')).toContainText(SELECTED_FILE);
  await expect
    .poll(() => readStoredSelectedFilePath(page))
    .toBe(SELECTED_FILE);
});

test('canvas restores selected file after reload and tab reopen', async ({
  context,
  page,
}) => {
  await installFakeTerminalWebSocket(page);
  await installCanvasRoutes(page);
  await openCanvasFilesTab(page);
  await selectReadmeFile(page);

  await page.reload();
  await ensureCanvasOpen(page);
  await expect(page.getByLabel('Selected file')).toContainText(SELECTED_FILE, {
    timeout: 15_000,
  });
  await expect
    .poll(() => readStoredSelectedFilePath(page))
    .toBe(SELECTED_FILE);

  const reopenedPage = await context.newPage();
  await installFakeTerminalWebSocket(reopenedPage);
  await installCanvasRoutes(reopenedPage);
  await reopenedPage.goto(`/terminal/${SESSION_ID}?project=${PROJECT_ID}`);
  await ensureCanvasOpen(reopenedPage);
  await expect(reopenedPage.getByLabel('Selected file')).toContainText(
    SELECTED_FILE,
    { timeout: 15_000 }
  );
  await expect
    .poll(() => readStoredSelectedFilePath(reopenedPage))
    .toBe(SELECTED_FILE);
  await reopenedPage.close();
});
