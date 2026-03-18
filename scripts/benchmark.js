#!/usr/bin/env node
/**
 * Pandabridge token efficiency benchmark — all 23 tools
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

const child = spawn('node', [indexPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, PANDABRIDGE_DEBUG: 'false' },
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

async function callTool(name, args = {}) {
  const t0 = Date.now();
  const res = await sendRequest('tools/call', { name, arguments: args });
  const ms = Date.now() - t0;
  const text = res.result?.content?.[0]?.text ?? '';
  const isError = !!res.result?.isError;
  return { text, ms, isError, chars: text.length, tokens: estimateTokens(text) };
}

async function run() {
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const nodeVersion = process.version;
  const timestamp = new Date().toISOString().slice(0, 10);

  console.log(`\nPandabridge Benchmark — All 23 Tools`);
  console.log(`  Version:  ${pkg.version}`);
  console.log(`  Node:     ${nodeVersion}`);
  console.log(`  Date:     ${timestamp}`);
  console.log(`  URL:      ${url}`);
  console.log(`  Timeout:  ${timeout}ms\n`);

  await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'benchmark', version: pkg.version },
  });

  const results = [];

  function record(tool, r) {
    const status = r.isError ? 'ERR' : 'OK';
    results.push({ tool, chars: r.chars, tokens: r.tokens, ms: r.ms, status });
    const icon = r.isError ? '✗' : '✓';
    console.log(`  ${icon} ${tool} (${r.chars} chars, ~${r.tokens} tokens, ${r.ms}ms)`);
  }

  // ── Scraping (3) ──────────────────────────────────────────────
  console.log('Scraping');
  record('scrape_page', await callTool('scrape_page', { url }));
  record('scrape_batch', await callTool('scrape_batch', { urls: [url] }));
  record('extract_data', await callTool('extract_data', { selector: 'a', attributes: ['href'] }));

  // ── Navigation (1) ────────────────────────────────────────────
  console.log('\nNavigation');
  record('browser_navigate', await callTool('browser_navigate', { url }));

  // ── Observation (6) ───────────────────────────────────────────
  console.log('\nObservation');
  record('browser_snapshot', await callTool('browser_snapshot'));
  record('browser_markdown', await callTool('browser_markdown'));
  record('browser_links', await callTool('browser_links'));
  record('browser_interactive_elements', await callTool('browser_interactive_elements'));
  record('browser_dom_query', await callTool('browser_dom_query', { selector: 'h1' }));
  record('browser_accessibility', await callTool('browser_accessibility'));

  // ── Diagnosis (1) ─────────────────────────────────────────────
  console.log('\nDiagnosis');
  record('browser_debug_report', await callTool('browser_debug_report', { url }));

  // ── Utilities (7) ─────────────────────────────────────────────
  console.log('\nUtilities');
  record('browser_evaluate', await callTool('browser_evaluate', { expression: '1+1' }));
  record('browser_wait_for', await callTool('browser_wait_for', { selector: 'body' }));
  record('browser_console_messages', await callTool('browser_console_messages'));
  record('browser_network_requests', await callTool('browser_network_requests'));
  record('browser_errors', await callTool('browser_errors'));
  record('browser_cookies', await callTool('browser_cookies', { action: 'get' }));
  record('browser_status', await callTool('browser_status'));

  // ── Interaction (5) ───────────────────────────────────────────
  console.log('\nInteraction');
  record('browser_scroll', await callTool('browser_scroll', { direction: 'down' }));
  record('browser_press_key', await callTool('browser_press_key', { key: 'Tab' }));
  record('browser_click', await callTool('browser_click', { selector: 'a' }));

  // Navigate back for type/select (need a page with known state)
  await callTool('browser_navigate', { url });
  record('browser_type', await callTool('browser_type', { selector: 'input', value: 'test' }));
  record('browser_select_option', await callTool('browser_select_option', { selector: 'select', value: 'x' }));

  child.kill();

  // ── Summary table ─────────────────────────────────────────────
  console.log(`\n${'─'.repeat(75)}`);
  console.log(`\nBenchmark results for: ${url}\n`);
  console.log(
    'Tool'.padEnd(35) +
    'Status'.padStart(7) +
    'Chars'.padStart(8) +
    'Tokens (~)'.padStart(12) +
    'Time (ms)'.padStart(12)
  );
  console.log('─'.repeat(74));

  let totalTokens = 0;
  let totalChars = 0;
  let totalMs = 0;
  let ok = 0;
  let errs = 0;

  for (const r of results) {
    console.log(
      r.tool.padEnd(35) +
      r.status.padStart(7) +
      String(r.chars).padStart(8) +
      String(r.tokens).padStart(12) +
      String(r.ms).padStart(12)
    );
    totalTokens += r.tokens;
    totalChars += r.chars;
    totalMs += r.ms;
    if (r.status === 'OK') ok++; else errs++;
  }

  console.log('─'.repeat(74));
  console.log(
    'TOTAL'.padEnd(35) +
    `${ok}/${results.length}`.padStart(7) +
    String(totalChars).padStart(8) +
    String(totalTokens).padStart(12) +
    String(totalMs).padStart(12)
  );

  console.log(`\nSummary: ${results.length} tools, ${ok} OK, ${errs} expected errors`);
  console.log(`Total output: ${totalChars} chars (~${totalTokens} tokens)`);
  console.log(`Total time: ${totalMs}ms`);
  console.log(`Avg per tool: ~${Math.round(totalTokens / results.length)} tokens, ${Math.round(totalMs / results.length)}ms\n`);
}

run().catch((err) => {
  console.error('Benchmark failed:', err.message);
  child.kill();
  process.exit(1);
});
