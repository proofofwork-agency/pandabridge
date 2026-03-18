/**
 * Shared Lightpanda lifecycle helpers for pandabridge demos.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const DEFAULT_BIN = join(homedir(), '.local', 'bin', 'lightpanda');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function startLightpanda(binPath = DEFAULT_BIN) {
  if (!existsSync(binPath)) {
    console.error(`\x1b[31mLightpanda not found at ${binPath}\x1b[0m`);
    process.exit(1);
  }

  console.log('\x1b[2mStarting Lightpanda...\x1b[0m');
  const proc = spawn(binPath, ['serve', '--host', '127.0.0.1', '--port', '9222'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderr.on('data', (d) => process.stderr.write(`\x1b[2m[lp] ${d}\x1b[0m`));

  try {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9222/json/version');
        if (res.ok) {
          console.log('\x1b[2mLightpanda CDP ready\n\x1b[0m');
          return proc;
        }
      } catch { /* not ready */ }
      await sleep(500);
    }
    throw new Error('Lightpanda did not start in time');
  } catch (err) {
    proc.kill('SIGTERM');
    throw err;
  }
}

export function stopLightpanda(proc) {
  if (proc) {
    proc.kill('SIGTERM');
  }
}
