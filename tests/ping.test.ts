import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleClientMessage } from '../src/server/ping.ts';

test('READY returns ACK', () => {
  assert.deepEqual(handleClientMessage({ type: 'READY', app: 'momentum', version: 1 }), {
    type: 'ACK',
    app: 'momentum',
    version: 1,
    received: 'READY',
  });
});

test('unknown message returns null', () => {
  assert.equal(handleClientMessage({ type: 'NOPE' }), null);
  assert.equal(handleClientMessage(null), null);
  assert.equal(handleClientMessage('READY'), null);
});
