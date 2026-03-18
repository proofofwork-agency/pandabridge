#!/usr/bin/env node
/**
 * Demo 2: Page Inspection
 *
 * Shows how to understand the structure of an unfamiliar web page without
 * executing any JavaScript — using snapshots, DOM queries, and accessibility tools.
 *
 * Usage: node inspect-demo.js [--no-lightpanda]
 */
import { createMcpClient, VERSION } from '../shared/mcp-client.js';
import { startLightpanda, stopLightpanda } from '../shared/lightpanda.js';

const SKIP_LP = process.argv.includes('--no-lightpanda');
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

async function run() {
  console.log(bold('\n=== Pandabridge Demo: Page Inspection ===\n'));

  const lp = SKIP_LP ? null : await startLightpanda();
  const mcp = createMcpClient();

  try {
    await mcp.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'inspect-demo', version: VERSION },
    });
    console.log(green('MCP initialized\n'));

    // 1. Verify connection
    console.log(cyan(bold('1. Verify browser connection')));
    const statusRes = await mcp.callTool('browser_status');
    console.log(`   ${mcp.getText(statusRes).split('\n')[0]}\n`);

    // 2. Navigate
    console.log(cyan(bold('2. Navigate to example.com')));
    const navRes = await mcp.callTool('browser_navigate', { url: 'https://example.com' });
    console.log(`   ${mcp.getText(navRes).split('\n')[0]}\n`);

    // 3. Snapshot — text content via accessibility tree
    console.log(cyan(bold('3. Page snapshot (accessibility tree)')));
    const snapRes = await mcp.callTool('browser_snapshot');
    const snapText = mcp.getText(snapRes);
    console.log(`   Snapshot (${snapText.length} chars):`);
    console.log(dim(`   ${snapText.slice(0, 300).replace(/\n/g, '\n   ')}...\n`));

    // 4. DOM query — find headings
    console.log(cyan(bold('4. Query DOM for h1 elements')));
    const h1Res = await mcp.callTool('browser_dom_query', { selector: 'h1' });
    console.log(`   ${mcp.getText(h1Res).slice(0, 300)}\n`);

    // 5. DOM query — find all links
    console.log(cyan(bold('5. Query DOM for all links')));
    const linkRes = await mcp.callTool('browser_dom_query', { selector: 'a[href]' });
    console.log(`   ${mcp.getText(linkRes).slice(0, 300)}\n`);

    // 6. Interactive elements
    console.log(cyan(bold('6. Discover interactive elements')));
    const interRes = await mcp.callTool('browser_interactive_elements');
    const interText = mcp.getText(interRes);
    console.log(`   ${interText.slice(0, 300)}\n`);

    // 7. Accessibility tree
    console.log(cyan(bold('7. Accessibility outline')));
    const a11yRes = await mcp.callTool('browser_accessibility');
    const a11yText = mcp.getText(a11yRes);
    console.log(`   ARIA tree (${a11yText.length} chars):`);
    console.log(dim(`   ${a11yText.slice(0, 400).replace(/\n/g, '\n   ')}...\n`));

    console.log(green(bold('=== Inspection demo complete ===\n')));
    console.log("Here's what we learned about the page without any JS execution:");
    console.log('  - Page structure via snapshot and accessibility tree');
    console.log('  - Specific elements via DOM queries');
    console.log('  - Interactive elements for potential automation\n');
    console.log('Tools demonstrated: browser_status, browser_navigate, browser_snapshot,');
    console.log('  browser_dom_query, browser_interactive_elements, browser_accessibility\n');
  } catch (err) {
    console.error(red(`\nDemo failed: ${err.message}`));
    process.exitCode = 1;
  } finally {
    mcp.kill();
    stopLightpanda(lp);
  }
}

run();
