import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeRateLimit, isAllowedOrigin, MAX_MESSAGE_BYTES, parseMessage } from './protocol.js';

const input = { left: false, right: true, jumpPressed: false, jumpReleased: false, interactPressed: false };
const parse = (message, slot = 0) => parseMessage(JSON.stringify(message), slot);

test('validates exact input schema and role ownership', () => {
  assert.ok(parse({ type: 'input', sequence: 0, input }, 1).message);
  assert.equal(parse({ type: 'input', sequence: 0, input }, 0).error, 'guest_only');
  assert.equal(parse({ type: 'input', sequence: -1, input }, 1).error, 'invalid_schema');
  assert.equal(parse({ type: 'input', sequence: 0, input: { ...input, left: 1 } }, 1).error, 'invalid_schema');
  assert.equal(parse({ type: 'input', sequence: 0, input: { ...input, admin: true } }, 1).error, 'invalid_schema');
});

test('restricts privileged messages and rejects forged server messages', () => {
  for (const type of ['start', 'restart']) assert.equal(parse({ type }, 1).error, 'host_only');
  assert.equal(parse({ type: 'state', snapshot: {}, ack: -1 }, 1).error, 'host_only');
  for (const type of ['welcome', 'lobby', 'started', 'restarted', 'peer-left', 'ended']) {
    assert.equal(parse({ type }, 0).error, 'unknown_type');
  }
  assert.equal(parse({ type: 'ready', ready: 'true' }).error, 'invalid_schema');
  assert.equal(parse({ type: 'pause', paused: false, slot: 0 }).error, 'invalid_schema');
});

test('validates JSON text, snapshot object and byte limits', () => {
  assert.equal(parseMessage(new ArrayBuffer(5), 0).error, 'text_only');
  assert.equal(parseMessage('{', 0).error, 'invalid_json');
  assert.equal(parse(null).error, 'invalid_message');
  assert.equal(parse({ type: 'state', snapshot: [], ack: 0 }).error, 'invalid_schema');
  assert.equal(parse({ type: 'state', snapshot: {}, ack: -2 }).error, 'invalid_schema');
  assert.ok(parse({ type: 'state', snapshot: { text: 'x'.repeat(65525) }, ack: -1 }).message);
  assert.equal(parse({ type: 'state', snapshot: { text: 'x'.repeat(65526) }, ack: -1 }).error, 'snapshot_too_large');
  assert.equal(parseMessage('x'.repeat(MAX_MESSAGE_BYTES + 1), 0).error, 'message_too_large');
  assert.equal(parse({ type: 'state', snapshot: { text: '界'.repeat(22000) }, ack: 0 }).error, 'snapshot_too_large');
});

test('allows exact configured origins and opt-in loopback development only', () => {
  const environment = { ALLOWED_ORIGINS: 'https://xq3334.github.io,https://play.example.com' };
  assert.equal(isAllowedOrigin('https://xq3334.github.io', environment), true);
  for (const origin of [null, 'null', 'https://evil.example', 'https://xq3334.github.io.evil.example', 'http://localhost:3000']) {
    assert.equal(isAllowedOrigin(origin, environment), false);
  }
  environment.ALLOW_LOCALHOST = 'true';
  assert.equal(isAllowedOrigin('http://localhost:3000', environment), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:8787', environment), true);
  assert.equal(isAllowedOrigin('http://localhost.evil.example', environment), false);
});

test('rate limits messages and bandwidth per socket', () => {
  const attachment = {};
  for (let index = 0; index < 90; index += 1) assert.equal(consumeRateLimit(attachment, 10, 1000), true);
  assert.equal(consumeRateLimit(attachment, 10, 1000), false);
  assert.equal(consumeRateLimit(attachment, 10, 2000), true);
  assert.equal(consumeRateLimit(attachment, 2 * 1024 * 1024, 2000), false);
});
