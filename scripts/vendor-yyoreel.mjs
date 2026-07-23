import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const yyoreelRoot = resolve(
  process.env.YYOREEL_REPO ?? resolve(repoRoot, '..', 'yyoreel')
);
const vendorDir = resolve(repoRoot, 'third_party', 'yyoreel');
const corePackageDir = resolve(yyoreelRoot, 'packages', '@yyoreel', 'core');
const cliPackageDir = resolve(yyoreelRoot, 'packages', 'yyoreel');

for (const manifest of [
  resolve(yyoreelRoot, 'package.json'),
  resolve(corePackageDir, 'package.json'),
  resolve(cliPackageDir, 'package.json'),
]) {
  if (!existsSync(manifest)) {
    throw new Error(
      `Missing yyoreel package manifest at ${manifest}. Set YYOREEL_REPO to the fork checkout.`
    );
  }
}

function run(args, cwd) {
  const result = spawnSync('pnpm', args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `pnpm ${args.join(' ')} failed with exit code ${result.status}`
    );
  }
}

mkdirSync(vendorDir, { recursive: true });

run(['install'], yyoreelRoot);
run(['build'], yyoreelRoot);
run(
  ['pack', '--out', resolve(vendorDir, 'yyoreel-core-0.1.4.tgz')],
  corePackageDir
);
run(['pack', '--out', resolve(vendorDir, 'yyoreel-0.1.4.tgz')], cliPackageDir);
run(['install'], repoRoot);

console.log(`Refreshed vendored yyoreel tarballs from ${yyoreelRoot}`);
