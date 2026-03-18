/**
 * Shared MCP stdio client for pandabridge demos.
 * Spawns pandabridge as a child process and provides JSON-RPC helpers.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENTRY = join(__dirname, '..', '..', 'dist', 'index.js');

const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
export const VERSION = pkg.version;
const REQUEST_TIMEOUT = 30_000;

export function createMcpClient(entryPath = DEFAULT_ENTRY, env = {}) {
  if (!existsSync(entryPath)) {
    const root = join(__dirname, '..', '..');
    console.error(`Build pandabridge first: cd ${root} && npm run build`);
    process.exit(1);
  }

  let msgId = 1;
  const pending = new Map();
  let buffer = '';

  const child = spawn('node', [entryPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PANDABRIDGE_DEBUG: 'false', ...env },
  });

  child.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) process.stderr.write(`  \x1b[2m[pandabridge] ${msg}\x1b[0m\n`);
  });

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pending.has(msg.id)) {
          const { resolve } = pending.get(msg.id);
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch { /* skip non-JSON lines */ }
    }
  });

  function rpc(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timeout: ${method} (${REQUEST_TIMEOUT}ms)`));
        }
      }, REQUEST_TIMEOUT);
    });
  }

  function callTool(name, args = {}) {
    return rpc('tools/call', { name, arguments: args });
  }

  function getText(res) {
    return res.result?.content?.[0]?.text ?? '';
  }

  function isError(res) {
    return !!res.result?.isError;
  }

  function kill() {
    for (const { reject } of pending.values()) {
      reject(new Error('MCP client killed'));
    }
    pending.clear();
    child.kill();
  }

  return { rpc, callTool, getText, isError, kill };
}
