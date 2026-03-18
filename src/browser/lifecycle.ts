import { spawn, type ChildProcess } from 'node:child_process';
import type { Config } from '../config.js';
import { log, logCritical } from '../log.js';

let childProcess: ChildProcess | null = null;

export async function maybeStartLightpanda(config: Config): Promise<void> {
  if (!config.binary) return;

  log(`Starting Lightpanda: ${config.binary}`);

  childProcess = spawn(config.binary, [
    'serve',
    '--host', config.host,
    '--port', String(config.port),
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  childProcess.stdout?.on('data', (data: Buffer) => {
    log(`[lightpanda] ${data.toString().trimEnd()}`);
  });

  childProcess.stderr?.on('data', (data: Buffer) => {
    log(`[lightpanda] ${data.toString().trimEnd()}`);
  });

  childProcess.on('exit', (code) => {
    logCritical(`Lightpanda exited with code ${code}`);
    childProcess = null;
  });

  await waitForCDP(config);
}

async function waitForCDP(config: Config): Promise<void> {
  const url = `${config.cdpEndpoint}/json/version`;
  const maxAttempts = 20;
  const delay = 500;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        log('Lightpanda CDP ready');
        return;
      }
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(`Lightpanda CDP did not become ready at ${url} after ${maxAttempts * delay}ms`);
}

export function killLightpanda(): void {
  if (childProcess) {
    childProcess.kill('SIGTERM');
    childProcess = null;
  }
}
