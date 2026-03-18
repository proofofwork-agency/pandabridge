import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { injectErrorInstrumentation } from './instrumentation.js';

describe('injectErrorInstrumentation', () => {
  test('calls page.evaluate exactly once', async () => {
    let evaluateCalls = 0;
    const fakePage = {
      evaluate: async (_fn: Function) => { evaluateCalls++; },
    } as any;

    await injectErrorInstrumentation(fakePage);
    assert.equal(evaluateCalls, 1);
  });

  test('is safe to call twice (idempotent guard in injected code)', async () => {
    let evaluateCalls = 0;
    const fakePage = {
      evaluate: async (_fn: Function) => { evaluateCalls++; },
    } as any;

    await injectErrorInstrumentation(fakePage);
    await injectErrorInstrumentation(fakePage);
    assert.equal(evaluateCalls, 2, 'evaluate is called each time; idempotency is enforced in-page by __pb_instrumented guard');
  });

  test('uses addEventListener not window.onerror assignment', async () => {
    // Read the source function passed to evaluate and verify it uses addEventListener
    let evaluatedCode = '';
    const fakePage = {
      evaluate: async (fn: Function) => {
        evaluatedCode = fn.toString();
      },
    } as any;

    await injectErrorInstrumentation(fakePage);
    assert.ok(
      evaluatedCode.includes('addEventListener'),
      'instrumentation should use addEventListener to chain handlers'
    );
    assert.ok(
      !evaluatedCode.includes('window.onerror =') && !evaluatedCode.includes('window.onerror='),
      'instrumentation should not overwrite window.onerror'
    );
  });
});
