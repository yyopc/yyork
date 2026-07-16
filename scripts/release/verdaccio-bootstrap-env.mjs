import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const publicNpmRegistry = 'https://registry.npmjs.org';

export function createVerdaccioBootstrapEnv(baseEnv, tempDir) {
  const userConfig = resolve(tempDir, '.verdaccio-bootstrap.npmrc');
  writeFileSync(
    userConfig,
    [`registry=${publicNpmRegistry}`, 'fund=false', 'audit=false', ''].join(
      '\n'
    )
  );

  return {
    ...baseEnv,
    NPM_CONFIG_REGISTRY: publicNpmRegistry,
    NPM_CONFIG_USERCONFIG: userConfig,
    npm_config_registry: publicNpmRegistry,
    npm_config_userconfig: userConfig,
  };
}
