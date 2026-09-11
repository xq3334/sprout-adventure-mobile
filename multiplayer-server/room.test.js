import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import worker, { RoomRelay } from './worker.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

class FakeSocket {
  constructor(slot) {
    this.readyState = 1;
    this.messages = [];
    this.attachment = { slot, active: true, lastSeen: Date.now(), lastSequence: -1, violations: 0 };
  }
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  send(raw) { this.messages.push(JSON.parse(raw)); }
  close(code, reason) { this.readyState = 3; this.closeCode = code; this.closeReason = reason; }
}

async function makeRoom() {
  const sockets = [new FakeSocket(0), new FakeSocket(1)];
  const storage = new Map();
  const context = {
    storage: {
      get: async key => storage.get(key),
      put: async (key, value) => storage.set(key, structuredClone(value)),
      deleteAll: async () => storage.clear(),
      deleteAlarm: async () => {},
      setAlarm: async () => {}
    },
    blockConcurrencyWhile: callback => callback(),
    getWebSockets: tag => sockets.filter(socket => tag === undefined || String(socket.attachment.slot) === tag)
  };
  const room = new RoomRelay(context, { ALLOWED_ORIGINS: 'https://play.example.com' });
  await Promise.resolve();
  room.session = { room: '123456', createdAt: Date.now(), started: false, paused: false,
    players: [0, 1].map(slot => ({ tokenHash: String(slot), ready: false, disconnectedAt: null })) };
  const send = (slot, message) => room.webSocketMessage(sockets[slot], JSON.stringify(message));
  return { room, sockets, send, storage };
}

const input = { type: 'input', sequence: 0, input: { left: false, right: true, jumpPressed: false, jumpReleased: false, interactPressed: false } };
const last = socket => socket.messages.at(-1);

async function startRoom(fixture) {
  await fixture.send(0, { type: 'ready', ready: true });
  await fixture.send(1, { type: 'ready', ready: true });
  await fixture.send(0, { type: 'start' });
}

test('both players must explicitly ready before host can start', async () => {
  const fixture = await makeRoom();
  await fixture.send(1, input);
  assert.equal(last(fixture.sockets[1]).code, 'not_started');
  await fixture.send(0, { type: 'start' });
  assert.equal(last(fixture.sockets[0]).code, 'not_ready');
  await fixture.send(1, { type: 'start' });
  assert.equal(last(fixture.sockets[1]).code, 'host_only');
  await startRoom(fixture);
  for (const socket of fixture.sockets) assert.equal(last(socket).type, 'started');
});

test('relays authoritative state and ordered guest inputs only to other peer', async () => {
  const fixture = await makeRoom();
  await startRoom(fixture);
  await fixture.send(1, input);
  assert.deepEqual(last(fixture.sockets[0]), input);
  await fixture.send(1, input);
  assert.equal(last(fixture.sockets[1]).code, 'stale_input');
  const state = { type: 'state', snapshot: { tick: 1, players: [] }, ack: 0 };
  await fixture.send(0, state);
  assert.deepEqual(last(fixture.sockets[1]), state);
  await fixture.send(1, state);
  assert.equal(last(fixture.sockets[1]).code, 'host_only');
});

test('pause blocks gameplay and host-only restart resets input sequencing', async () => {
  const fixture = await makeRoom();
  await startRoom(fixture);
  await fixture.send(1, input);
  await fixture.send(1, { type: 'pause', paused: true });
  await fixture.send(1, { ...input, sequence: 1 });
  assert.equal(last(fixture.sockets[1]).code, 'paused');
  await fixture.send(1, { type: 'restart' });
  assert.equal(last(fixture.sockets[1]).code, 'host_only');
  await fixture.send(0, { type: 'restart' });
  assert.equal(last(fixture.sockets[1]).type, 'restarted');
  await fixture.send(1, input);
  assert.deepEqual(last(fixture.sockets[0]), input);
});

test('disconnect pauses immediately, reserves slot, then ends and purges room', async () => {
  const fixture = await makeRoom();
  await startRoom(fixture);
  await fixture.room.webSocketClose(fixture.sockets[1]);
  assert.equal(fixture.room.session.paused, true);
  assert.ok(fixture.sockets[0].messages.some(message => message.type === 'peer-left'));
  await fixture.send(0, { type: 'pause', paused: false });
  assert.equal(last(fixture.sockets[0]).code, 'peer_missing');
  await fixture.send(0, { type: 'restart' });
  assert.equal(last(fixture.sockets[0]).code, 'peer_missing');
  const disconnectedAt = fixture.room.session.players[1].disconnectedAt;
  await fixture.room.expirePeers(disconnectedAt + 29999);
  assert.ok(fixture.room.session);
  await fixture.room.expirePeers(disconnectedAt + 30000);
  assert.equal(fixture.room.session, null);
  assert.equal(last(fixture.sockets[0]).type, 'ended');
  assert.equal(fixture.storage.size, 0);
});

test('hibernation reloads persisted lobby and uses socket attachments', async () => {
  const fixture = await makeRoom();
  await startRoom(fixture);
  const restored = new RoomRelay(fixture.room.context, fixture.room.environment);
  await Promise.resolve();
  assert.equal(restored.session.started, true);
  await restored.webSocketMessage(fixture.sockets[1], JSON.stringify(input));
  assert.deepEqual(last(fixture.sockets[0]), input);
});

test('connection rejects third peer, missing rooms and expired resume creation', async () => {
  const fixture = await makeRoom();
  const request = (role, suffix = '') => new Request(`https://relay.example/room/123456?role=${role}&token=${'a'.repeat(64)}${suffix}`, {
    headers: { Origin: 'https://play.example.com', Upgrade: 'websocket' }
  });
  assert.equal((await fixture.room.fetch(request('guest'))).status, 409);
  fixture.room.session = null;
  assert.equal((await fixture.room.fetch(request('guest'))).status, 404);
  assert.equal((await fixture.room.fetch(request('host', '&resume=1'))).status, 404);
});

test('connection attempts are rate limited before allocating rooms', async () => {
  const environment = {
    ALLOWED_ORIGINS: 'https://play.example.com',
    ROOM_CONNECT_LIMITER: { limit: async () => ({ success: false }) },
    ROOMS: { idFromName() { throw new Error('Must not allocate'); } }
  };
  const request = new Request(`https://relay.example/room/123456?role=host&token=${'a'.repeat(64)}`, {
    headers: { Origin: 'https://play.example.com', Upgrade: 'websocket' }
  });
  assert.equal((await worker.fetch(request, environment)).status, 429);
});

test('public routing rejects missing origin and malformed upgrade before DO allocation', async () => {
  const environment = { ALLOWED_ORIGINS: 'https://play.example.com', ROOMS: { idFromName() { throw new Error('Must not allocate'); } } };
  assert.equal((await worker.fetch(new Request('https://relay.example/room/123456'), environment)).status, 403);
  assert.equal((await worker.fetch(new Request('https://relay.example/room/123456', { headers: { Origin: 'https://play.example.com' } }), environment)).status, 426);
});
