import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatElementLine } from './browser-interactive-elements.js';

describe('interactive elements display formatter', () => {
  test('includes elementId when present', () => {
    const line = formatElementLine(0, { tag: 'button', elementId: 'e1-1', selector: '#submit', text: 'Submit Form' });
    assert.equal(line, '[1] e1-1 button#submit "Submit Form"');
  });

  test('ID selector displays full #id not mangled', () => {
    const line = formatElementLine(0, { tag: 'button', selector: '#submit', text: 'Submit Form', type: 'submit' });
    assert.equal(line, '[1] button#submit "Submit Form" (type=submit)');
    // Key check: should NOT be '[1] buttont "Submit Form"' (the old bug)
    assert.ok(!line.startsWith('[1] buttont'));
  });

  test('name selector displays attribute part only', () => {
    const line = formatElementLine(1, { tag: 'input', selector: 'input[name="email"]', type: 'email', placeholder: 'Enter email' });
    assert.equal(line, '[2] input[name="email"] (type=email, placeholder="Enter email")');
  });

  test('path-based selector is the full CSS path without tag prefix', () => {
    const line = formatElementLine(0, { tag: 'button', selector: 'body > div:nth-child(1) > button:nth-child(2)' });
    assert.equal(line, '[1] body > div:nth-child(1) > button:nth-child(2)');
  });

  test('element index is 1-based', () => {
    const line0 = formatElementLine(0, { tag: 'a', selector: '#link1' });
    const line4 = formatElementLine(4, { tag: 'a', selector: '#link5' });
    assert.ok(line0.startsWith('[1]'));
    assert.ok(line4.startsWith('[5]'));
  });

  test('name selector with special characters is escaped', () => {
    // The selector passed in should already have the escaped name from the evaluate() logic
    const escapedName = 'field"name'.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
    const selector = `input[name="${escapedName}"]`;
    const line = formatElementLine(0, { tag: 'input', selector });
    assert.ok(line.includes('[name="field\\"name"]'));
  });
});
