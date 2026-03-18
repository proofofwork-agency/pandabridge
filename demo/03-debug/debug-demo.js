#!/usr/bin/env node
/**
 * Demo 3: Web App Debugging
 *
 * A broken dashboard page is served locally. Pandabridge inspects it to find
 * errors, failed requests, and broken components — without using browser_evaluate.
 *
 * Usage: node debug-demo.js [--no-lightpanda]
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpClient, VERSION } from '../shared/mcp-client.js';
import { startLightpanda, stopLightpanda } from '../shared/lightpanda.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKIP_LP = process.argv.includes('--no-lightpanda');
const PORT = 3777;

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function startServer() {
  const html = readFileSync(join(__dirname, 'index.html'), 'utf-8');
  const server = createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else if (req.url?.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found', message: `No handler for ${req.method} ${req.url}` }));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      console.log(dim(`Debug server running at http://127.0.0.1:${PORT}\n`));
      resolve(server);
    });
  });
}

async function run() {
  console.log(bold('\n=== Pandabridge Demo: Web App Debugging ===\n'));
  console.log('Scenario: This dashboard is broken — let\'s debug it.\n');

  const lp = SKIP_LP ? null : await startLightpanda();
  const server = await startServer();
  const mcp = createMcpClient();

  try {
    await mcp.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'debug-demo', version: VERSION },
    });
    console.log(green('MCP initialized\n'));

    // 1. Navigate to broken dashboard
    console.log(cyan(bold('1. Navigate to the broken dashboard')));
    const navRes = await mcp.callTool('browser_navigate', { url: `http://127.0.0.1:${PORT}` });
    console.log(`   ${mcp.getText(navRes).split('\n')[0]}\n`);

    // 2. Snapshot — see error banners
    console.log(cyan(bold('2. Page snapshot — spot visible errors')));
    const snapRes = await mcp.callTool('browser_snapshot');
    const snapText = mcp.getText(snapRes);
    console.log(dim(`   ${snapText.slice(0, 400).replace(/\n/g, '\n   ')}...\n`));

    // 3. Markdown view
    console.log(cyan(bold('3. Structured markdown view')));
    const mdRes = await mcp.callTool('browser_markdown');
    const mdText = mcp.getText(mdRes);
    console.log(dim(`   ${mdText.slice(0, 300).replace(/\n/g, '\n   ')}...\n`));

    // 4. Network requests — check for failures
    console.log(cyan(bold('4. Network requests — check for failed API calls')));
    const netRes = await mcp.callTool('browser_network_requests');
    console.log(`   ${mcp.getText(netRes).slice(0, 400)}\n`);

    // 5. JS errors
    console.log(cyan(bold('5. Browser errors')));
    const errRes = await mcp.callTool('browser_errors');
    console.log(`   ${mcp.getText(errRes).slice(0, 300)}\n`);

    // 6. Console messages
    console.log(cyan(bold('6. Console messages')));
    const consoleRes = await mcp.callTool('browser_console_messages');
    console.log(`   ${mcp.getText(consoleRes).slice(0, 300)}\n`);

    // 7. Inspect error banners
    console.log(cyan(bold('7. Inspect error banners')));
    const errorBannerRes = await mcp.callTool('browser_dom_query', { selector: '.error-banner' });
    console.log(`   ${mcp.getText(errorBannerRes).slice(0, 300)}\n`);

    // 8. Inspect warning banners
    console.log(cyan(bold('8. Inspect warning banners')));
    const warnBannerRes = await mcp.callTool('browser_dom_query', { selector: '.warn-banner' });
    console.log(`   ${mcp.getText(warnBannerRes).slice(0, 300)}\n`);

    // 9. Inspect user list
    console.log(cyan(bold('9. Inspect user list items')));
    const userListRes = await mcp.callTool('browser_dom_query', { selector: '#user-list li' });
    console.log(`   ${mcp.getText(userListRes).slice(0, 400)}\n`);

    // 10. Interactive elements
    console.log(cyan(bold('10. Verify UI controls')));
    const interRes = await mcp.callTool('browser_interactive_elements');
    console.log(`   ${mcp.getText(interRes).slice(0, 300)}\n`);

    // 11. Full debug report
    console.log(cyan(bold('11. All-in-one debug report')));
    const debugRes = await mcp.callTool('browser_debug_report', { url: `http://127.0.0.1:${PORT}` });
    const debugText = mcp.getText(debugRes);
    console.log(dim(`   Report (${debugText.length} chars):`));
    console.log(dim(`   ${debugText.slice(0, 500).replace(/\n/g, '\n   ')}...\n`));

    // Diagnosis
    console.log(yellow(bold('--- Diagnosis ---\n')));
    console.log('Issues found on this dashboard:');
    console.log('  1. Component error: UserList fails for "Charlie Ruiz" (null department)');
    console.log('  2. Deprecation warning: /api/v1/users needs migration to v2');
    console.log('  3. Error rate above threshold (3.2%)');
    console.log('  4. Metrics API unreachable');
    console.log('  5. API routes returning 404 (no backend handlers)\n');

    console.log(green(bold('=== Debugging demo complete ===\n')));
    console.log('Tools demonstrated: browser_navigate, browser_snapshot, browser_markdown,');
    console.log('  browser_network_requests, browser_errors, browser_console_messages,');
    console.log('  browser_dom_query, browser_interactive_elements, browser_debug_report\n');
  } catch (err) {
    console.error(red(`\nDemo failed: ${err.message}`));
    process.exitCode = 1;
  } finally {
    mcp.kill();
    stopLightpanda(lp);
    server.close();
  }
}

run();
