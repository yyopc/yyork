#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootPackageJSON = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf8')
);
const options = parseArgs(process.argv.slice(2));
const stageParent = mkdtempSync(join(tmpdir(), 'yyork-alias-package-'));
const packageDir = resolve(stageParent, 'yyork');

try {
  stageAliasPackage();

  if (options.publish) {
    const args = ['publish', packageDir];
    if (options.tag) {
      args.push('--tag', options.tag);
    }
    if (options.dryRun) {
      args.push('--dry-run');
    }
    run('npm', args, { cwd: rootDir });
  } else {
    const packDestination =
      options.packDestination ?? resolve(rootDir, 'dist', 'npm');
    mkdirSync(packDestination, { recursive: true });
    run('npm', ['pack', packageDir, '--pack-destination', packDestination], {
      cwd: rootDir,
    });
  }
} finally {
  if (!options.keepStage) {
    rmSync(stageParent, { recursive: true, force: true });
  } else {
    console.log(`Alias package stage kept at ${packageDir}`);
  }
}

function stageAliasPackage() {
  mkdirSync(resolve(packageDir, 'bin'), { recursive: true });
  writeFileSync(
    resolve(packageDir, 'package.json'),
    `${JSON.stringify(aliasPackageJSON(), null, 2)}\n`
  );
  writeFileSync(resolve(packageDir, 'README.md'), aliasReadme());
  const launcherPath = resolve(packageDir, 'bin', 'yyork.mjs');
  writeFileSync(launcherPath, aliasLauncher());
  chmodSync(launcherPath, 0o755);
  copyFileSync(resolve(rootDir, 'LICENSE'), resolve(packageDir, 'LICENSE'));
}

function aliasPackageJSON() {
  return {
    name: 'yyork',
    version: rootPackageJSON.version,
    description: 'Unscoped npm alias for trying the yyork app with npx yyork.',
    homepage: rootPackageJSON.homepage,
    bugs: rootPackageJSON.bugs,
    license: rootPackageJSON.license,
    author: rootPackageJSON.author,
    repository: rootPackageJSON.repository,
    bin: {
      yyork: './bin/yyork.mjs',
    },
    files: ['bin/yyork.mjs', 'LICENSE', 'README.md'],
    dependencies: {
      '@yyopc/yyork': rootPackageJSON.version,
    },
    engines: rootPackageJSON.engines,
  };
}

function aliasReadme() {
  return `# yyork

Unscoped npm alias for [@yyopc/yyork](https://www.npmjs.com/package/@yyopc/yyork).

Try yyork without a global install:

\`\`\`bash
npx yyork ~/Projects/my-app
\`\`\`

For durable use, install the canonical package:

\`\`\`bash
npm i -g @yyopc/yyork
\`\`\`
`;
}

function aliasLauncher() {
  return `#!/usr/bin/env node
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

try {
  const launcherPath = require.resolve('@yyopc/yyork/bin/yyork.mjs');
  await import(pathToFileURL(launcherPath).href);
} catch (error) {
  console.error(
    'yyork could not load @yyopc/yyork. Reinstall yyork or run npx @yyopc/yyork instead.'
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
`;
}

function parseArgs(args) {
  const options = {
    dryRun: false,
    keepStage: false,
    packDestination: null,
    publish: false,
    tag: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--keep-stage':
        options.keepStage = true;
        break;
      case '--pack-destination':
        index += 1;
        if (!args[index]) {
          throw new Error('--pack-destination requires a path.');
        }
        options.packDestination = resolve(args[index]);
        break;
      case '--publish':
        options.publish = true;
        break;
      case '--tag':
        index += 1;
        if (!args[index]) {
          throw new Error('--tag requires an npm dist-tag.');
        }
        options.tag = args[index];
        break;
      case '--help':
        console.log(
          'Usage: node bin/pack-alias-package.mjs [--pack-destination DIR] [--publish] [--tag TAG] [--dry-run] [--keep-stage]'
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.publish && options.packDestination) {
    throw new Error('--publish cannot be combined with --pack-destination.');
  }
  if (options.tag && !options.publish) {
    throw new Error('--tag can only be used with --publish.');
  }
  if (options.dryRun && !options.publish) {
    throw new Error('--dry-run can only be used with --publish.');
  }
  if (!existsSync(resolve(rootDir, 'LICENSE'))) {
    throw new Error('LICENSE is missing.');
  }

  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}.`
    );
  }
}
