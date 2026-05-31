#!/usr/bin/env node
// Mirrors web/dist/ into cmd/better-ao/dashboard/ so the //go:embed
// directive in cmd/better-ao/dashboard.go picks up the latest dashboard
// build. Used by `pnpm backend:build`; the destination directory is
// gitignored except for a sentinel .gitkeep.
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(rootDir, 'web', 'dist');
const targetDir = resolve(rootDir, 'cmd', 'better-ao', 'dashboard');
const sentinelFile = '.gitkeep';

async function main() {
  await ensureDir(targetDir);

  if (!(await exists(sourceDir))) {
    console.warn(
      `copy-dashboard: ${sourceDir} not found. Run \`pnpm web:build\` first ` +
        `if you want the binary to ship a real dashboard. Continuing with an ` +
        `empty embed — the Go binary will serve a "not built" placeholder.`
    );
    return;
  }

  await clearExceptSentinel(targetDir);
  await cp(sourceDir, targetDir, { recursive: true });
  console.log(`copy-dashboard: ${sourceDir} → ${targetDir}`);
}

async function clearExceptSentinel(dir) {
  const entries = await readdir(dir);
  await Promise.all(
    entries
      .filter((entry) => entry !== sentinelFile)
      .map((entry) => rm(join(dir, entry), { recursive: true, force: true }))
  );
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

main().catch((error) => {
  console.error('copy-dashboard failed:', error);
  process.exit(1);
});
