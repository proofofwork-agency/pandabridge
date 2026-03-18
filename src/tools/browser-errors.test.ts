import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerBrowserErrors } from './browser-errors.js';
import { addErrorLog, clearErrorLogs } from '../browser/state.js';

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

describe('browser_errors', () => {
  test('returns "No errors captured." when empty', async () => {
    clearErrorLogs();
    const { server, getHandler } = createFakeServer();
    registerBrowserErrors(server as any);

    const result = await getHandler()({});
    assert.equal(result.content[0].text, 'No errors captured.');
  });

  test('returns formatted error entries with stack traces', async () => {
    clearErrorLogs();
    addErrorLog({ message: 'ReferenceError: foo is not defined', stack: 'at bar (app.js:10:5)', timestamp: 1000 });
    addErrorLog({ message: 'Page crashed', timestamp: 2000 });

    const { server, getHandler } = createFakeServer();
    registerBrowserErrors(server as any);

    const result = await getHandler()({});
    const text = result.content[0].text;
    assert.ok(text.includes('[error] ReferenceError: foo is not defined'));
    assert.ok(text.includes('at bar (app.js:10:5)'));
    assert.ok(text.includes('[error] Page crashed'));
    clearErrorLogs();
  });

  test('respects clear parameter', async () => {
    clearErrorLogs();
    addErrorLog({ message: 'Test error', timestamp: 1000 });

    const { server, getHandler } = createFakeServer();
    registerBrowserErrors(server as any);

    const result1 = await getHandler()({ clear: true });
    assert.ok(result1.content[0].text.includes('Test error'));

    const result2 = await getHandler()({});
    assert.equal(result2.content[0].text, 'No errors captured.');
  });
});
