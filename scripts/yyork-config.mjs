import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const webEnvFileNames = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
];

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

export function resolveDevConfig(options) {
  const env = options.env ?? process.env;
  const webEnv = readEnvFiles(options.webDir, webEnvFileNames);

  return {
    backendHost: env.YYORK_BACKEND_HOST ?? '127.0.0.1',
    backendPort: parsePort(
      'YYORK_BACKEND_PORT',
      env.YYORK_BACKEND_PORT,
      7331
    ),
    webPort: parsePort(
      'VITE_PORT',
      firstNonEmpty(env.VITE_PORT, webEnv.VITE_PORT),
      3000
    ),
  };
}

export function readEnvFiles(dir, fileNames) {
  const values = {};

  for (const fileName of fileNames) {
    const path = resolve(dir, fileName);
    if (!existsSync(path)) {
      continue;
    }

    Object.assign(values, parseEnvFile(readFileSync(path, 'utf8')));
  }

  return values;
}

export function parseEnvFile(contents) {
  const values = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const assignment = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;
    const separatorIndex = assignment.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = assignment.slice(0, separatorIndex).trim();
    const value = assignment.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    values[key] = unquoteEnvValue(value);
  }

  return values;
}

export function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== '') ?? '';
}

export function parsePort(name, value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new UsageError(
      `${name} must be an integer port between 1 and 65535.`
    );
  }

  return port;
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
