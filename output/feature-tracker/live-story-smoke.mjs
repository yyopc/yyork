import fs from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, request } from 'playwright';

const baseURL = process.env.YYORK_BASE_URL ?? 'https://yyork.localhost';
const apiHost = process.env.YYORK_API_URL ?? 'https://api.yyork.localhost';
const docsURL = process.env.YYORK_DOCS_URL ?? 'https://docs.yyork.localhost';
const outputDir = dirname(fileURLToPath(import.meta.url));
const outputPath = `${outputDir}/live-story-smoke-results.json`;

const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function bodyPreview(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 400);
}

async function check(featureIds, name, fn) {
  const ids = Array.isArray(featureIds) ? featureIds : [featureIds];
  const startedAt = new Date().toISOString();
  try {
    const details = await fn();
    results.push({
      details,
      featureIds: ids,
      name,
      startedAt,
      status: 'pass',
    });
  } catch (error) {
    results.push({
      error: error instanceof Error ? error.message : String(error),
      featureIds: ids,
      name,
      startedAt,
      status: 'fail',
    });
  }
}

async function text(page) {
  return page.locator('body').innerText({ timeout: 10_000 });
}

async function expectVisibleText(page, value, timeout = 5_000) {
  await page.getByText(value, { exact: false }).first().waitFor({
    state: 'visible',
    timeout,
  });
}

async function collectRuntimeEvents(page) {
  const events = [];
  page.on('pageerror', (error) => {
    events.push(['pageerror', error.message]);
  });
  page.on('console', (message) => {
    if (message.type() === 'debug' || message.type() === 'info') {
      return;
    }
    events.push([`console:${message.type()}`, message.text()]);
  });
  page.on('requestfailed', (request) => {
    events.push([
      'requestfailed',
      request.url(),
      request.failure()?.errorText ?? '',
    ]);
  });
  return events;
}

function appErrors(events) {
  return events.filter(([kind, message]) => {
    if (
      kind === 'console:warning' &&
      String(message).includes('GL Driver Message')
    ) {
      return false;
    }
    return true;
  });
}

async function openPage(browser, path = '/') {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { height: 900, width: 1440 },
  });
  const page = await context.newPage();
  const events = await collectRuntimeEvents(page);
  await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return { context, events, page };
}

const isolatedWorkspace = {
  activeProjectId: 'project-alpha',
  orchestrators: [
    {
      agent: 'codex',
      createdAt: '2026-06-01T10:00:00.000Z',
      cwd: '/tmp/project-alpha',
      description: 'Coordinates the isolated smoke project.',
      id: 'orch-alpha',
      issue: 'Orchestrator',
      kind: 'orchestrator',
      metadata: '{}',
      project: 'project-alpha',
      recap: 'Coordinates the isolated smoke project.',
      state: 'working',
      terminalSupported: true,
      title: 'Orchestrator',
      updatedAt: '2026-06-01T10:05:00.000Z',
      workerId: '[ORCHESTRATOR]',
    },
  ],
  projects: [
    {
      cwd: '/tmp/project-alpha',
      id: 'project-alpha',
      name: 'Project Alpha',
      path: '/tmp/project-alpha',
      workerWorkspaceMode: 'local',
    },
  ],
  sessions: [
    {
      agent: 'codex',
      createdAt: '2026-06-01T10:10:00.000Z',
      cwd: '/tmp/project-alpha',
      description: 'Working through an isolated smoke behavior.',
      id: 'worker-alpha',
      issue: 'Smoke',
      metadata: JSON.stringify({
        activity: 'working',
        recap: 'Working through an isolated smoke behavior.',
        title: 'Worker Task',
      }),
      project: 'project-alpha',
      recap: 'Working through an isolated smoke behavior.',
      state: 'working',
      terminalSupported: true,
      title: 'Worker Task',
      updatedAt: '2026-06-01T10:15:00.000Z',
      workerId: 'worker-alpha',
    },
  ],
};

const isolatedWorkspacePreferences = {
  canvasOpen: false,
  openProjectIds: ['project-alpha'],
  openWorkerSessionGroupIds: ['working', 'prompt', 'triage', 'done'],
  pinnedProjectIds: ['project-alpha'],
  pinnedTerminalSessionKeys: ['project-alpha:worker-alpha'],
  sidebarOpen: true,
  version: 1,
};

async function openIsolatedWorkspacePage(
  browser,
  path = '/board/project-alpha'
) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { height: 900, width: 1440 },
  });
  let workspacePayload = JSON.parse(JSON.stringify(isolatedWorkspace));
  await context.addInitScript((preferences) => {
    window.localStorage.setItem(
      'yyork.home.workspace-preferences',
      JSON.stringify(preferences)
    );
  }, isolatedWorkspacePreferences);

  const apiMutations = [];
  await context.route('**/api/workspace', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: workspacePayload,
    })
  );
  await context.route('**/api/events', (route) =>
    route.fulfill({
      body: ': connected\n\n',
      contentType: 'text/event-stream',
      status: 200,
    })
  );
  await context.route('**/api/projects/**', (route) => {
    const request = route.request();
    apiMutations.push({ method: request.method(), url: request.url() });
    if (request.method() === 'DELETE') {
      workspacePayload = {
        activeProjectId: '',
        orchestrators: [],
        projects: [],
        sessions: [],
      };
    }
    return route.fulfill({ body: '', status: 204 });
  });
  await context.route('**/api/sessions/**', (route) => {
    const request = route.request();
    apiMutations.push({ method: request.method(), url: request.url() });
    return route.fulfill({ body: '', status: 204 });
  });

  const page = await context.newPage();
  const events = await collectRuntimeEvents(page);
  await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return { apiMutations, context, events, page };
}

async function readHomeWorkspacePreferences(page) {
  return page.evaluate(() =>
    JSON.parse(
      window.localStorage.getItem('yyork.home.workspace-preferences') ?? '{}'
    )
  );
}

await fs.mkdir(outputDir, { recursive: true });

const api = await request.newContext({
  baseURL,
  ignoreHTTPSErrors: true,
});
const apiRoot = await request.newContext({
  baseURL: apiHost,
  ignoreHTTPSErrors: true,
});

let workspace;
let project;
let orchestrator;

await check('YY-F002', 'dashboard API health endpoint', async () => {
  const response = await api.get('/api/health');
  assert(response.status() === 200, `expected 200, got ${response.status()}`);
  const payload = await response.json();
  assert(
    payload.status === 'ok',
    `unexpected payload ${JSON.stringify(payload)}`
  );
  return payload;
});

await check(
  'YY-F002',
  'API host returns JSON service and JSON 404',
  async () => {
    const root = await apiRoot.get('/');
    const missing = await apiRoot.get('/missing-live-story-smoke');
    assert(root.status() === 200, `api host root status ${root.status()}`);
    assert(
      missing.status() === 404,
      `api host missing status ${missing.status()}`
    );
    assert(
      (missing.headers()['content-type'] ?? '').includes('application/json'),
      `api host missing content-type ${missing.headers()['content-type']}`
    );
    return {
      missing: await missing.text(),
      root: await root.json(),
    };
  }
);

await check(
  ['YY-F003', 'YY-F037'],
  'workspace contract loads and contains arrays',
  async () => {
    const response = await api.get('/api/workspace');
    assert(response.status() === 200, `workspace status ${response.status()}`);
    workspace = await response.json();
    assert(Array.isArray(workspace.projects), 'projects is not an array');
    assert(Array.isArray(workspace.sessions), 'sessions is not an array');
    assert(
      Array.isArray(workspace.orchestrators),
      'orchestrators is not an array'
    );
    project =
      workspace.projects.find((item) => item.name === 'yyork') ??
      workspace.projects[0];
    assert(project, 'no project available for live UI checks');
    orchestrator =
      workspace.orchestrators.find(
        (item) =>
          item.project === project.id || item.projectPath === project.path
      ) ?? workspace.orchestrators[0];
    assert(orchestrator, 'no orchestrator available for terminal checks');
    return {
      activeProjectId: workspace.activeProjectId,
      orchestratorId: orchestrator.id,
      projectId: project.id,
      projectName: project.name,
      projects: workspace.projects.length,
    };
  }
);

await check('YY-F006', 'invalid project payloads are actionable', async () => {
  const empty = await api.post('/api/projects', { data: { path: '' } });
  const outsideGit = await api.post('/api/projects', {
    data: { path: '/tmp/yyork-live-story-smoke-not-a-repo' },
  });
  const emptyText = await empty.text();
  const outsideText = await outsideGit.text();
  assert(empty.status() === 400, `empty path status ${empty.status()}`);
  assert(emptyText.includes('path is required'), emptyText);
  assert(
    outsideGit.status() === 400,
    `outside git status ${outsideGit.status()}`
  );
  assert(outsideText.includes('not inside a git repository'), outsideText);
  return { emptyText, outsideText };
});

await check(
  'YY-F012',
  'invalid worker workspace mode is rejected without mutation',
  async () => {
    const response = await api.patch('/api/projects/worker-workspace', {
      data: {
        projectId: project.id,
        workerWorkspaceMode: 'sideways',
      },
    });
    const message = await response.text();
    assert(response.status() === 400, `status ${response.status()}`);
    assert(message.includes('workerWorkspaceMode'), message);
    return message.trim();
  }
);

await check(
  'YY-F038',
  'legacy sessions API lists and filters sessions',
  async () => {
    const all = await api.get('/api/sessions');
    const filtered = await api.get(
      `/api/sessions?project=${encodeURIComponent(project.id)}`
    );
    assert(all.status() === 200, `all sessions status ${all.status()}`);
    assert(
      filtered.status() === 200,
      `filtered sessions status ${filtered.status()}`
    );
    const allRows = await all.json();
    const filteredRows = await filtered.json();
    assert(Array.isArray(allRows), 'all sessions response is not an array');
    assert(
      Array.isArray(filteredRows),
      'filtered sessions response is not an array'
    );
    return { all: allRows.length, filtered: filteredRows.length };
  }
);

await check('YY-F039', 'plugins endpoint returns JSON', async () => {
  const response = await api.get('/api/plugins');
  assert(response.status() === 200, `plugins status ${response.status()}`);
  const payload = await response.json();
  return { type: Array.isArray(payload) ? 'array' : typeof payload };
});

await check(
  'YY-F037',
  'events publish endpoint rejects unauthenticated browser calls',
  async () => {
    const response = await api.post('/api/events', {
      data: { type: 'session.created', sessionId: 'fake' },
    });
    const message = await response.text();
    assert(response.status() === 403, `events status ${response.status()}`);
    assert(message.includes('forbidden'), message);
    return message.trim();
  }
);

await check(
  'YY-F034',
  'browser preview target validation accepts local and rejects external hosts',
  async () => {
    const local = await api.post('/api/browser-preview/targets', {
      data: { url: baseURL },
    });
    const external = await api.post('/api/browser-preview/targets', {
      data: { url: 'https://example.com' },
    });
    assert(
      local.status() === 200,
      `local preview status ${local.status()}: ${await local.text()}`
    );
    const localPayload = await local.json();
    assert(
      localPayload.previewUrl?.includes('preview.yyork.localhost'),
      JSON.stringify(localPayload)
    );
    assert(
      external.status() === 422,
      `external preview status ${external.status()}`
    );
    return {
      external: (await external.text()).trim(),
      local: localPayload,
    };
  }
);

await check(
  ['YY-F029', 'YY-F030'],
  'session files API lists workspace and blocks traversal',
  async () => {
    const list = await api.get(
      `/api/sessions/${encodeURIComponent(orchestrator.id)}/files?project=${encodeURIComponent(project.id)}`
    );
    assert(
      list.status() === 200,
      `files status ${list.status()}: ${await list.text()}`
    );
    const tree = await list.json();
    const traversal = await api.get(
      `/api/sessions/${encodeURIComponent(orchestrator.id)}/files/content?project=${encodeURIComponent(project.id)}&path=${encodeURIComponent('../secret.txt')}`
    );
    assert(
      traversal.status() === 400,
      `traversal status ${traversal.status()}`
    );
    return {
      traversal: (await traversal.text()).trim(),
      treeKeys: Object.keys(tree).slice(0, 10),
    };
  }
);

await check('YY-F031', 'session diff API returns review payload', async () => {
  const response = await api.get(
    `/api/sessions/${encodeURIComponent(orchestrator.id)}/canvas/diff?project=${encodeURIComponent(project.id)}`
  );
  assert(
    response.status() === 200,
    `diff status ${response.status()}: ${await response.text()}`
  );
  const payload = await response.json();
  return {
    additions: payload.additions,
    deletions: payload.deletions,
    files: payload.files?.length ?? payload.fileCount,
  };
});

await check(
  'YY-F035',
  'empty annotation payload is rejected safely',
  async () => {
    const response = await api.post(
      `/api/annotations/${encodeURIComponent(orchestrator.id)}?project=${encodeURIComponent(project.id)}`,
      { data: { annotations: [] } }
    );
    const message = await response.text();
    assert(response.status() === 400, `annotation status ${response.status()}`);
    assert(message.includes('no annotations'), message);
    return message.trim();
  }
);

const browser = await chromium.launch({ headless: true });

await check(
  'YY-F008',
  'project removal calls backend and clears local sidebar state',
  async () => {
    const { apiMutations, context, events, page } =
      await openIsolatedWorkspacePage(browser);
    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await expectVisibleText(page, 'Project Alpha');
    await page.getByRole('button', { name: 'Project Alpha actions' }).click();
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().includes('/api/projects/project-alpha')
    );
    await page.getByRole('menuitem', { name: 'Remove project' }).click();
    await deleteResponse;
    await page.waitForFunction(
      () => !document.body.innerText.includes('Project Alpha')
    );
    const preferences = await readHomeWorkspacePreferences(page);
    const errors = appErrors(events).filter(
      ([kind, value]) =>
        !(
          kind === 'requestfailed' &&
          String(value).includes('/api/projects/project-alpha')
        )
    );
    assert(errors.length === 0, JSON.stringify(errors));
    assert(
      apiMutations.some((request) => request.method === 'DELETE'),
      `expected backend remove request ${JSON.stringify(apiMutations)}`
    );
    await context.close();
    return {
      hiddenProjectIds: preferences.hiddenProjectIds,
      pinnedProjectIds: preferences.pinnedProjectIds,
      apiMutations,
    };
  }
);

await check(
  'YY-F009',
  'project rename stores a trimmed local display override',
  async () => {
    const { apiMutations, context, events, page } =
      await openIsolatedWorkspacePage(browser);
    await page.evaluate(() => {
      window.prompt = () => '  Renamed Alpha  ';
    });
    await page.getByRole('button', { name: 'Project Alpha actions' }).click();
    await page.getByRole('menuitem', { name: 'Rename project' }).click();
    await page.waitForFunction(() => {
      const raw = window.localStorage.getItem(
        'yyork.home.workspace-preferences'
      );
      return raw
        ? JSON.parse(raw).projectNameOverrides?.['project-alpha'] ===
            'Renamed Alpha'
        : false;
    });
    await expectVisibleText(page, 'Renamed Alpha');
    const preferences = await readHomeWorkspacePreferences(page);
    const errors = appErrors(events);
    assert(errors.length === 0, JSON.stringify(errors));
    assert(
      apiMutations.length === 0,
      `rename project should stay local, got ${JSON.stringify(apiMutations)}`
    );
    await context.close();
    return {
      override: preferences.projectNameOverrides?.['project-alpha'],
    };
  }
);

await check(
  'YY-F025',
  'session hide removes sidebar row without stopping session',
  async () => {
    const { apiMutations, context, events, page } =
      await openIsolatedWorkspacePage(browser);
    await page.evaluate(() => {
      window.confirm = () => true;
    });
    const workerRow = page.getByRole('button', {
      name: 'Open Worker Task terminal',
    });
    await workerRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Hide from sidebar' }).click();
    await page.waitForFunction(() => {
      const raw = window.localStorage.getItem(
        'yyork.home.workspace-preferences'
      );
      return raw
        ? JSON.parse(raw).hiddenTerminalSessionKeys?.includes(
            'project-alpha:worker-alpha'
          )
        : false;
    });
    const preferences = await readHomeWorkspacePreferences(page);
    const errors = appErrors(events);
    assert(errors.length === 0, JSON.stringify(errors));
    assert(
      apiMutations.every((request) => request.method !== 'DELETE'),
      `hide session should not stop it, got ${JSON.stringify(apiMutations)}`
    );
    await context.close();
    return {
      hiddenTerminalSessionKeys: preferences.hiddenTerminalSessionKeys,
      pinnedTerminalSessionKeys: preferences.pinnedTerminalSessionKeys,
      apiMutations,
    };
  }
);

await check(
  [
    'YY-F001',
    'YY-F003',
    'YY-F007',
    'YY-F010',
    'YY-F013',
    'YY-F014',
    'YY-F015',
    'YY-F020',
    'YY-F027',
    'YY-F028',
  ],
  'root route renders live app shell without app errors',
  async () => {
    const { context, events, page } = await openPage(browser, '/');
    const body = await text(page);
    assert(body.includes('Projects'), bodyPreview(body));
    assert(body.includes(project.name), bodyPreview(body));
    assert(body.includes('Pinned'), bodyPreview(body));
    assert(body.includes('Settings'), bodyPreview(body));
    assert(
      await page
        .getByRole('button', { name: 'Open Canvas side panel' })
        .isVisible(),
      bodyPreview(body)
    );
    assert(
      documentScriptsCountAvailable(
        await page.evaluate(
          () => document.querySelectorAll('#root script').length
        )
      ),
      'root contains script tags'
    );
    const errors = appErrors(events);
    assert(errors.length === 0, JSON.stringify(errors));
    await page.screenshot({
      path: `${outputDir}/live-story-root-shell.png`,
      fullPage: true,
    });
    const route = page.url();
    await context.close();
    return { route, preview: bodyPreview(body) };
  }
);

await check(
  ['YY-F017', 'YY-F018', 'YY-F019'],
  'board route shows columns and canonical project route',
  async () => {
    const { context, page } = await openPage(browser, `/board/${project.id}`);
    const body = await text(page);
    for (const label of ['Working', 'Prompt', 'Triage', 'Done']) {
      assert(
        body.includes(label),
        `missing board label ${label}: ${bodyPreview(body)}`
      );
    }
    assert(
      page.url().includes(`/board/${project.id}`),
      `unexpected URL ${page.url()}`
    );
    await page.screenshot({
      path: `${outputDir}/live-story-board.png`,
      fullPage: true,
    });
    const route = page.url();
    await context.close();
    return { route, preview: bodyPreview(body) };
  }
);

await check(
  [
    'YY-F020',
    'YY-F021',
    'YY-F022',
    'YY-F023',
    'YY-F027',
    'YY-F028',
    'YY-F029',
    'YY-F030',
    'YY-F031',
    'YY-F032',
  ],
  'terminal route exposes terminal canvas controls',
  async () => {
    const path = `/terminal/${encodeURIComponent(orchestrator.id)}?project=${encodeURIComponent(project.id)}`;
    const { context, events, page } = await openPage(browser, path);
    const body = await text(page);
    assert(body.includes('Open IDE'), bodyPreview(body));
    assert(body.includes('Select a file'), bodyPreview(body));
    await page.getByRole('button', { name: 'Open Canvas side panel' }).click();
    await page.getByRole('tab', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Refresh diff' }).waitFor({
      state: 'visible',
      timeout: 5_000,
    });
    await page.getByRole('tab', { name: 'Browser' }).click();
    await expectVisibleText(page, 'Enter a local preview URL');
    const errors = appErrors(events);
    assert(errors.length === 0, JSON.stringify(errors));
    await page.screenshot({
      path: `${outputDir}/live-story-terminal-canvas.png`,
      fullPage: true,
    });
    const route = page.url();
    const preview = bodyPreview(await text(page));
    await context.close();
    return { route, preview };
  }
);

await check(
  ['YY-F013', 'YY-F036'],
  'theme setting changes local preference and html class',
  async () => {
    const { context, page } = await openPage(browser, '/');
    await page.getByRole('button', { name: 'Expand project sidebar' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('menuitem', { name: 'Theme' }).click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('dark')
    );
    const stored = await page.evaluate(() => localStorage.getItem('theme'));
    assert(stored === 'dark', `stored theme ${stored}`);
    await context.close();
    return { stored };
  }
);

await check(
  ['YY-F015', 'YY-F016'],
  'command palette opens with keyboard shortcut and runs navigation action',
  async () => {
    const { context, page } = await openPage(browser, '/');
    await page.keyboard.press('Meta+K');
    await page.getByPlaceholder('Search boards, sessions, actions...').waitFor({
      state: 'visible',
      timeout: 5_000,
    });
    await page.keyboard.type(project.name);
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => url.href.includes(`/board/${project.id}`), {
      timeout: 5_000,
    });
    const route = page.url();
    await context.close();
    return { route };
  }
);

await check(
  ['YY-F004', 'YY-F005'],
  'empty workspace shows add-project guidance without live mutation',
  async () => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { height: 900, width: 1440 },
    });
    const page = await context.newPage();
    await page.route('**/api/workspace', (route) =>
      route.fulfill({
        contentType: 'application/json',
        json: {
          activeProjectId: '',
          orchestrators: [],
          projects: [],
          sessions: [],
        },
      })
    );
    await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
    await expectVisibleText(page, 'No projects yet');
    await expectVisibleText(page, 'Add project');
    await page.screenshot({
      path: `${outputDir}/live-story-empty-workspace.png`,
      fullPage: true,
    });
    await context.close();
    return 'mocked empty workspace rendered';
  }
);

await check(
  ['YY-F046', 'YY-F047'],
  'first-run setup stages project and submits agent choices',
  async () => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { height: 900, width: 1440 },
    });
    const projectPosts = [];
    const page = await context.newPage();
    const events = await collectRuntimeEvents(page);
    await page.route('**/api/workspace', (route) =>
      route.fulfill({
        contentType: 'application/json',
        json: {
          activeProjectId: '',
          orchestrators: [],
          projects: [],
          sessions: [],
        },
      })
    );
    await page.route('**/api/events', (route) =>
      route.fulfill({
        body: ': connected\n\n',
        contentType: 'text/event-stream',
        status: 200,
      })
    );
    await page.route('**/api/projects/choose-directory', (route) =>
      route.fulfill({
        contentType: 'application/json',
        json: { path: '/tmp/first-run-project' },
      })
    );
    await page.route('**/api/projects', async (route) => {
      const request = route.request();
      projectPosts.push({
        body: request.postDataJSON(),
        method: request.method(),
        url: request.url(),
      });
      return route.fulfill({
        contentType: 'application/json',
        json: {
          created: true,
          id: 'first-run-project',
          name: 'first-run-project',
          path: '/tmp/first-run-project',
        },
      });
    });

    await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
    await expectVisibleText(page, 'No projects yet');
    await page.getByRole('button', { name: 'Add project' }).first().click();
    await expectVisibleText(page, 'Agents');
    await expectVisibleText(page, '/tmp/first-run-project');
    await page.waitForFunction(() => {
      const raw = window.localStorage.getItem(
        'yyork.home.first-run-project-setup-draft'
      );
      return raw
        ? JSON.parse(raw).projectPath === '/tmp/first-run-project'
        : false;
    });
    const rememberLabels = page.locator('label').filter({
      hasText: 'Remember for new projects',
    });
    await rememberLabels.nth(0).click({ position: { x: 8, y: 8 } });
    await rememberLabels.nth(1).click({ position: { x: 8, y: 8 } });
    await page.getByRole('button', { name: 'Start project' }).click();
    await page.waitForURL(
      (url) => url.href.includes('/board/first-run-project'),
      {
        timeout: 5_000,
      }
    );
    await page.waitForFunction(
      () =>
        window.localStorage.getItem(
          'yyork.home.first-run-project-setup-draft'
        ) === null
    );
    const defaults = await page.evaluate(() =>
      JSON.parse(
        window.localStorage.getItem('yyork.home.agent-harness-defaults') ?? '{}'
      )
    );
    const errors = appErrors(events);
    assert(errors.length === 0, JSON.stringify(errors));
    assert(
      projectPosts.length === 1,
      `expected one project POST, got ${projectPosts.length}`
    );
    assert(
      projectPosts[0].method === 'POST',
      `unexpected method ${projectPosts[0].method}`
    );
    assert(
      projectPosts[0].body.path === '/tmp/first-run-project',
      JSON.stringify(projectPosts[0].body)
    );
    assert(
      projectPosts[0].body.agentPlugin === 'claude-code',
      JSON.stringify(projectPosts[0].body)
    );
    assert(
      projectPosts[0].body.workerAgentPlugin === 'codex',
      JSON.stringify(projectPosts[0].body)
    );
    assert(
      defaults.orchestratorHarnessId === 'claude-code',
      JSON.stringify(defaults)
    );
    assert(defaults.workerHarnessId === 'codex', JSON.stringify(defaults));
    await page.screenshot({
      path: `${outputDir}/live-story-first-run-setup.png`,
      fullPage: true,
    });
    await context.close();
    return { defaults, projectPost: projectPosts[0] };
  }
);

await check(
  ['YY-F003', 'YY-F040'],
  'workspace load failure renders readable unavailable state',
  async () => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { height: 900, width: 1440 },
    });
    const page = await context.newPage();
    await page.route('**/api/workspace', (route) =>
      route.fulfill({
        body: 'workspace exploded',
        contentType: 'text/plain',
        status: 500,
      })
    );
    await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
    await expectVisibleText(page, 'Workspace unavailable');
    await page.screenshot({
      path: `${outputDir}/live-story-workspace-error.png`,
      fullPage: true,
    });
    await context.close();
    return 'mocked workspace error rendered';
  }
);

await check(
  'YY-F040',
  'unknown route renders route-level 404 page',
  async () => {
    const { context, page } = await openPage(
      browser,
      '/not-a-real-yyork-route'
    );
    const body = await text(page);
    assert(/not found|404/i.test(body), bodyPreview(body));
    await context.close();
    return bodyPreview(body);
  }
);

await check(
  'YY-F041',
  'dev-only Glimm tool can be requested explicitly',
  async () => {
    const { context, page } = await openPage(browser, '/?glimmDevtool');
    const body = await text(page);
    assert(body.includes('Projects'), bodyPreview(body));
    await context.close();
    return 'route rendered with glimmDevtool query';
  }
);

await check(
  'YY-F042',
  'settings prototype renders on mock query route',
  async () => {
    const { context, page } = await openPage(browser, '/?mock=settings');
    const body = await text(page);
    assert(
      body.includes('Agent preferences') || body.includes('First run'),
      bodyPreview(body)
    );
    await page.screenshot({
      path: `${outputDir}/live-story-settings-prototype.png`,
      fullPage: true,
    });
    await context.close();
    return bodyPreview(body);
  }
);

await check('YY-F043', 'static app assets are available', async () => {
  const favicon = await api.get('/favicon.svg');
  const manifest = await api.get('/site.webmanifest');
  assert(favicon.status() === 200, `favicon status ${favicon.status()}`);
  assert(manifest.status() === 200, `manifest status ${manifest.status()}`);
  return {
    faviconType: favicon.headers()['content-type'],
    manifestType: manifest.headers()['content-type'],
  };
});

await check(
  ['YY-F044', 'YY-F045'],
  'live dashboard runtime is healthy through portless URL',
  async () => {
    const health = await api.get('/api/health');
    const root = await api.get('/');
    assert(health.status() === 200, `health status ${health.status()}`);
    assert(root.status() === 200, `root status ${root.status()}`);
    assert(
      (await root.text()).includes('<div id="root"'),
      'root HTML missing app mount'
    );
    return { baseURL };
  }
);

await check(
  'YY-F049',
  'docs app renders design record and docs routes',
  async () => {
    const docs = await request.newContext({
      baseURL: docsURL,
      ignoreHTTPSErrors: true,
    });
    try {
      const home = await docs.get('/');
      assert(home.status() === 200, `docs home status ${home.status()}`);
      const homeText = await home.text();
      assert(homeText.includes('yyork design record'), bodyPreview(homeText));
      assert(homeText.includes('Read decisions'), bodyPreview(homeText));

      const decisions = await docs.get('/docs/decisions');
      assert(
        decisions.status() === 200,
        `docs decisions status ${decisions.status()}`
      );
      const decisionsText = await decisions.text();
      assert(decisionsText.includes('Decision'), bodyPreview(decisionsText));

      const missing = await docs.get('/docs/does-not-exist');
      assert(
        missing.status() === 404,
        `docs missing status ${missing.status()}`
      );
      return { docsURL };
    } finally {
      await docs.dispose();
    }
  }
);

await browser.close();
await api.dispose();
await apiRoot.dispose();

function documentScriptsCountAvailable(count) {
  return count === 0;
}

const summary = {
  baseURL,
  failed: results.filter((item) => item.status === 'fail').length,
  generatedAt: new Date().toISOString(),
  passed: results.filter((item) => item.status === 'pass').length,
  results,
  total: results.length,
};

await fs.writeFile(outputPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
