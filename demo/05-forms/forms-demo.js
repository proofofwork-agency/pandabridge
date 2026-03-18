#!/usr/bin/env node
/**
 * Demo 5: Form Interaction
 *
 * Serves a multi-field contact form. Shows how pandabridge discovers form fields,
 * fills them in, selects options, and submits — all via MCP tools.
 *
 * Usage: node forms-demo.js [--no-lightpanda]
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpClient, VERSION } from '../shared/mcp-client.js';
import { startLightpanda, stopLightpanda } from '../shared/lightpanda.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKIP_LP = process.argv.includes('--no-lightpanda');
const PORT = 3780;

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

function startServer() {
  const html = readFileSync(join(__dirname, 'index.html'), 'utf-8');
  const successHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Submitted</title></head>
<body>
  <div class="success-message">
    <h1>Thank you!</h1>
    <p>Your message has been received. We will get back to you shortly.</p>
  </div>
</body>
</html>`;

  const server = createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else if (req.method === 'POST' && req.url === '/submit') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'session=demo123; Path=/' });
      res.end(successHtml);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      console.log(dim(`Forms demo server running at http://127.0.0.1:${PORT}\n`));
      resolve(server);
    });
  });
}

async function run() {
  console.log(bold('\n=== Pandabridge Demo: Form Interaction ===\n'));

  const lp = SKIP_LP ? null : await startLightpanda();
  const server = await startServer();
  const mcp = createMcpClient();

  try {
    await mcp.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'forms-demo', version: VERSION },
    });
    console.log(green('MCP initialized\n'));

    // 1. Navigate to form page
    console.log(cyan(bold('1. Navigate to the form page')));
    const navRes = await mcp.callTool('browser_navigate', { url: `http://127.0.0.1:${PORT}` });
    console.log(`   ${mcp.getText(navRes).split('\n')[0]}\n`);

    // 2. Discover form fields
    console.log(cyan(bold('2. Discover interactive form elements')));
    const interRes = await mcp.callTool('browser_interactive_elements');
    console.log(`   ${mcp.getText(interRes).slice(0, 500)}\n`);

    // 3. Fill name field
    console.log(cyan(bold('3. Type into name field')));
    const nameRes = await mcp.callTool('browser_type', { selector: '#name', value: 'Jane Doe' });
    console.log(`   ${mcp.getText(nameRes).slice(0, 200)}\n`);

    // 4. Fill email field
    console.log(cyan(bold('4. Type into email field')));
    const emailRes = await mcp.callTool('browser_type', { selector: '#email', value: 'jane@example.com' });
    console.log(`   ${mcp.getText(emailRes).slice(0, 200)}\n`);

    // 5. Select category
    console.log(cyan(bold('5. Select category from dropdown')));
    const selectRes = await mcp.callTool('browser_select_option', { selector: '#category', value: 'support' });
    console.log(`   ${mcp.getText(selectRes).slice(0, 200)}\n`);

    // 6. Tab to next field
    console.log(cyan(bold('6. Press Tab to move focus')));
    const tabRes = await mcp.callTool('browser_press_key', { key: 'Tab' });
    console.log(`   ${mcp.getText(tabRes).slice(0, 200)}\n`);

    // 7. Scroll down
    console.log(cyan(bold('7. Scroll down to see submit button')));
    const scrollRes = await mcp.callTool('browser_scroll', { direction: 'down' });
    console.log(`   ${mcp.getText(scrollRes).slice(0, 200)}\n`);

    // 8. Click submit
    console.log(cyan(bold('8. Click submit button')));
    const clickRes = await mcp.callTool('browser_click', { selector: '#submit-btn' });
    console.log(`   ${mcp.getText(clickRes).slice(0, 200)}\n`);

    // 9. Wait for success message
    console.log(cyan(bold('9. Wait for success message')));
    const waitRes = await mcp.callTool('browser_wait_for', { selector: '.success-message' });
    console.log(`   ${mcp.getText(waitRes).slice(0, 200)}\n`);

    // 10. Verify result
    console.log(cyan(bold('10. Verify submission result')));
    const snapRes = await mcp.callTool('browser_snapshot');
    const snapText = mcp.getText(snapRes);
    console.log(dim(`   ${snapText.slice(0, 300).replace(/\n/g, '\n   ')}\n`));

    // 11. Check cookies
    console.log(cyan(bold('11. Check session cookies')));
    const cookieRes = await mcp.callTool('browser_cookies', { action: 'get' });
    console.log(`   ${mcp.getText(cookieRes).slice(0, 300)}\n`);

    console.log(green(bold('=== Forms demo complete ===\n')));
    console.log('Tools demonstrated: browser_navigate, browser_interactive_elements,');
    console.log('  browser_type, browser_select_option, browser_press_key, browser_scroll,');
    console.log('  browser_click, browser_wait_for, browser_snapshot, browser_cookies\n');
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
