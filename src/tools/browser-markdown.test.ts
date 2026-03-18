import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerBrowserMarkdown } from './browser-markdown.js';
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

describe('browser_markdown', () => {
  test('converts body HTML to markdown without opening a CDP session', async () => {
    let innerHtmlCalls = 0;
    const fakePage = {
      innerHTML: async (selector: string) => {
        innerHtmlCalls += 1;
        assert.equal(selector, 'body');
        return '<h1>Example Domain</h1><p><a href=\"https://example.com\">More information...</a></p>';
      },
      url: () => 'https://example.com/',
      context: () => ({
        newCDPSession: () => {
          throw new Error('newCDPSession should not be called');
        },
      }),
    } as any;

    setPage(fakePage);
    setBrowser({} as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserMarkdown(server as any);

      const result = await getHandler()({});
      const text = result.content[0].text;
      assert.equal(innerHtmlCalls, 1);
      assert.ok(text.includes('# Example Domain'));
      assert.ok(text.includes('[More information...](https://example.com)'));
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });

  test('respects selector override', async () => {
    const fakePage = {
      innerHTML: async (selector: string) => {
        assert.equal(selector, 'main');
        return '<h2>Selected content</h2><p>Only this section.</p>';
      },
      url: () => 'https://example.com/section',
    } as any;

    setPage(fakePage);
    setBrowser({} as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserMarkdown(server as any);

      const result = await getHandler()({ selector: 'main' });
      const text = result.content[0].text;
      assert.ok(text.includes('## Selected content'));
      assert.ok(text.includes('Only this section.'));
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });
});
