import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfig } from './config.js';
import { maybeStartLightpanda, killLightpanda } from './browser/lifecycle.js';
import { connectAndSetup } from './browser/connection.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { getBrowser, initState } from './browser/state.js';
import { log, logCritical } from './log.js';
import { toErrorMessage } from './util/errors.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

async function main(): Promise<void> {
  const config = getConfig();

  // 1. Initialize state with config
  initState(config);

  // 2. Optionally start Lightpanda binary (skip in cloud mode)
  if (!config.cdpWsUrl) {
    await maybeStartLightpanda(config);
  }

  // 3. Connect to Lightpanda via CDP
  await connectAndSetup(config);

  // 4. Create MCP server
  const server = new McpServer({
    name: 'pandabridge',
    version,
  });

  // 5. Register all tools and resources
  registerAllTools(server);
  registerAllResources(server);

  // 6. Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log(`MCP server running on stdio (v${version})`);

  // 7. Graceful shutdown
  let shuttingDown = false;
  const cleanup = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Shutting down...');
    try {
      await server.close();
    } catch {
      // transport may already be closed
    }
    try {
      const browser = getBrowser();
      if (browser) await Promise.race([
        browser.close(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('close timeout')), 3000))
      ]);
    } catch (err) {
      logCritical(`Browser close error: ${toErrorMessage(err)}`);
    }
    killLightpanda();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  process.stderr.write(`[pandabridge] Fatal: ${toErrorMessage(err)}\n`);
  process.exit(1);
});
