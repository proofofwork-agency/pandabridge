#!/usr/bin/env node
/**
 * Pandabridge token efficiency benchmark
 * Usage: node scripts/benchmark.js <url> [--timeout <ms>]
 * Requires: Lightpanda running on default port (127.0.0.1:9222)
 * Requires: npm run build first
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const timeoutIdx = args.indexOf('--timeout');
let timeout = 30000;
if (timeoutIdx !== -1 && args[timeoutIdx + 1]) {
  timeout = parseInt(args[timeoutIdx + 1], 10);
  args.splice(timeoutIdx, 2);
}

const url = args[0];
if (!url) {
  console.error('Usage: node scripts/benchmark.js <url> [--timeout <ms>]');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, '..', 'dist', 'index.js');

// Start pandabridge subprocess
const child = spawn('node', [indexPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
});

let msgId = 1;
const pending = new Map();
let buffer = '';

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
    } catch {}
  }
});

function sendRequest(method, params = {}) {
  const id = msgId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    child.stdin.write(req);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout waiting for response to ${method}`));
      }
    }, timeout);
  });
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

async function run() {
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const nodeVersion = process.version;
  const timestamp = new Date().toISOString().slice(0, 10);

  console.log(`\nPandabridge Benchmark`);
  console.log(`  Version:  ${pkg.version}`);
  console.log(`  Node:     ${nodeVersion}`);
  console.log(`  Date:     ${timestamp}`);
  console.log(`  URL:      ${url}`);
  console.log(`  Timeout:  ${timeout}ms`);

  // Initialize MCP connection
  await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'benchmark', version: '1.0' },
  });

  const results = [];

  // Tool 1: browser_navigate
  const t0 = Date.now();
  const navResult = await sendRequest('tools/call', {
    name: 'browser_navigate',
    arguments: { url },
  });
  const navMs = Date.now() - t0;
  const navText = navResult.result?.content?.[0]?.text ?? '';
  results.push({ tool: 'browser_navigate', chars: navText.length, tokens: estimateTokens(navText), ms: navMs });

  // Tool 2: browser_interactive_elements
  const t1 = Date.now();
  const intResult = await sendRequest('tools/call', {
    name: 'browser_interactive_elements',
    arguments: {},
  });
  const intMs = Date.now() - t1;
  const intText = intResult.result?.content?.[0]?.text ?? '';
  results.push({ tool: 'browser_interactive_elements', chars: intText.length, tokens: estimateTokens(intText), ms: intMs });

  // Tool 3: browser_snapshot
  const t2 = Date.now();
  const snapResult = await sendRequest('tools/call', {
    name: 'browser_snapshot',
    arguments: {},
  });
  const snapMs = Date.now() - t2;
  const snapText = snapResult.result?.content?.[0]?.text ?? '';
  results.push({ tool: 'browser_snapshot', chars: snapText.length, tokens: estimateTokens(snapText), ms: snapMs });

  child.kill();

  // Print results
  console.log(`\nBenchmark results for: ${url}\n`);
  console.log('Tool'.padEnd(35) + 'Chars'.padStart(8) + 'Tokens (~)'.padStart(12) + 'Time (ms)'.padStart(12));
  console.log('-'.repeat(67));
  let totalTokens = 0;
  for (const r of results) {
    console.log(r.tool.padEnd(35) + String(r.chars).padStart(8) + String(r.tokens).padStart(12) + String(r.ms).padStart(12));
    totalTokens += r.tokens;
  }
  console.log('-'.repeat(67));
  console.log('TOTAL'.padEnd(35) + ''.padStart(8) + String(totalTokens).padStart(12));
  console.log(`\nTotal: ~${Math.round(totalTokens / 1000)}K tokens for ${url} (Node ${nodeVersion}, ${timestamp})`);
}

run().catch((err) => {
  console.error('Benchmark failed:', err.message);
  child.kill();
  process.exit(1);
});
