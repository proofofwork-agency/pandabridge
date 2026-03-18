import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerInteractiveElements, setPage } from '../browser/state.js';
import { resolveElementTarget } from './element-target.js';

describe('resolveElementTarget', () => {
  test('resolves selector directly when provided', () => {
    const result = resolveElementTarget('https://example.com', '#submit');
    assert.deepEqual(result, {
      selector: '#submit',
      label: '#submit',
    });
  });

  test('resolves elementId from current page registry', () => {
    const [entry] = registerInteractiveElements('https://example.com', [
      { selector: '#submit', tag: 'button' },
    ]);

    const result = resolveElementTarget('https://example.com', undefined, entry.id);
    assert.deepEqual(result, {
      selector: '#submit',
      label: `${entry.id} (button)`,
    });
  });

  test('rejects stale elementId from another page', () => {
    const [entry] = registerInteractiveElements('https://example.com', [
      { selector: '#submit', tag: 'button' },
    ]);

    assert.throws(
      () => resolveElementTarget('https://other.example', undefined, entry.id),
      /Unknown elementId/
    );
  });

  test('clears stored elementIds when page is reset', () => {
    const [entry] = registerInteractiveElements('https://example.com', [
      { selector: '#submit', tag: 'button' },
    ]);

    setPage(null);

    assert.throws(
      () => resolveElementTarget('https://example.com', undefined, entry.id),
      /Unknown elementId/
    );
  });
});
