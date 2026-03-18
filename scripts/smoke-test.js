#!/usr/bin/env node
/**
 * Pandabridge integration smoke test
 * Requires: Lightpanda running on :9222, npm run build first
 * Usage: node scripts/smoke-test.js
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, '..', 'dist', 'index.js');

const REQUEST_TIMEOUT = 30000;
const OVERALL_TIMEOUT = 120000;

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
    }, REQUEST_TIMEOUT);
  });
}

const results = [];

function assert(name, condition, detail = '') {
  if (condition) {
    results.push({ name, pass: true });
    console.log(`  ✓ ${name}`);
  } else {
    results.push({ name, pass: false, detail });
    console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
  }
}

async function run() {
  console.log('\nPandabridge Smoke Test\n');

  // 1. Initialize
  const initRes = await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-test', version: '1.0' },
  });
  assert('initialize returns capabilities', !!initRes.result?.capabilities);

  // 2. List tools
  const toolsRes = await sendRequest('tools/list', {});
  const toolCount = toolsRes.result?.tools?.length ?? 0;
  assert('tools/list returns 23 tools', toolCount === 23, `got ${toolCount}`);

  // 3. Browser status
  const statusRes = await sendRequest('tools/call', {
    name: 'browser_status',
    arguments: {},
  });
  const statusText = statusRes.result?.content?.[0]?.text ?? '';
  assert('browser_status responds', statusText.length > 0);

  // 4. Navigate to example.com
  const navRes = await sendRequest('tools/call', {
    name: 'browser_navigate',
    arguments: { url: 'https://example.com' },
  });
  assert('browser_navigate succeeds', !navRes.result?.isError, navRes.result?.content?.[0]?.text);

  // 5. Snapshot
  const snapRes = await sendRequest('tools/call', {
    name: 'browser_snapshot',
    arguments: {},
  });
  const snapText = snapRes.result?.content?.[0]?.text ?? '';
  assert('browser_snapshot contains "Example Domain"', snapText.includes('Example Domain'), `got ${snapText.slice(0, 100)}`);

  // 6. Links
  const linksRes = await sendRequest('tools/call', {
    name: 'browser_links',
    arguments: {},
  });
  const linksText = linksRes.result?.content?.[0]?.text ?? '';
  assert('browser_links returns at least 1 link', linksText.includes('http'), `got ${linksText.slice(0, 100)}`);

  // 7. Markdown
  const markdownRes = await sendRequest('tools/call', {
    name: 'browser_markdown',
    arguments: {},
  });
  const markdownText = markdownRes.result?.content?.[0]?.text ?? '';
  assert('browser_markdown includes "Example Domain"', markdownText.includes('Example Domain'), `got ${markdownText.slice(0, 100)}`);

  // 8. Interactive elements
  const interactiveRes = await sendRequest('tools/call', {
    name: 'browser_interactive_elements',
    arguments: {},
  });
  const interactiveText = interactiveRes.result?.content?.[0]?.text ?? '';
  assert('browser_interactive_elements responds', interactiveText.length > 0);

  // 9. DOM query
  const domRes = await sendRequest('tools/call', {
    name: 'browser_dom_query',
    arguments: { selector: 'h1' },
  });
  const domText = domRes.result?.content?.[0]?.text ?? '';
  assert('browser_dom_query h1 includes "Example Domain"', domText.includes('Example Domain'), `got ${domText.slice(0, 100)}`);

  // 10. Console messages
  const consoleRes = await sendRequest('tools/call', {
    name: 'browser_console_messages',
    arguments: {},
  });
  const consoleText = consoleRes.result?.content?.[0]?.text ?? '';
  assert('browser_console_messages responds', consoleText.length > 0);

  // 11. Network requests
  const networkRes = await sendRequest('tools/call', {
    name: 'browser_network_requests',
    arguments: {},
  });
  const networkText = networkRes.result?.content?.[0]?.text ?? '';
  assert('browser_network_requests responds', networkText.length > 0);

  // 12. Errors
  const errorsRes = await sendRequest('tools/call', {
    name: 'browser_errors',
    arguments: {},
  });
  const errorsText = errorsRes.result?.content?.[0]?.text ?? '';
  assert('browser_errors responds', errorsText.length > 0);

  // 13. Accessibility
  const a11yRes = await sendRequest('tools/call', {
    name: 'browser_accessibility',
    arguments: {},
  });
  const a11yText = a11yRes.result?.content?.[0]?.text ?? '';
  assert('browser_accessibility responds', a11yText.length > 0);

  // 14. Scroll
  const scrollRes = await sendRequest('tools/call', {
    name: 'browser_scroll',
    arguments: { direction: 'down' },
  });
  const scrollText = scrollRes.result?.content?.[0]?.text ?? '';
  assert('browser_scroll responds with "Scrolled"', scrollText.includes('Scrolled'), `got ${scrollText.slice(0, 100)}`);

  // 15. Wait for
  const waitRes = await sendRequest('tools/call', {
    name: 'browser_wait_for',
    arguments: { selector: 'h1' },
  });
  assert('browser_wait_for h1 succeeds', !waitRes.result?.isError, waitRes.result?.content?.[0]?.text);

  // 16. Press key
  const keyRes = await sendRequest('tools/call', {
    name: 'browser_press_key',
    arguments: { key: 'Tab' },
  });
  const keyText = keyRes.result?.content?.[0]?.text ?? '';
  assert('browser_press_key responds with "Pressed"', keyText.includes('Pressed'), `got ${keyText.slice(0, 100)}`);

  // 17. Scrape page
  const scrapeRes = await sendRequest('tools/call', {
    name: 'scrape_page',
    arguments: { url: 'https://example.com' },
  });
  const scrapeText = scrapeRes.result?.content?.[0]?.text ?? '';
  assert('scrape_page includes "Example Domain"', scrapeText.includes('Example Domain'), `got ${scrapeText.slice(0, 100)}`);

  // 18. Scrape batch
  const batchRes = await sendRequest('tools/call', {
    name: 'scrape_batch',
    arguments: { urls: ['https://example.com'] },
  });
  const batchText = batchRes.result?.content?.[0]?.text ?? '';
  assert('scrape_batch includes "Example Domain"', batchText.includes('Example Domain'), `got ${batchText.slice(0, 100)}`);

  // 19. Extract data
  const extractRes = await sendRequest('tools/call', {
    name: 'extract_data',
    arguments: { selector: 'h1' },
  });
  const extractText = extractRes.result?.content?.[0]?.text ?? '';
  assert('extract_data returns JSON with "tag"', extractText.includes('"tag"'), `got ${extractText.slice(0, 100)}`);

  // 20. Click (navigates away — run after read-only tools)
  const clickRes = await sendRequest('tools/call', {
    name: 'browser_click',
    arguments: { selector: 'a' },
  });
  assert('browser_click anchor succeeds', !clickRes.result?.isError, clickRes.result?.content?.[0]?.text);

  // 18. Cookies
  const cookiesRes = await sendRequest('tools/call', {
    name: 'browser_cookies',
    arguments: { action: 'get' },
  });
  const cookiesText = cookiesRes.result?.content?.[0]?.text ?? '';
  assert('browser_cookies get responds', cookiesText.length > 0);

  // 19. Evaluate (disabled by default config)
  const evalRes = await sendRequest('tools/call', {
    name: 'browser_evaluate',
    arguments: { expression: '1+1' },
  });
  const evalText = evalRes.result?.content?.[0]?.text ?? '';
  assert('browser_evaluate disabled by default', evalText.includes('disabled'), `got ${evalText.slice(0, 100)}`);

  // 20. Type — no input elements on example.com, expect error
  const typeRes = await sendRequest('tools/call', {
    name: 'browser_type',
    arguments: { selector: 'input', value: 'test' },
  });
  assert('browser_type on missing input returns error', typeRes.result?.isError === true, typeRes.result?.content?.[0]?.text);

  // 21. Select option — no select elements on example.com, expect error
  const selectRes = await sendRequest('tools/call', {
    name: 'browser_select_option',
    arguments: { selector: 'select', value: 'test' },
  });
  assert('browser_select_option on missing select returns error', selectRes.result?.isError === true, selectRes.result?.content?.[0]?.text);

  // 22. Debug report
  const debugRes = await sendRequest('tools/call', {
    name: 'browser_debug_report',
    arguments: { url: 'https://example.com' },
  });
  const debugText = debugRes.result?.content?.[0]?.text ?? '';
  assert('browser_debug_report includes "Debug Report"', debugText.includes('Debug Report'), `got ${debugText.slice(0, 100)}`);

  // Done
  child.kill();

  console.log('');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`${passed} passed, ${failed} failed out of ${results.length} assertions`);

  process.exit(failed > 0 ? 1 : 0);
}

const overallTimer = setTimeout(() => {
  console.error('Smoke test timed out after 120s');
  child.kill();
  process.exit(1);
}, OVERALL_TIMEOUT);

run().catch((err) => {
  console.error('Smoke test failed:', err.message);
  child.kill();
  process.exit(1);
}).finally(() => {
  clearTimeout(overallTimer);
});
