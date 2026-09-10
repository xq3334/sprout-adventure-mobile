'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ActionInput, sanitizeProgress, getUnlockedLevel } = require('./mobile-state.js');
const { GameWorld, LEVELS } = require('./engine.js');

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

test('checkpoint respawn and completion events work in all three levels', () => {
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
