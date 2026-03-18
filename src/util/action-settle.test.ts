import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForSettle } from './action-settle.js';

describe('waitForSettle', () => {
  test('resolves when waitForLoadState resolves', async () => {
    const fakePage = {
      waitForLoadState: async () => {},
    } as any;

    // Should not throw
    await waitForSettle(fakePage, 500);
  });

  test('resolves when waitForLoadState times out', async () => {
    const fakePage = {
      waitForLoadState: async () => { throw new Error('Timeout 500ms exceeded'); },
    } as any;

    // Should swallow the timeout error
    await waitForSettle(fakePage, 500);
  });

  test('passes correct timeout to waitForLoadState', async () => {
    let receivedTimeout: number | undefined;
    const fakePage = {
      waitForLoadState: async (_state: string, opts: { timeout: number }) => {
        receivedTimeout = opts.timeout;
      },
    } as any;

    await waitForSettle(fakePage, 750);
    assert.equal(receivedTimeout, 750);
  });

  test('defaults to 1500ms timeout', async () => {
    let receivedTimeout: number | undefined;
    const fakePage = {
      waitForLoadState: async (_state: string, opts: { timeout: number }) => {
        receivedTimeout = opts.timeout;
      },
    } as any;

    await waitForSettle(fakePage);
    assert.equal(receivedTimeout, 1500);
  });
});
