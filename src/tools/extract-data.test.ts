import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerExtractData } from './extract-data.js';
import { getConfig, setConfig } from '../config.js';
import { setBrowser, setPage } from '../browser/state.js';

function createFakeServer() {
  let handler: ((args: Record<string, any>) => Promise<any>) | null = null;

  return {
    server: {
      tool(...args: any[]) {
        handler = args[args.length - 1];
      },
    },
    getHandler() {
      if (!handler) throw new Error('tool handler was not registered');
      return handler;
    },
  };
}

describe('extract_data', () => {
  test('happy path: returns JSON with tag and text', async () => {
    const config = getConfig();
    setConfig({ ...config });

    const fakePage = {
      evaluate: async () => [
        { tag: 'h1', text: 'Hello World' },
        { tag: 'p', text: 'Content here' },
      ],
      url: () => 'https://example.com/',
    };
    setPage(fakePage as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerExtractData(server as any);
      const result = await getHandler()({ selector: 'h1, p' });
      assert.equal(result.isError, undefined);
      assert.ok(result.content[0].text.includes('"tag"'));
      assert.ok(result.content[0].text.includes('"text"'));
      assert.ok(result.content[0].text.includes('Hello World'));
    } finally {
      setPage(null);
      setConfig(config);
    }
  });

  test('with attributes: evaluate receives attrs array', async () => {
    const config = getConfig();
    setConfig({ ...config });

    let receivedArgs: any = null;
    const fakePage = {
      evaluate: async (fn: any, args: any) => {
        receivedArgs = args;
        return [{ tag: 'a', text: 'Link', href: 'https://example.com' }];
      },
      url: () => 'https://example.com/',
    };
    setPage(fakePage as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerExtractData(server as any);
      await getHandler()({ selector: 'a', attributes: ['href', 'data-price'] });
      assert.deepEqual(receivedArgs.attrs, ['href', 'data-price']);
    } finally {
      setPage(null);
      setConfig(config);
    }
  });

  test('limit is clamped to outputMaxElements', async () => {
    const config = getConfig();
    setConfig({ ...config, outputMaxElements: 3 });

    let receivedArgs: any = null;
    const fakePage = {
      evaluate: async (_fn: any, args: any) => {
        receivedArgs = args;
        return [];
      },
      url: () => 'https://example.com/',
    };
    setPage(fakePage as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerExtractData(server as any);
      await getHandler()({ selector: 'li', limit: 10 });
      assert.equal(receivedArgs.max, 3);
    } finally {
      setPage(null);
      setConfig(config);
    }
  });

  test('no elements found: output includes message', async () => {
    const config = getConfig();
    setConfig({ ...config });

    const fakePage = {
      evaluate: async () => [],
      url: () => 'https://example.com/',
    };
    setPage(fakePage as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerExtractData(server as any);
      const result = await getHandler()({ selector: '.nonexistent' });
      assert.equal(result.isError, undefined);
      assert.ok(result.content[0].text.includes('No elements found'));
    } finally {
      setPage(null);
      setConfig(config);
    }
  });

  test('no page: returns isError', async () => {
    const config = getConfig();
    setConfig({ ...config, host: '127.0.0.1', port: 65530, cdpEndpoint: 'http://127.0.0.1:65530' });
    setBrowser(null);
    setPage(null);

    try {
      const { server, getHandler } = createFakeServer();
      registerExtractData(server as any);
      const result = await getHandler()({ selector: 'h1' });
      assert.equal(result.isError, true);
    } finally {
      setConfig(config);
    }
  });
});
