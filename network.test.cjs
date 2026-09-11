'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function makeTransport() {
  const sockets = [];
  const timers = new Map();
  let timerIdentity = 0;
  class FakeWebSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
    send(message) { this.sent.push(JSON.parse(message)); }
    close(code = 1000, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }); }
    receive(message) { this.readyState = 1; this.onmessage?.({ data: JSON.stringify(message) }); }
  }
  const context = vm.createContext({
    URL, TextEncoder, Uint8Array, Uint32Array, crypto: webcrypto, WebSocket: FakeWebSocket,
    setTimeout: (callback, delay) => { timers.set(++timerIdentity, { callback, delay, repeating: false }); return timerIdentity; },
    clearTimeout: identity => timers.delete(identity),
    setInterval: (callback, delay) => { timers.set(++timerIdentity, { callback, delay, repeating: true }); return timerIdentity; },
    clearInterval: identity => timers.delete(identity)
  });
  vm.runInContext(readFileSync(join(__dirname, 'network.js'), 'utf8'), context);
  return { ...context.SproutNetwork, sockets, timers };
}

function welcome(socket, slot = 0, room = '123456') {
  socket.receive({ type: 'welcome', slot, room, reconnected: false, started: false, paused: false });
}

test('generates secure six-digit rooms and rejects insecure remote transport', () => {
  const fixture = makeTransport();
  const rooms = new Set(Array.from({ length: 100 }, () => fixture.generateRoomCode()));
  assert.ok(rooms.size > 90);
  for (const room of rooms) assert.match(room, /^[1-9][0-9]{5}$/);
  assert.throws(() => new fixture.RoomClient({ url: 'http://example.com' }), /WSS/);
  assert.throws(() => new fixture.RoomClient({ url: 'ws://example.com' }), /WSS/);
  assert.doesNotThrow(() => new fixture.RoomClient({ url: 'http://localhost:8787' }));
});

test('connect promise resolves on welcome and exposes identity', async () => {
  const fixture = makeTransport();
  const messages = [];
  const statuses = [];
  const client = new fixture.RoomClient({ url: 'https://relay.example', onMessage: message => messages.push(message), onStatus: status => statuses.push(status) });
  const connection = client.connect({ role: 'host', room: '123456' });
  assert.equal(client.send({ type: 'ready', ready: true }), false);
  assert.match(client.token, /^[a-f0-9]{64}$/);
  const address = new URL(fixture.sockets[0].url);
  assert.equal(address.protocol, 'wss:');
  assert.equal(address.pathname, '/room/123456');
  assert.equal(address.searchParams.get('token'), client.token);
  welcome(fixture.sockets[0]);
  assert.equal((await connection).slot, 0);
  assert.equal(client.role, 'host');
  assert.equal(client.room, '123456');
  assert.equal(client.send({ type: 'ready', ready: true }), true);
  assert.deepEqual(fixture.sockets[0].sent[0], { type: 'ready', ready: true });
  assert.deepEqual(statuses, ['connecting', 'connected']);
  assert.equal(messages[0].type, 'welcome');
  client.close();
  assert.equal(fixture.timers.size, 0);
});

test('host may omit room and guest requires room; reconnect token can be supplied', async () => {
  const fixture = makeTransport();
  const client = new fixture.RoomClient({ url: 'wss://relay.example' });
  await assert.rejects(client.connect({ role: 'guest' }), /six digits/);
  await assert.rejects(client.connect({ role: 'host', token: 'bad' }), /token/);
  const connection = client.connect({ role: 'host', token: 'a'.repeat(64) });
  assert.match(client.room, /^[1-9][0-9]{5}$/);
  assert.equal(client.token, 'a'.repeat(64));
  welcome(fixture.sockets[0], 0, client.room);
  await connection;
  client.close();
});

test('reconnect keeps credentials and explicitly requests resume', async () => {
  const fixture = makeTransport();
  const client = new fixture.RoomClient({ url: 'wss://relay.example' });
  const connection = client.connect({ role: 'guest', room: '123456' });
  welcome(fixture.sockets[0], 1);
  await connection;
  const token = client.token;
  fixture.sockets[0].close(1006, 'network');
  assert.equal(client.connected, false);
  const retry = [...fixture.timers.values()].find(timer => timer.delay === 500);
  assert.ok(retry);
  retry.callback();
  const address = new URL(fixture.sockets[1].url);
  assert.equal(address.searchParams.get('token'), token);
  assert.equal(address.searchParams.get('resume'), '1');
  fixture.sockets[1].receive({ type: 'welcome', room: '123456', slot: 1, reconnected: true, started: true, paused: true });
  assert.equal(client.connected, true);
  client.close();
});

test('oversize payloads and backpressure are refused; terminal close never retries', async () => {
  const fixture = makeTransport();
  const client = new fixture.RoomClient({ url: 'wss://relay.example' });
  const connection = client.connect({ role: 'host', room: '123456' });
  welcome(fixture.sockets[0]);
  await connection;
  assert.equal(client.send({ type: 'state', snapshot: { text: 'x'.repeat(70000) }, ack: -1 }), false);
  fixture.sockets[0].bufferedAmount = 300000;
  assert.equal(client.send({ type: 'ready', ready: true }), false);
  fixture.sockets[0].close(4001, 'replaced');
  assert.equal(fixture.timers.size, 0);
  assert.equal(client.closed, true);
});

test('handshake timeout rejects even when the browser never emits close', async () => {
  const fixture = makeTransport();
  const client = new fixture.RoomClient({ url: 'wss://relay.example' });
  const connection = client.connect({ role: 'host', room: '123456' });
  const rejection = assert.rejects(connection, /连接超时/);
  fixture.sockets[0].close = () => {};
  [...fixture.timers.values()].find(timer => timer.delay === 8000).callback();
  await rejection;
  assert.equal(client.closed, true);
  assert.equal(client.connected, false);
  welcome(fixture.sockets[0]);
  assert.equal(client.connected, false);
  assert.equal(fixture.timers.size, 0);
});

test('cancelled connection ignores late welcome and rejects once', async () => {
  const fixture = makeTransport();
  const client = new fixture.RoomClient({ url: 'wss://relay.example' });
  const connection = client.connect({ role: 'host', room: '123456' });
  client.close();
  await assert.rejects(connection, /cancelled/);
  welcome(fixture.sockets[0]);
  assert.equal(client.connected, false);
  assert.equal(fixture.timers.size, 0);
});
