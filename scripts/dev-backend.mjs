import { spawn, spawnSync } from 'node:child_process';

const backendOrigin =
  process.env.VITE_BACKEND_ORIGIN ?? 'http://127.0.0.1:7331';
const backendArgs = ['run', './cmd/yyork', '-open=false'];

if (await isHealthyBackend(backendOrigin)) {
  console.log(`Reusing yyork backend at ${backendOrigin}`);
  holdOpen();
} else if (hasCommand('go', ['version'])) {
  run('go', backendArgs);
} else if (process.platform !== 'win32' && hasCommand('nix', ['--version'])) {
  run('nix', ['develop', '--command', 'go', ...backendArgs]);
} else {
  console.error(
    'Unable to start the backend: install Go or run from a Nix dev shell.'
  );
  process.exit(1);
}

async function isHealthyBackend(origin) {
  try {
    const response = await fetch(new URL('/api/health', origin), {
      signal: AbortSignal.timeout(500),
    });

    return response.ok;
  } catch {
    return false;
  }
}

function hasCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0;
}

function run(command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

function holdOpen() {
  const interval = setInterval(() => {}, 60 * 60 * 1000);

  const stop = () => {
    clearInterval(interval);
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
