'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createContext, runInContext } = require('node:vm');

const protocolPromise = import('./multiplayer-server/protocol.js');
const scriptSources = new Map(['engine.js', 'mobile-state.js', 'art.js', 'game.js', 'coop.js'].map(filename => [
  filename, readFileSync(require.resolve(`./${filename}`), 'utf8')
]));
const progressKey = 'sprout-mobile-progress-v1';
const snowMemoryKey = 'sprout-mobile-snow-memory-v1';
const initialStorage = {
  [progressKey]: JSON.stringify(Object.fromEntries(Array.from({ length: 5 }, (_, index) => [index, { gems: 0, time: 60 + index }]))),
  'sprout-mobile-comfort-v1': JSON.stringify({ reduceMotion: true, hideTimer: true, sky: 'auto' }),
  'sprout-mobile-moon-memory-v1': 'true',
  'sprout-mobile-whale-memory-v1': 'true'
};

function createRelay(protocol) {
  const clients = [];
  const messages = [];
  const deliveries = [];
  let started = false;

  function enqueue(client, message) {
    if (client?.connected) deliveries.push(() => {
      if (client.connected) client.onMessage(client.decode(JSON.stringify(message)));
    });
  }

  function broadcast(message) {
    for (const client of clients) enqueue(client, message);
  }

  function updateLobby() {
    broadcast({ type: 'lobby', players: clients.map(client => ({ slot: client.slot, ready: client.ready, connected: client.connected })) });
  }

  class RoomClient {
    constructor({ url, onMessage, onStatus }) {
      assert.match(url, /^https:\/\//);
      this.onMessage = onMessage;
      this.onStatus = onStatus;
      this.connected = false;
      this.ready = false;
      clients.push(this);
    }

    connect({ room, role }) {
      this.room = room;
      this.role = role;
      this.slot = role === 'host' ? 0 : 1;
      this.connected = true;
      enqueue(this, { type: 'welcome', room, slot: this.slot });
      updateLobby();
      return Promise.resolve();
    }

    send(payload) {
      if (!this.connected) return false;
      const parsed = protocol.parseMessage(JSON.stringify(payload), this.slot);
      assert.equal(parsed.error, undefined, `${this.role} sent invalid ${payload.type}: ${parsed.error}`);
      const message = parsed.message;
      messages.push({ role: this.role, ...message });
      if (message.type === 'ready') {
        this.ready = message.ready;
        updateLobby();
      } else if (message.type === 'start' || message.type === 'restart') {
        assert.equal(this.slot, 0, 'Only the host may start or restart');
        assert.equal(clients.filter(client => client.connected && client.ready).length, 2, 'Both players must be ready');
        started = true;
        broadcast({ type: message.type === 'start' ? 'started' : 'restarted' });
      } else if (message.type === 'pause') {
        assert.ok(started, 'Pause requires an active session');
        assert.ok(message.paused || this.slot === 0, 'Only the host may resume');
        broadcast(message);
      } else if (message.type === 'input' || message.type === 'state') {
        assert.ok(started, 'Simulation messages require an active session');
        for (const peer of clients) if (peer !== this && peer.room === this.room) enqueue(peer, message);
      }
      return true;
    }

    close() {
      if (!this.connected) return;
      this.connected = false;
      for (const peer of clients) if (peer !== this) enqueue(peer, { type: 'peer-left', slot: this.slot });
      updateLobby();
    }
  }

  return {
    RoomClient, clients, messages,
    flush() {
      let deliveryCount = 0;
      while (deliveries.length) {
        assert.ok(++deliveryCount < 1000, 'Relay delivery must settle without an infinite message loop');
        deliveries.shift()();
      }
    },
    replay(message, recipient) { enqueue(recipient, message); },
    disconnect(client) {
      client.close();
      client.onStatus({ status: 'disconnected' });
    }
  };
}

function createPage(relay, savedStorage = initialStorage) {
  const elements = new Map();
  const windowListeners = new Map();
  const storage = new Map(Object.entries(savedStorage));
  const writes = [];
  const observedEvents = [];
  const snapshotResults = [];
  let frameCallback;
  let timestamp = 1000;
  let drawingOperations = 0;
  let canvasDepth = 0;
  let context;
  let document;

  const drawing = new Proxy({}, {
    get(target, property) {
      if (property === 'save') return () => { canvasDepth += 1; };
      if (property === 'restore') return () => { canvasDepth -= 1; assert.ok(canvasDepth >= 0, 'Canvas restore must match save'); };
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (property === 'measureText') return text => ({ width: String(text).length * 8 });
      return (...values) => {
        drawingOperations += 1;
        for (const value of values) if (typeof value === 'number') assert.ok(Number.isFinite(value), `Canvas ${String(property)} received a non-finite coordinate`);
      };
    },
    set(target, property, value) { target[property] = value; return true; }
  });

  function getElement(identifier) {
    if (!elements.has(identifier)) {
      const listeners = new Map();
      const classes = new Set();
      const attributes = new Map();
      const node = {
        dataset: {}, hidden: false, disabled: false, value: '', textContent: '', open: false,
        width: 960, height: 540, clientWidth: 960, clientHeight: 540,
        previousElementSibling: {}, style: { setProperty() {} },
        classList: {
          toggle(name, enabled) {
            const active = enabled === undefined ? !classes.has(name) : Boolean(enabled);
            if (active) classes.add(name); else classes.delete(name);
            return active;
          },
          contains(name) { return classes.has(name); },
          add(name) { classes.add(name); },
          remove(name) { classes.delete(name); }
        },
        addEventListener(type, callback) {
          if (!listeners.has(type)) listeners.set(type, []);
          listeners.get(type).push(callback);
        },
        dispatch(type, details = {}) {
          const event = { target: node, preventDefault() {}, stopPropagation() {}, ...details };
          for (const listener of listeners.get(type) || []) listener(event);
        },
        click() { if (!node.disabled) node.dispatch('click'); },
        focus() { document.activeElement = node; },
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name); },
        setPointerCapture() {},
        getContext() { return drawing; },
        getClientRects() { return node.hidden ? [] : [{}]; },
        getBoundingClientRect() { return { width: 960, height: 540, left: 0, top: 0 }; },
        querySelector(selector) { return getElement(`${identifier}:${selector}`); },
        querySelectorAll() { return []; },
        closest(selector) { return getElement(`${identifier}:closest:${selector}`); }
      };
      elements.set(identifier, node);
    }
    return elements.get(identifier);
  }

  const levelButtons = Array.from({ length: 5 }, (_, index) => Object.assign(getElement(`level-${index}`), { dataset: { level: String(index) } }));
  const touchButtons = ['left', 'right', 'jump', 'interact'].map(action => Object.assign(getElement(`[data-touch="${action}"]`), { dataset: { touch: action } }));
  document = {
    body: { dataset: {} }, hidden: false, activeElement: null,
    getElementById: getElement, querySelector: getElement,
    querySelectorAll(selector) {
      if (selector === '[data-level]') return levelButtons;
      if (selector === '[data-touch]') return touchButtons;
      return [];
    },
    addEventListener() {}
  };
  const browser = {
    document,
    console,
    URL, URLSearchParams,
    Image: class {},
    performance: { now: () => timestamp },
    location: { href: 'https://game.example.test/', hash: '' },
    matchMedia() { return { matches: false }; },
    addEventListener(type, callback) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(callback);
    },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { writes.push({ key, value: String(value) }); storage.set(key, String(value)); }
    },
    requestAnimationFrame(callback) { frameCallback = callback; return 1; },
    SproutNetwork: {
      generateRoomCode: () => '123456',
      RoomClient: class extends relay.RoomClient {
        constructor(options) {
          super(options);
          // A browser parses received JSON in its own realm; strict snapshots reject foreign prototypes.
          this.decode = serialized => runInContext(`JSON.parse(${JSON.stringify(serialized)})`, context);
        }
      }
    }
  };
  browser.window = browser;
  context = createContext(browser);
  for (const [filename, source] of scriptSources) runInContext(source, context, { filename });

  const applySnapshot = browser.SproutEngine.GameWorld.prototype.applySnapshot;
  browser.SproutEngine.GameWorld.prototype.applySnapshot = function observeSnapshot(snapshot) {
    const accepted = applySnapshot.call(this, snapshot);
    snapshotResults.push(accepted);
    return accepted;
  };
  const processEvents = browser.SproutGame.processEvents;
  browser.SproutGame.processEvents = () => {
    observedEvents.push(...JSON.parse(JSON.stringify(browser.SproutGame.getWorld().events)));
    processEvents();
  };

  return {
    browser, context, document, storage, writes, observedEvents, snapshotResults, getElement,
    get world() { return browser.SproutGame.getWorld(); },
    get drawingOperations() { return drawingOperations; },
    click(identifier) { getElement(identifier).click(); relay.flush(); },
    press(action, pointerId = 1) { getElement(`[data-touch="${action}"]`).dispatch('pointerdown', { pointerId }); },
    release(pointerId = 1) {
      for (const listener of windowListeners.get('pointerup') || []) listener({ pointerId });
    },
    frame(milliseconds = 1000 / 60) {
      timestamp += milliseconds;
      assert.equal(typeof frameCallback, 'function', 'Game must schedule an animation frame');
      frameCallback(timestamp);
      assert.equal(canvasDepth, 0, 'Rendering must restore canvas state');
    },
    validateSnapshot(snapshot) {
      const serialized = JSON.stringify(snapshot);
      return runInContext(`new SproutEngine.GameWorld(SproutEngine.COOP_LEVEL_INDEX, 2).applySnapshot(JSON.parse(${JSON.stringify(serialized)}))`, context);
    }
  };
}

async function createSession() {
  const relay = createRelay(await protocolPromise);
  const host = createPage(relay);
  const guest = createPage(relay);
  for (const page of [host, guest]) {
    page.click('open-coop-lobby');
    assert.equal(page.getElement('coop-lobby').hidden, false);
    page.getElement('relay-url').value = 'https://relay.example.test';
  }
  host.click('create-room');
  assert.equal(host.getElement('room-code').value, '123456');
  guest.getElement('room-code').value = host.getElement('room-code').value;
  guest.click('join-room');
  assert.equal(host.getElement('start-room').disabled, true, 'Unready room must not start');
  host.click('ready-room');
  assert.equal(host.getElement('start-room').disabled, true, 'One ready player is insufficient');
  guest.click('ready-room');
  assert.equal(host.getElement('start-room').disabled, false);
  assert.equal(guest.getElement('start-room').disabled, true, 'Guest must not own the start control');
  host.click('start-room');
  for (const page of [host, guest]) {
    assert.equal(page.world.level.mode, 'coop');
    assert.equal(page.world.players.length, 2);
    assert.equal(page.browser.SproutGame.isPlaying(), true);
    assert.equal(page.getElement('coop-lobby').hidden, true);
    page.frame();
  }
  function advance(frames = 1) {
    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      guest.frame();
      relay.flush();
      host.frame();
      relay.flush();
    }
  }
  return { relay, host, guest, advance };
}

function assertPersonalStoragePreserved(page) {
  for (const [key, value] of Object.entries(initialStorage)) assert.equal(page.storage.get(key), value, `${key} must remain unchanged`);
  assert.equal(page.writes.filter(write => write.key === progressKey).length, 0, 'Cooperative play must never rewrite single-player progress');
}

function placeAtScenicSpot(page) {
  const scenicSpot = page.world.scenicSpots[0];
  for (const [index, player] of page.world.players.entries()) {
    Object.assign(player, { x: scenicSpot.x - 35 + index * 40, y: scenicSpot.y - player.h, velocityX: 0, velocityY: 0, grounded: true, standingOn: null });
  }
}

test('cooperative lobby reports a missing service URL without connecting or changing saves', async () => {
  const relay = createRelay(await protocolPromise);
  const page = createPage(relay);
  page.getElement('relay-url').value = '';
  page.click('open-coop-lobby');
  for (const button of ['create-room', 'join-room']) {
    page.click(button);
    assert.match(page.getElement('room-status').textContent, /尚未配置联机服务/);
    assert.equal(page.getElement('relay-url').closest('details').open, true);
  }
  assert.equal(relay.clients.length, 0);
  assert.equal(page.world.players.length, 1);
  assertPersonalStoragePreserved(page);
});

test('lobby defaults to the deployed relay without overwriting a saved custom relay', async () => {
  const relay = createRelay(await protocolPromise);
  const page = createPage(relay);
  assert.equal(page.getElement('relay-url').value, 'https://sprout-adventure-rooms.3597327971.workers.dev');
  const customPage = createPage(relay, { ...initialStorage, 'sprout-relay-url-v1': 'https://custom.example.test' });
  assert.equal(customPage.getElement('relay-url').value, 'https://custom.example.test');
  assert.equal(relay.clients.length, 0);
  assertPersonalStoragePreserved(page);
});

test('guest sends direction press and release on the next frame instead of waiting for the periodic send', async () => {
  const { guest, relay } = await createSession();
  const inputMessages = () => relay.messages.filter(message => message.type === 'input');
  const originalCount = inputMessages().length;
  const originalPosition = guest.world.players[1].x;
  guest.press('right', 81);
  guest.frame(10);
  assert.equal(inputMessages().length, originalCount + 1);
  assert.equal(inputMessages().at(-1).input.right, true);
  assert.ok(guest.world.players[1].x > originalPosition);
  guest.release(81);
  guest.frame(10);
  assert.equal(inputMessages().length, originalCount + 2);
  assert.equal(inputMessages().at(-1).input.right, false);
});

test('two VM pages create, join, ready and start through actual lobby controls', async () => {
  const { host, guest, relay, advance } = await createSession();
  advance(8);
  assert.notEqual(host.world, guest.world, 'Each page must own an independent engine world');
  assert.notEqual(host.browser.SproutEngine.GameWorld, guest.browser.SproutEngine.GameWorld);
  assert.match(host.getElement('save-status').textContent, /1 号/);
  assert.match(guest.getElement('save-status').textContent, /2 号/);
  assert.ok(relay.messages.some(message => message.type === 'start' && message.role === 'host'));
  for (const page of [host, guest]) {
    assert.ok(page.drawingOperations > 0, 'Actual art/game rendering must run');
    assertPersonalStoragePreserved(page);
  }
});

test('guest touch movement and jump traverse the relay, step the host and apply valid guest snapshots', async () => {
  const { host, guest, relay, advance } = await createSession();
  advance(10);
  const originalGuestPosition = host.world.players[1].x;
  const originalHostPosition = host.world.players[0].x;
  guest.press('right', 11);
  advance(12);
  guest.press('jump', 12);
  advance(3);
  assert.ok(relay.messages.some(message => message.type === 'input' && message.input.right && message.input.jumpPressed), 'Touch jump edge must reach the relay while movement remains held');
  assert.ok(host.world.players[1].x > originalGuestPosition + 20, 'Host must simulate the guest movement');
  assert.ok(host.world.players[1].velocityY < 0, 'Host must simulate the guest jump');
  assert.equal(host.world.players[0].x, originalHostPosition, 'Guest touch must never move slot zero');
  assert.equal(host.observedEvents.filter(event => event.type === 'jump').length, 1, 'A held jump edge must fire once');
  assert.ok(guest.world.players[1].x > originalGuestPosition + 20);
  guest.release(12);
  guest.release(11);
  advance(12);
  assert.ok(relay.messages.some(message => message.type === 'input' && message.input.jumpReleased && !message.input.right));
  assert.equal(host.world.players[1].velocityX, 0);
  assert.ok(guest.snapshotResults.length >= 3, 'Guest must attempt authoritative snapshots');
  assert.ok(guest.snapshotResults.every(Boolean), 'Host snapshots must pass the strict engine validator after relay metadata is stripped');
  const state = relay.messages.filter(message => message.type === 'state').at(-1);
  const { relayEvents, ...snapshot } = state.snapshot;
  assert.ok(Array.isArray(relayEvents));
  assert.ok(state.ack > 0, 'Host must acknowledge received input');
  assert.equal(guest.validateSnapshot(snapshot), true, 'Wire snapshot must round-trip through the real engine');
  assert.equal(guest.world.time, snapshot.time, 'Guest must receive authoritative simulation time');
  assert.ok(Math.abs(host.world.players[1].x - guest.world.players[1].x) < 20, 'Released input must converge to the host position');
});

test('shared scenic interaction persists on both pages exactly once despite replayed state envelopes', async () => {
  const { host, guest, relay, advance } = await createSession();
  placeAtScenicSpot(host);
  advance(8);
  guest.press('interact', 21);
  advance(8);
  guest.release(21);
  const scenicState = relay.messages.filter(message => message.type === 'state' && message.snapshot.relayEvents.some(envelope => envelope.event.type === 'scenic')).at(-1);
  assert.ok(scenicState, 'Host must relay the shared scenic event');
  for (let replayIndex = 0; replayIndex < 3; replayIndex += 1) relay.replay(scenicState, relay.clients[1]);
  relay.flush();
  guest.press('interact', 22);
  advance(10);
  guest.release(22);
  for (const page of [host, guest]) {
    assert.equal(page.world.scenicSpots[0].visited, true);
    assert.equal(page.storage.get(snowMemoryKey), 'true');
    assert.equal(page.writes.filter(write => write.key === snowMemoryKey).length, 1, 'Repeated snapshots and check-ins must not duplicate persistence');
    assert.equal(page.observedEvents.filter(event => event.type === 'scenic').length, 1, 'Scenic presentation must run once on each page');
    assert.match(page.getElement('scenic-status').textContent, /极光合影 1 \/ 1/);
    assertPersonalStoragePreserved(page);
  }
});

test('guest pause freezes both engines, only host resumes, and held touch is cleared', async () => {
  const { host, guest, relay, advance } = await createSession();
  guest.press('right', 31);
  advance(10);
  guest.click('pause-button');
  for (const page of [host, guest]) assert.equal(page.browser.SproutGame.isPlaying(), false);
  const pausedTime = host.world.time;
  advance(15);
  assert.equal(host.world.time, pausedTime);
  const pauseMessages = relay.messages.filter(message => message.type === 'pause').length;
  guest.click('play-button');
  assert.equal(relay.messages.filter(message => message.type === 'pause').length, pauseMessages, 'Guest resume must be blocked before transmission');
  assert.equal(guest.browser.SproutGame.isPlaying(), false);
  host.click('play-button');
  for (const page of [host, guest]) assert.equal(page.browser.SproutGame.isPlaying(), true);
  const resumedMessageIndex = relay.messages.length;
  advance(12);
  assert.ok(host.world.time > pausedTime);
  assert.equal(host.world.players[1].velocityX, 0);
  const resumedInputs = relay.messages.slice(resumedMessageIndex).filter(message => message.type === 'input');
  assert.ok(resumedInputs.length > 0);
  assert.ok(resumedInputs.every(message => !message.input.right && !message.input.jumpPressed), 'Pause must clear held directions and queued edges');
  guest.release(31);
});

test('disconnect pauses both pages and prevents host resume while a peer is offline', async () => {
  const { host, guest, relay, advance } = await createSession();
  advance(8);
  relay.disconnect(relay.clients[1]);
  relay.flush();
  const pausedTime = host.world.time;
  for (const page of [host, guest]) assert.equal(page.browser.SproutGame.isPlaying(), false);
  assert.match(host.getElement('room-status').textContent, /断线/);
  assert.match(guest.getElement('room-status').textContent, /中断|无法连接/);
  const messageCount = relay.messages.length;
  host.click('play-button');
  advance(20);
  assert.equal(host.world.time, pausedTime);
  assert.equal(relay.messages.length, messageCount, 'Offline session must not send resume or simulation traffic');
  assert.equal(host.getElement('start-room').disabled, true);
});

test('host restart resets both worlds and event deduplication while preserving collected souvenirs', async () => {
  const { host, guest, relay, advance } = await createSession();
  placeAtScenicSpot(host);
  advance(8);
  guest.press('interact', 41);
  advance(8);
  guest.release(41);
  for (const page of [host, guest]) assert.equal(page.storage.get(snowMemoryKey), 'true');
  const previousHostWorld = host.world;
  const previousGuestWorld = guest.world;
  guest.click('restart-button');
  assert.equal(host.world, previousHostWorld, 'Guest cannot restart the host world');
  host.click('restart-button');
  assert.notEqual(host.world, previousHostWorld);
  assert.notEqual(guest.world, previousGuestWorld);
  for (const page of [host, guest]) {
    assert.equal(page.world.time, 0);
    assert.equal(page.world.deaths, 0);
    assert.equal(page.world.collected, 0);
    assert.equal(page.world.checkpointIndex, -1);
    assert.equal(page.world.completed, false);
    assert.equal(page.world.scenicSpots[0].visited, false);
    assert.equal(page.storage.get(snowMemoryKey), 'true');
    assertPersonalStoragePreserved(page);
  }
  const restartMessageIndex = relay.messages.length;
  placeAtScenicSpot(host);
  advance(8);
  guest.press('interact', 42);
  advance(8);
  guest.release(42);
  const firstNewInput = relay.messages.slice(restartMessageIndex).find(message => message.type === 'input');
  assert.equal(firstNewInput.sequence, 1, 'Restart must reset guest input sequence');
  for (const page of [host, guest]) {
    assert.equal(page.observedEvents.filter(event => event.type === 'scenic').length, 2, 'New run must present one new scenic event even after sequence reset');
    assert.equal(page.writes.filter(write => write.key === snowMemoryKey).length, 2, 'Each run must persist its scenic event exactly once');
  }
});

test('leaving the room returns to playable single-player with existing saves and memories intact', async () => {
  const { host, guest, relay, advance } = await createSession();
  placeAtScenicSpot(host);
  advance(8);
  guest.press('interact', 51);
  advance(8);
  guest.release(51);
  for (const page of [guest, host]) {
    page.click('leave-room');
    assert.equal(page.world.players.length, 1);
    assert.equal(page.world.levelIndex, 0);
    assert.notEqual(page.world.level.mode, 'coop');
    assert.equal(page.getElement('room-entry').hidden, false);
    assert.equal(page.storage.get(snowMemoryKey), 'true');
    assertPersonalStoragePreserved(page);
    page.click('level-4');
    assert.equal(page.world.levelIndex, 4, 'Previously unlocked single-player maps must remain accessible');
    assert.equal(page.browser.SproutGame.isPlaying(), true);
    page.frame();
    const originalPosition = page.world.players[0].x;
    page.press('right', 52);
    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) page.frame();
    page.release(52);
    assert.ok(page.world.players[0].x > originalPosition, 'Single-player touch input must continue after leaving');
  }
  assert.ok(relay.clients.every(client => !client.connected));
});
