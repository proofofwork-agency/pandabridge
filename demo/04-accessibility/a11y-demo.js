#!/usr/bin/env node
/**
 * Demo 4: Accessibility Auditing
 *
 * Serves an HTML page with intentional accessibility issues, then uses
 * pandabridge tools to discover them — demonstrating a11y auditing workflow.
 *
 * Usage: node a11y-demo.js [--no-lightpanda]
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpClient, VERSION } from '../shared/mcp-client.js';
import { startLightpanda, stopLightpanda } from '../shared/lightpanda.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKIP_LP = process.argv.includes('--no-lightpanda');
const PORT = 3779;

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function startServer() {
  const html = readFileSync(join(__dirname, 'index.html'), 'utf-8');
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      console.log(dim(`A11y demo server running at http://127.0.0.1:${PORT}\n`));
      resolve(server);
    });
  });
}

async function run() {
  console.log(bold('\n=== Pandabridge Demo: Accessibility Auditing ===\n'));
  console.log('Scenario: Check if this page is accessible.\n');

  const lp = SKIP_LP ? null : await startLightpanda();
  const server = await startServer();
  const mcp = createMcpClient();

  try {
    await mcp.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'a11y-demo', version: VERSION },
    });
    console.log(green('MCP initialized\n'));

    // 1. Navigate
    console.log(cyan(bold('1. Navigate to page under audit')));
    const navRes = await mcp.callTool('browser_navigate', { url: `http://127.0.0.1:${PORT}` });
    console.log(`   ${mcp.getText(navRes).split('\n')[0]}\n`);

    // 2. Accessibility tree
    console.log(cyan(bold('2. Get accessibility tree')));
    const a11yRes = await mcp.callTool('browser_accessibility');
    const a11yText = mcp.getText(a11yRes);
    console.log(`   ARIA tree (${a11yText.length} chars):`);
    console.log(dim(`   ${a11yText.slice(0, 500).replace(/\n/g, '\n   ')}...\n`));

    // 3. Find images missing alt text
    console.log(cyan(bold('3. Find images missing alt text')));
    const imgRes = await mcp.callTool('browser_dom_query', { selector: 'img:not([alt])' });
    const imgText = mcp.getText(imgRes);
    console.log(`   ${imgText.slice(0, 300)}\n`);

    // 4. Find unlabeled inputs
    console.log(cyan(bold('4. Find unlabeled form inputs')));
    const inputRes = await mcp.callTool('browser_dom_query', { selector: 'input:not([aria-label]):not([id])' });
    const inputText = mcp.getText(inputRes);
    console.log(`   ${inputText.slice(0, 300)}\n`);

    // 5. Snapshot — compare rendered text
    console.log(cyan(bold('5. Page snapshot — compare with a11y tree')));
    const snapRes = await mcp.callTool('browser_snapshot');
    const snapText = mcp.getText(snapRes);
    console.log(dim(`   ${snapText.slice(0, 400).replace(/\n/g, '\n   ')}...\n`));

    // 6. Interactive elements — check labels
    console.log(cyan(bold('6. Check interactive element labels')));
    const interRes = await mcp.callTool('browser_interactive_elements');
    const interText = mcp.getText(interRes);
    console.log(`   ${interText.slice(0, 400)}\n`);

    // Audit summary
    console.log(yellow(bold('--- Accessibility Audit Summary ---\n')));
    console.log('Issues found on this page:');
    console.log('  1. Image without alt attribute (decorative or informative?)');
    console.log('  2. Form input without label or aria-label');
    console.log('  3. Heading hierarchy skip (h1 → h4, missing h2/h3)');
    console.log('  4. Button with no visible text or aria-label');
    console.log('  5. Form without fieldset/legend grouping');
    console.log('  6. Missing landmark roles (no <main>, <nav>, etc.)\n');

    console.log(green(bold('=== Accessibility demo complete ===\n')));
    console.log('Tools demonstrated: browser_navigate, browser_accessibility,');
    console.log('  browser_dom_query, browser_snapshot, browser_interactive_elements\n');
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
