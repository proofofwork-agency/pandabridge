import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfig, setConfig } from './config.js';
import { maybeStartLightpanda, killLightpanda } from './browser/lifecycle.js';
import { connectAndSetup } from './browser/connection.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { getBrowser, initState } from './browser/state.js';
import { log, logCritical } from './log.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

async function main(): Promise<void> {
  const config = getConfig();
  setConfig(config);

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
  const cleanup = async () => {
    log('Shutting down...');
    try {
      const browser = getBrowser();
      if (browser) await Promise.race([
        browser.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), 3000))
      ]);
    } catch (err) {
      logCritical(`Browser close error: ${(err as Error).message}`);
    }
    killLightpanda();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  process.stderr.write(`[pandabridge] Fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
