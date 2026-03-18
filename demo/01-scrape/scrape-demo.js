#!/usr/bin/env node
/**
 * Demo 1: Web Scraping & Research
 *
 * Shows how pandabridge scrapes pages, extracts structured data, and gathers
 * links — the core research workflow. No local server needed.
 *
 * Usage: node scrape-demo.js [--no-lightpanda]
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
  console.log(bold('\n=== Pandabridge Demo: Web Scraping & Research ===\n'));

  const lp = SKIP_LP ? null : await startLightpanda();
  const mcp = createMcpClient();

  try {
    // Initialize MCP
    await mcp.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'scrape-demo', version: VERSION },
    });
    console.log(green('MCP initialized\n'));

    // 1. Scrape a single page
    console.log(cyan(bold('1. Scrape a single page')));
    console.log(dim('   scrape_page → https://example.com'));
    const scrapeRes = await mcp.callTool('scrape_page', { url: 'https://example.com' });
    const scrapeText = mcp.getText(scrapeRes);
    console.log(`   Title & content extracted (${scrapeText.length} chars)`);
    console.log(dim(`   Preview: ${scrapeText.slice(0, 150).replace(/\n/g, ' ')}...\n`));

    // 2. Scrape multiple pages at once
    console.log(cyan(bold('2. Scrape multiple pages in batch')));
    console.log(dim('   scrape_batch → example.com + httpbin.org/html'));
    const batchRes = await mcp.callTool('scrape_batch', {
      urls: ['https://example.com', 'https://httpbin.org/html'],
    });
    const batchText = mcp.getText(batchRes);
    console.log(`   Batch results (${batchText.length} chars)`);
    console.log(dim(`   Preview: ${batchText.slice(0, 150).replace(/\n/g, ' ')}...\n`));

    // 3. Navigate for page-level tools
    console.log(cyan(bold('3. Navigate for structured extraction')));
    console.log(dim('   browser_navigate → https://example.com'));
    const navRes = await mcp.callTool('browser_navigate', { url: 'https://example.com' });
    console.log(`   ${mcp.getText(navRes).split('\n')[0]}\n`);

    // 4. Extract structured data from elements
    console.log(cyan(bold('4. Extract structured data')));
    console.log(dim('   extract_data → selector: a, attributes: [href, textContent]'));
    const extractRes = await mcp.callTool('extract_data', {
      selector: 'a',
      attributes: ['href', 'textContent'],
    });
    const extractText = mcp.getText(extractRes);
    console.log(`   ${extractText.slice(0, 300)}\n`);

    // 5. Get clean markdown
    console.log(cyan(bold('5. Convert page to markdown')));
    console.log(dim('   browser_markdown'));
    const mdRes = await mcp.callTool('browser_markdown');
    const mdText = mcp.getText(mdRes);
    console.log(`   Markdown output (${mdText.length} chars):`);
    console.log(dim(`   ${mdText.slice(0, 200).replace(/\n/g, '\n   ')}...\n`));

    // 6. Extract all links
    console.log(cyan(bold('6. Extract all links')));
    console.log(dim('   browser_links'));
    const linksRes = await mcp.callTool('browser_links');
    const linksText = mcp.getText(linksRes);
    console.log(`   ${linksText.slice(0, 300)}\n`);

    // 7. Check status
    console.log(cyan(bold('7. Browser status')));
    const statusRes = await mcp.callTool('browser_status');
    console.log(`   ${mcp.getText(statusRes).split('\n')[0]}\n`);

    console.log(green(bold('=== Scraping demo complete ===\n')));
    console.log('Tools demonstrated: scrape_page, scrape_batch, browser_navigate,');
    console.log('  extract_data, browser_markdown, browser_links, browser_status\n');
  } catch (err) {
    console.error(red(`\nDemo failed: ${err.message}`));
    process.exitCode = 1;
  } finally {
    mcp.kill();
    stopLightpanda(lp);
  }
}

run();
