'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ActionInput, sanitizeProgress, getUnlockedLevel } = require('./mobile-state.js');
const { GameWorld, LEVELS } = require('./engine.js');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

function createViewportHarness(width, height) {
  const listeners = new Map();
  const properties = new Map();
  const notice = { hidden: false };
  const manualButton = { addEventListener(type, callback) { this[type] = callback; } };
  const page = { clientWidth: width, clientHeight: height, style: { setProperty(name, value) { properties.set(name, value); } } };
  const document = {
    documentElement: page,
    body: { dataset: {} },
    querySelector() { return notice; },
    getElementById(identifier) { return identifier === 'manual-landscape' ? manualButton : { focus() {} }; },
    addEventListener() {}
  };
  let layoutChanges = 0;
  const window = {
    innerWidth: width, innerHeight: height, screen: {},
    addEventListener(type, callback) { listeners.set(type, callback); },
    dispatchEvent() { layoutChanges += 1; }
  };
  runInNewContext(readFileSync(require.resolve('./viewport.js'), 'utf8'), {
    window, document, Event: class { constructor(type) { this.type = type; } },
    setTimeout() { return 1; }, clearTimeout() {}
  });
  return { document, notice, properties, manualButton, window, page, listeners, get layoutChanges() { return layoutChanges; } };
}

test('locked portrait viewport can enter manually without orientation APIs', () => {
  const viewport = createViewportHarness(390, 844);
  assert.equal(viewport.document.body.dataset.orientationBlocked, 'true');
  viewport.manualButton.click();
  assert.equal(viewport.notice.hidden, true);
  assert.equal(viewport.document.body.dataset.orientationBlocked, 'false');
  assert.equal(viewport.document.body.dataset.rotated, 'true');
  assert.equal(viewport.properties.get('--game-width'), '844px');
  assert.equal(viewport.properties.get('--game-height'), '390px');
  assert.equal(viewport.document.body.dataset.compact, 'true');
});

test('native rotation removes manual transform and repeated resize does not pause', () => {
  const viewport = createViewportHarness(390, 844);
  viewport.manualButton.click();
  viewport.page.clientWidth = 844;
  viewport.window.innerHeight = 390;
  viewport.listeners.get('resize')();
  assert.equal(viewport.notice.hidden, true);
  assert.equal(viewport.document.body.dataset.rotated, 'false');
  assert.equal(viewport.properties.get('--game-width'), '844px');
  const changes = viewport.layoutChanges;
  viewport.window.innerHeight = 360;
  viewport.listeners.get('resize')();
  assert.equal(viewport.layoutChanges, changes);
});

test('native landscape does not need manual confirmation', () => {
  const viewport = createViewportHarness(844, 390);
  assert.equal(viewport.notice.hidden, true);
  assert.equal(viewport.document.body.dataset.orientationBlocked, 'false');
});

function advance(world, frames, input = {}) {
  for (let frame = 0; frame < frames; frame += 1) world.step(1 / 120, [input]);
}

test('two pointers holding one action release independently', () => {
  const input = new ActionInput();
  input.press('pointer:1', 'jump');
  input.press('pointer:2', 'jump');
  assert.equal(input.consume()[0].jumpPressed, true);
  input.release('pointer:1');
  assert.equal(input.held.has('jump'), true);
  assert.equal(input.consume()[0].jumpReleased, false);
  input.release('pointer:2');
  assert.equal(input.consume()[0].jumpReleased, true);
  input.release('pointer:2');
  assert.equal(input.consume()[0].jumpReleased, false);
});

test('movement, jump and interaction can be pressed simultaneously', () => {
  const input = new ActionInput();
  input.press('pointer:1', 'right');
  input.press('pointer:2', 'jump');
  input.press('pointer:3', 'interact');
  assert.deepEqual(input.consume()[0], { left: false, right: true, jumpPressed: true, jumpReleased: false, interactPressed: true });
  assert.equal(input.consume()[0].jumpPressed, false);
  assert.equal(input.consume()[0].right, true);
});

test('keyboard and touch ownership do not cancel each other', () => {
  const input = new ActionInput();
  input.press('keyboard:Space', 'jump');
  input.press('pointer:1', 'jump');
  input.consume();
  input.release('keyboard:Space');
  assert.equal(input.consume()[0].jumpReleased, false);
  assert.equal(input.held.has('jump'), true);
});

test('interruptions clear held inputs and queued edges', () => {
  const input = new ActionInput();
  input.press('pointer:1', 'right');
  input.press('pointer:2', 'jump');
  input.clear();
  input.release('pointer:2');
  assert.equal(input.sources.size, 0);
  assert.deepEqual(input.consume()[0], { left: false, right: false, jumpPressed: false, jumpReleased: false, interactPressed: false });
});

test('progress unlocks sequentially and ignores invalid or skipped records', () => {
  assert.equal(getUnlockedLevel({}, 3), 0);
  const records = sanitizeProgress({ 0: { gems: 3, time: 20 } }, LEVELS);
  assert.equal(getUnlockedLevel(records, 3), 1);
  records[1] = { gems: 5, time: 35 };
  assert.equal(getUnlockedLevel(records, 3), 2);
  assert.deepEqual(sanitizeProgress({ 2: { gems: 5, time: 1 } }, LEVELS), {});
  assert.deepEqual(sanitizeProgress({ 0: { gems: 5, time: -1 } }, LEVELS), {});
  assert.deepEqual(sanitizeProgress(null, LEVELS), {});
  assert.deepEqual(sanitizeProgress(JSON.parse(JSON.stringify(records)), LEVELS), records);
});

test('jump while moving produces a jump event and airborne motion', () => {
  const world = new GameWorld(0, 1);
  advance(world, 10);
  const input = new ActionInput();
  input.press('pointer:1', 'right');
  input.press('pointer:2', 'jump');
  world.step(1 / 120, input.consume());
  assert.ok(world.players[0].velocityY < 0);
  assert.ok(world.players[0].velocityX > 0);
  assert.ok(world.events.some(event => event.type === 'jump'));
  input.release('pointer:2');
  world.step(1 / 120, input.consume());
  assert.ok(world.players[0].velocityY >= -230);
});

test('landing produces an animation timer and sound event', () => {
  const world = new GameWorld(0, 1);
  world.players[0].y = 300;
  for (let frame = 0; frame < 120 && !world.players[0].grounded; frame += 1) advance(world, 1);
  assert.ok(world.players[0].landingTime > 0);
  assert.ok(world.events.some(event => event.type === 'land'));
});

test('single player can activate levers in levels one and three', () => {
  for (const levelIndex of [0, 2]) {
    const world = new GameWorld(levelIndex, 1);
    const lever = world.level.levers[0];
    Object.assign(world.players[0], { x: lever.x - 30, y: lever.y });
    advance(world, 1, { right: true, interactPressed: true });
    assert.equal(world.gates[0].open, true);
    assert.equal(world.mechanismUsed, true);
  }
});

test('single player can carry and place a crate onto its pressure plate', () => {
  const world = new GameWorld(1, 1);
  const player = world.players[0];
  Object.assign(player, { x: 1200, y: 412, facing: 1 });
  advance(world, 1, { interactPressed: true });
  assert.equal(player.carrying, 0);
  Object.assign(player, { x: 1300, y: 412 });
  advance(world, 1, { interactPressed: true });
  advance(world, 10);
  assert.equal(player.carrying, null);
  assert.equal(world.level.plates[0].active, true);
  assert.equal(world.gates[0].open, true);
});

test('crate tutorial cannot be bypassed but is reachable from the crate', () => {
  const withoutCrate = new GameWorld(1);
  withoutCrate.crates = [];
  Object.assign(withoutCrate.players[0], { x: 300, y: 412 });
  advance(withoutCrate, 5);
  advance(withoutCrate, 1, { jumpPressed: true, right: true });
  advance(withoutCrate, 100, { right: true });
  assert.ok(withoutCrate.players[0].x <= 320);

  const withCrate = new GameWorld(1);
  const player = withCrate.players[0];
  Object.assign(player, { x: 280, y: 372 });
  advance(withCrate, 5);
  assert.equal(player.standingOn, withCrate.crates[1]);
  advance(withCrate, 1, { jumpPressed: true, right: true });
  advance(withCrate, 70, { right: true });
  assert.ok(player.x > 350);
  assert.equal(player.y + player.h, 300);
});

test('crate-only plate cannot be activated by the player alone', () => {
  const world = new GameWorld(1);
  Object.assign(world.players[0], { x: 1340, y: 412 });
  advance(world, 10);
  assert.equal(world.level.plates[0].active, false);
  assert.equal(world.gates[0].open, false);
});

test('night patrols stay inside territories and contact causes one protected respawn', () => {
  const world = new GameWorld(3);
  for (let frame = 0; frame < 1200; frame += 1) {
    advance(world, 1);
    for (const bat of world.bats) assert.ok(bat.x >= bat.originX && bat.x <= bat.originX + bat.range);
  }
  const bat = world.bats[0];
  Object.assign(world.players[0], { x: bat.x, y: bat.y });
  advance(world, 1);
  assert.equal(world.deaths, 1);
  assert.ok(world.players[0].invincible > 0);
});

test('flame jet has safe, warning and damaging phases', () => {
  const world = new GameWorld(3);
  const jet = world.flameJets[0];
  world.time = 0;
  world.updateNightObstacles();
  assert.equal(jet.active, false);
  world.time = jet.period - jet.activeDuration - .4;
  world.updateNightObstacles();
  assert.equal(jet.warning, true);
  assert.equal(jet.active, false);
  world.time = jet.period - .5;
  Object.assign(world.players[0], { x: jet.x, y: 412 });
  advance(world, 1);
  assert.equal(jet.active, true);
  assert.equal(world.deaths, 1);
});

test('scenic interaction requires reaching the balcony and triggers once per run', () => {
  const world = new GameWorld(3);
  const spot = world.scenicSpots[0];
  const player = world.players[0];
  Object.assign(player, { x: spot.x, y: 412, grounded: true });
  world.interact(player);
  assert.equal(spot.visited, false);
  Object.assign(player, { y: spot.y - player.h });
  advance(world, 5);
  world.interact(player);
  world.interact(player);
  assert.equal(world.events.filter(event => event.type === 'scenic').length, 1);
  world.respawn(player);
  assert.equal(spot.visited, true);
});

test('castle balcony is reachable by two jumps from the main path', () => {
  const world = new GameWorld(3);
  const player = world.players[0];
  Object.assign(player, { x: 2005, y: 412 });
  advance(world, 5);
  advance(world, 1, { jumpPressed: true, right: true });
  advance(world, 55, { right: true });
  advance(world, 20);
  assert.equal(player.y + player.h, 360);
  advance(world, 1, { jumpPressed: true, right: true });
  advance(world, 65, { right: true });
  advance(world, 20);
  assert.equal(player.y + player.h, 275);
  advance(world, 20, { right: true });
  advance(world, 20);
  assert.ok(world.getNearbyScenicSpot(player));
  advance(world, 1, { interactPressed: true });
  assert.equal(world.scenicSpots[0].visited, true);
});

test('castle extension can be crossed with timed movement and jumps', () => {
  const world = new GameWorld(3);
  const player = world.players[0];
  Object.assign(player, { x: 4220, y: 412 });
  const runUntil = (condition, input = {}, maximumFrames = 1200) => {
    for (let frame = 0; frame < maximumFrames && !condition(); frame += 1) advance(world, 1, input);
    assert.ok(condition(), `Route stalled at ${player.x}, ${player.y}`);
    assert.equal(world.deaths, 0);
  };
  advance(world, 5);
  const bridge = world.movingPlatforms[0];
  runUntil(() => bridge.x < 4310 && bridge.deltaX < 0);
  advance(world, 1, { jumpPressed: true, right: true });
  runUntil(() => player.x > 4330, { right: true });
  runUntil(() => player.standingOn === bridge);
  runUntil(() => player.x > 4470);
  advance(world, 1, { jumpPressed: true, right: true });
  runUntil(() => player.x > 4660 && player.grounded, { right: true });
  advance(world, 20);
  for (const jet of world.flameJets.slice(2)) {
    runUntil(() => player.x >= jet.x - 90, { right: true });
    advance(world, 20);
    runUntil(() => (world.time + jet.phase) % jet.period < .15);
    runUntil(() => player.x > jet.x + jet.w + 15, { right: true });
    advance(world, 20);
  }
  runUntil(() => player.x >= 5060, { right: true });
  advance(world, 1, { jumpPressed: true, right: true });
  runUntil(() => player.x >= 5270 && player.grounded, { right: true });
  runUntil(() => player.x >= 5350, { right: true });
  advance(world, 1, { interactPressed: true });
  assert.equal(world.gates[0].open, true);
  runUntil(() => world.completed, { right: true });
});

test('every map selects a distinct soundtrack and synthesis respects pause', () => {
  const browser = {};
  runInNewContext(readFileSync(require.resolve('./audio.js'), 'utf8'), { window: browser });
  const audio = new browser.CozyAudio();
  assert.equal(new Set(LEVELS.map(level => level.music)).size, 4);
  for (const level of LEVELS) {
    audio.setScene(level.music);
    assert.equal(audio.scene, level.music);
  }
  const notes = [];
  audio.context = { currentTime: 1, state: 'running' };
  audio.note = (...argumentsList) => notes.push(argumentsList);
  audio.paused = false;
  audio.nextBeat = 1;
  audio.musicBuffer = { duration: 100 };
  audio.tick();
  assert.ok(notes.length > 0, 'Castle synthesis must continue even when the forest MP3 is cached');
  notes.length = 0;
  audio.paused = true;
  audio.tick(); audio.effect('scenic');
  assert.equal(notes.length, 0);
  audio.paused = false;
  audio.effect('scenic');
  assert.equal(notes.length, 5);
  assert.ok(audio.scenicUntil > audio.context.currentTime);
});

test('scenic rendering stays bounded and restores canvas state in both motion modes', () => {
  const browser = {};
  runInNewContext(readFileSync(require.resolve('./art.js'), 'utf8'), { window: browser, Image: class {} });
  let operations = 0;
  let stackDepth = 0;
  const drawing = new Proxy({}, {
    get(target, property) {
      if (property === 'save') return () => { stackDepth += 1; };
      if (property === 'restore') return () => { stackDepth -= 1; };
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...values) => {
        operations += 1;
        for (const value of values) if (typeof value === 'number') assert.ok(Number.isFinite(value));
      };
    },
    set(target, property, value) {
      if (property === 'globalAlpha') assert.ok(value >= 0 && value <= 1);
      return true;
    }
  });
  for (const reduced of [false, true]) {
    for (const elapsed of [0, .8, 2, 4.9, 7, 9.9, 10]) {
      operations = 0;
      browser.StorybookArt.drawScenicSky(drawing, elapsed, reduced);
      browser.StorybookArt.drawScenicTerrace(drawing, { x: 2320, y: 275 }, elapsed, reduced);
      assert.equal(stackDepth, 0);
      assert.ok(operations < 700);
    }
  }
});

test('scene switching stops the forest recording and resumes it without duplication', () => {
  const browser = {};
  runInNewContext(readFileSync(require.resolve('./audio.js'), 'utf8'), { window: browser });
  const audio = new browser.CozyAudio();
  let starts = 0;
  let stops = 0;
  audio.context = {
    currentTime: 10, state: 'running',
    createBufferSource() { return { connect() {}, disconnect() {}, start() { starts += 1; }, stop() { stops += 1; } }; }
  };
  audio.buses = { music: {} };
  audio.windFilter = { frequency: { setTargetAtTime() {} } };
  audio.musicBuffer = { duration: 100 };
  audio.musicLoadStarted = true;
  audio.paused = false;
  audio.syncMusic(); audio.syncMusic();
  assert.equal(starts, 1);
  audio.setScene('castle');
  assert.equal(stops, 1);
  assert.equal(audio.musicSource, null);
  audio.syncMusic();
  assert.equal(starts, 1);
  audio.setScene('forest');
  assert.equal(starts, 2);
  audio.setScene('forest');
  assert.equal(starts, 2);
});

test('existing three-level save unlocks the fourth level', () => {
  const records = sanitizeProgress({ 0: { time: 30, gems: 5 }, 1: { time: 40, gems: 5 }, 2: { time: 50, gems: 5 } }, LEVELS);
  assert.equal(getUnlockedLevel(records, LEVELS.length), 3);
  assert.equal(LEVELS[3].theme, 'castle');
  assert.ok(LEVELS[3].width > LEVELS[2].width * 2);
});

test('checkpoint respawn and completion events work in all levels', () => {
  for (let levelIndex = 0; levelIndex < LEVELS.length; levelIndex += 1) {
    const world = new GameWorld(levelIndex, 1);
    const player = world.players[0];
    const checkpoint = world.level.checkpoints[0];
    Object.assign(player, { x: checkpoint.x, y: checkpoint.y - player.h });
    advance(world, 1);
    assert.equal(world.checkpointIndex, 0);
    player.y = 700;
    advance(world, 1);
    assert.equal(player.x, checkpoint.x);
    assert.ok(world.events.some(event => event.type === 'respawn'));
    Object.assign(player, { x: world.level.exit.x, y: 412 });
    advance(world, 1);
    assert.equal(world.completed, true);
    assert.equal(world.events.filter(event => event.type === 'complete').length, 1);
    advance(world, 5);
    assert.equal(world.events.filter(event => event.type === 'complete').length, 1);
  }
});
