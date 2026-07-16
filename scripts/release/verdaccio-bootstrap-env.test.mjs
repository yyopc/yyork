import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createVerdaccioBootstrapEnv,
  publicNpmRegistry,
} from './verdaccio-bootstrap-env.mjs';

test('Verdaccio bootstraps from the public registry before the local registry exists', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'yyork-verdaccio-env-'));
  try {
    const env = createVerdaccioBootstrapEnv(
      {
        NPM_CONFIG_REGISTRY: 'http://127.0.0.1:1',
        npm_config_registry: 'http://127.0.0.1:1',
      },
      tempDir
    );

    assert.equal(env.NPM_CONFIG_REGISTRY, publicNpmRegistry);
    assert.equal(env.npm_config_registry, publicNpmRegistry);
    assert.equal(env.NPM_CONFIG_USERCONFIG, env.npm_config_userconfig);
    assert.match(
      readFileSync(env.NPM_CONFIG_USERCONFIG, 'utf8'),
      new RegExp(`^registry=${publicNpmRegistry}`)
    );
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
});
