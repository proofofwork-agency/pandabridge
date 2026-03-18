import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, accessSync, constants } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { Config } from '../config.js';
import { log, logCritical } from '../log.js';
import { CDP_STARTUP_MAX_ATTEMPTS, CDP_STARTUP_DELAY_MS } from '../util/constants.js';

let childProcess: ChildProcess | null = null;

const SUSPICIOUS_CHARS = /[;&|`$(){}!#<>\n\r]/;

/**
 * Validates that the binary path points to a real, executable Lightpanda binary.
 * Mitigates command-injection via a malicious LIGHTPANDA_BINARY value.
 */
function validateBinaryPath(binaryPath: string): void {
  if (SUSPICIOUS_CHARS.test(binaryPath)) {
    throw new Error(
      `Binary path contains suspicious characters: "${binaryPath}". Refusing to execute.`,
    );
  }

  const resolved = resolve(binaryPath);

  if (!existsSync(resolved)) {
    throw new Error(`Lightpanda binary not found: ${resolved}`);
  }

  try {
    accessSync(resolved, constants.X_OK);
  } catch {
    throw new Error(`Lightpanda binary is not executable: ${resolved}`);
  }

  const name = basename(resolved).toLowerCase();
  if (!name.includes('lightpanda')) {
    throw new Error(
      `Binary name "${basename(resolved)}" does not look like a Lightpanda executable. ` +
      'Set LIGHTPANDA_BINARY to the correct path.',
    );
  }
}

export async function maybeStartLightpanda(config: Config): Promise<void> {
  if (!config.binary) return;

  validateBinaryPath(config.binary);

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
  const maxAttempts = CDP_STARTUP_MAX_ATTEMPTS;
  const delay = CDP_STARTUP_DELAY_MS;

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
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(`Lightpanda CDP did not become ready at ${url} after ${maxAttempts * delay}ms`);
}

export function killLightpanda(): void {
  if (childProcess) {
    childProcess.kill('SIGTERM');
    childProcess = null;
  }
}
