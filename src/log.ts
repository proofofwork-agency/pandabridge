import { getConfig } from './config.js';

export function log(msg: string): void {
  if (getConfig().debug) {
    process.stderr.write(`[pandabridge] ${msg}\n`);
  }
}

export function logCritical(msg: string): void {
  process.stderr.write(`[pandabridge] ${msg}\n`);
}
