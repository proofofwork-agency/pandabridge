import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { truncateText, capArray, formatToolResponse } from '../util/output.js';

describe('truncateText', () => {
  test('returns text unchanged when below limit', () => {
    assert.equal(truncateText('hello', 100), 'hello');
  });

  test('returns text unchanged when at limit', () => {
    const text = 'a'.repeat(100);
    assert.equal(truncateText(text, 100), text);
  });

  test('truncates text when above limit', () => {
    const text = 'a'.repeat(200);
    const result = truncateText(text, 100);
    assert.ok(result.length < 200);
    assert.ok(result.includes('[truncated'));
  });

  test('truncated text includes chars omitted count', () => {
    const text = 'a'.repeat(200);
    const result = truncateText(text, 100);
    assert.ok(result.includes('omitted'));
  });
});

describe('capArray', () => {
  test('returns all items when under limit', () => {
    const result = capArray([1, 2, 3], 10);
    assert.deepEqual(result.items, [1, 2, 3]);
    assert.equal(result.omitted, 0);
  });

  test('caps items at max and reports omitted count', () => {
    const result = capArray([1, 2, 3, 4, 5], 3);
    assert.deepEqual(result.items, [1, 2, 3]);
    assert.equal(result.omitted, 2);
  });

  test('handles empty array', () => {
    const result = capArray([], 10);
    assert.deepEqual(result.items, []);
    assert.equal(result.omitted, 0);
  });

  test('returns exact size when at limit', () => {
    const result = capArray([1, 2, 3], 3);
    assert.equal(result.items.length, 3);
    assert.equal(result.omitted, 0);
  });
});

describe('formatToolResponse', () => {
  const BEGIN = '--- BEGIN PAGE CONTENT (untrusted) ---';
  const END = '--- END PAGE CONTENT ---';

  test('wraps content with untrusted delimiters when below limit', () => {
    const config = { outputMaxChars: 1000 } as any;
    const result = formatToolResponse('hello', config);
    assert.equal(result, `${BEGIN}\nhello\n${END}`);
  });

  test('truncates text when above outputMaxChars', () => {
    const config = { outputMaxChars: 100 } as any;
    const text = 'a'.repeat(200);
    const result = formatToolResponse(text, config);
    assert.ok(result.includes('[truncated'));
  });

  test('prepends URL line outside delimiters when provided', () => {
    const config = { outputMaxChars: 1000 } as any;
    const result = formatToolResponse('hello', config, 'https://example.com');
    assert.equal(
      result,
      `[URL: https://example.com]\n${BEGIN}\nhello\n${END}`,
    );
  });

  test('does not include URL line when not provided', () => {
    const config = { outputMaxChars: 1000 } as any;
    const result = formatToolResponse('hello', config);
    assert.ok(!result.includes('[URL:'));
    assert.ok(result.startsWith(BEGIN));
  });

  test('URL and delimiters count toward truncation limit', () => {
    const config = { outputMaxChars: 80 } as any;
    const text = 'a'.repeat(200);
    const result = formatToolResponse(text, config, 'https://example.com');
    assert.ok(result.startsWith('[URL: https://example.com]'));
    assert.ok(result.includes('[truncated'));
  });

  test('delimiters are present around page content', () => {
    const config = { outputMaxChars: 1000 } as any;
    const result = formatToolResponse('some page text', config);
    const lines = result.split('\n');
    assert.equal(lines[0], BEGIN);
    assert.equal(lines[lines.length - 1], END);
    assert.ok(result.includes('some page text'));
  });
});
