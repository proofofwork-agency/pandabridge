import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addErrorLog, getErrorLogs, clearErrorLogs } from './state.js';

describe('addErrorLog deduplication', () => {
  beforeEach(() => {
    clearErrorLogs();
  });

  test('allows different messages at the same timestamp', () => {
    addErrorLog({ message: 'Error A', timestamp: 1000 });
    addErrorLog({ message: 'Error B', timestamp: 1000 });
    assert.equal(getErrorLogs().length, 2);
  });

  test('deduplicates same message within 100ms window', () => {
    addErrorLog({ message: 'TypeError: x is undefined', timestamp: 1000 });
    addErrorLog({ message: 'TypeError: x is undefined', timestamp: 1050 });
    assert.equal(getErrorLogs().length, 1);
  });

  test('allows same message outside 100ms window', () => {
    addErrorLog({ message: 'TypeError: x is undefined', timestamp: 1000 });
    addErrorLog({ message: 'TypeError: x is undefined', timestamp: 1200 });
    assert.equal(getErrorLogs().length, 2);
  });

  test('dedup only checks last 3 entries', () => {
    addErrorLog({ message: 'Error 1', timestamp: 1000 });
    addErrorLog({ message: 'Error 2', timestamp: 1010 });
    addErrorLog({ message: 'Error 3', timestamp: 1020 });
    addErrorLog({ message: 'Error 4', timestamp: 1030 });
    // 'Error 1' is now more than 3 entries ago, so a duplicate should be allowed
    addErrorLog({ message: 'Error 1', timestamp: 1040 });
    assert.equal(getErrorLogs().length, 5);
  });

  test('framework error type is preserved through dedup', () => {
    addErrorLog({ message: 'Warning: component', type: 'framework', framework: 'react', timestamp: 1000 });
    addErrorLog({ message: 'Warning: component', type: 'framework', framework: 'react', timestamp: 1050 });
    const logs = getErrorLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].type, 'framework');
    assert.equal(logs[0].framework, 'react');
  });
});
