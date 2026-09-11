'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { GameWorld, LEVELS, COOP_LEVEL_INDEX } = require('./engine.js');

function advance(world, frames = 1, inputs = []) {
  for (let frame = 0; frame < frames; frame += 1) world.step(1 / 120, inputs);
}
function place(player, horizontal, feet = 450) {
  Object.assign(player, { x: horizontal, y: feet - player.h, velocityX: 0, velocityY: 0, grounded: true, standingOn: null });
}
function until(world, condition, inputs = [], maximum = 1800) {
  for (let frame = 0; frame < maximum && !condition(); frame += 1) advance(world, 1, inputs);
  assert.ok(condition(), `Route stalled: ${world.players.map(player => `${player.x.toFixed(1)},${player.y.toFixed(1)}`).join('; ')}`);
  assert.equal(world.deaths, 0);
}
function moveTo(world, playerIndex, destination) {
  const player = world.players[playerIndex];
  const direction = destination >= player.x ? 'right' : 'left';
  const inputs = [];
  inputs[playerIndex] = { [direction]: true };
  if (direction === 'right') {
    const crossedJets = world.flameJets.filter(jet => jet.x > player.x + player.w && jet.x < destination + player.w).sort((first, second) => first.x - second.x);
    for (const jet of crossedJets) {
      until(world, () => player.x >= jet.x - 70, inputs);
      advance(world, 20);
      until(world, () => (world.time + jet.phase) % jet.period < .1);
      until(world, () => player.x >= Math.min(destination, jet.x + jet.w + 15), inputs);
    }
  }
  until(world, () => direction === 'right' ? player.x >= destination : player.x <= destination, inputs);
  advance(world, 20);
}
function jumpTo(world, playerIndex, destination, feet) {
  const player = world.players[playerIndex];
  const direction = destination >= player.x ? 'right' : 'left';
  const inputs = [];
  inputs[playerIndex] = { [direction]: true, jumpPressed: true };
  advance(world, 1, inputs);
  inputs[playerIndex] = { [direction]: true };
  until(world, () => direction === 'right' ? player.x >= destination : player.x <= destination, inputs);
  advance(world, 20);
  until(world, () => player.grounded);
  assert.equal(player.y + player.h, feet);
}
function solvePlatePair(world, gate) {
  gate.indices.forEach((plateIndex, playerIndex) => {
    const plate = world.plates[plateIndex];
    place(world.players[playerIndex], plate.x + 10, plate.y + 10);
  });
  advance(world, 2);
  assert.equal(gate.open, true);
}
function solveLeverPair(world, gate) {
  gate.indices.forEach((leverIndex, playerIndex) => {
    const lever = world.levers[leverIndex];
    place(world.players[playerIndex], lever.x, lever.y + 38);
  });
  advance(world, 1, [{ interactPressed: true }, { interactPressed: true }]);
  assert.equal(gate.open, true);
}

test('snow is independent, long, two-player only, with nine shared camps', () => {
  assert.equal(COOP_LEVEL_INDEX, 5);
  assert.equal(LEVELS.length, 6);
  const world = new GameWorld(COOP_LEVEL_INDEX, 2);
  assert.equal(world.level.mode, 'coop');
  assert.equal(world.level.theme, 'snow');
  assert.equal(world.level.music, 'snow');
  assert.equal(world.level.requiresPlayers, 2);
  assert.equal(world.level.width, 16000);
  assert.equal(world.level.checkpoints.length, 9);
  assert.equal(world.gates.length, 18);
  assert.equal(world.players.length, 2);
  assert.equal(world.plates, world.level.plates);
  assert.equal(world.levers, world.level.levers);
});

test('snow winds and ice jets vary traversal without occupying switches or gap approaches', () => {
  const world = new GameWorld(COOP_LEVEL_INDEX, 2);
  assert.equal(world.level.name, '雪境双星');
  assert.equal(world.scenicSpots[0].name, '雪境双星 · 极光约定台');
  assert.equal(world.currents.length, 2);
  assert.equal(world.flameJets.length, 3);
  for (const obstacle of [...world.currents, ...world.flameJets]) {
    assert.ok(world.terrain.some(ground => ground.x + 60 <= obstacle.x && ground.x + ground.w - 60 >= obstacle.x + obstacle.w));
    assert.ok([...world.plates, ...world.levers].every(source => source.x + (source.w || 30) < obstacle.x || source.x > obstacle.x + obstacle.w));
  }
  for (const current of world.currents) {
    const windy = new GameWorld(COOP_LEVEL_INDEX, 2);
    const calm = new GameWorld(COOP_LEVEL_INDEX, 2);
    calm.currents = [];
    for (const simulation of [windy, calm]) {
      place(simulation.players[0], current.x + 40);
      advance(simulation, 30, [{ right: true }]);
      assert.equal(simulation.deaths, 0);
      assert.equal(simulation.players[0].grounded, true);
    }
    assert.equal(Math.sign(windy.players[0].x - calm.players[0].x), Math.sign(current.force));
  }
  for (let jetIndex = 0; jetIndex < world.flameJets.length; jetIndex += 1) {
    const simulation = new GameWorld(COOP_LEVEL_INDEX, 2);
    const jet = simulation.flameJets[jetIndex];
    simulation.time = jet.period - jet.activeDuration - .4 - jet.phase + jet.period;
    simulation.updateNightObstacles();
    assert.equal(jet.warning, true);
    assert.equal(jet.active, false);
    simulation.time += .6;
    simulation.updateNightObstacles();
    assert.equal(jet.active, true);
    place(simulation.players[0], jet.x);
    advance(simulation);
    assert.equal(simulation.deaths, 1);
    assert.ok(simulation.players.every(player => player.invincible > 0));
  }
});

test('one body cannot solve any paired plate or paired lever, even visiting both rapidly', () => {
  const world = new GameWorld(COOP_LEVEL_INDEX);
  for (const gate of world.gates) {
    for (const sourceIndex of gate.indices) {
      const source = gate.source === 'paired-plates' ? world.plates[sourceIndex] : world.levers[sourceIndex];
      place(world.players[0], source.x, source.y + (gate.source === 'paired-plates' ? 10 : 38));
      advance(world, 2, [{ interactPressed: true }]);
      assert.equal(gate.open, false);
    }
  }
  place(world.players[0], world.level.exit.x);
  advance(world, 2);
  assert.equal(world.completed, false);
});

test('two bodies on one plate fail; distinct plates permanently latch all nine gates', () => {
  const world = new GameWorld(COOP_LEVEL_INDEX, 2);
  for (const gate of world.gates.filter(gate => gate.source === 'paired-plates')) {
    const plate = world.plates[gate.indices[0]];
    world.players.forEach(player => place(player, plate.x + 10, plate.y + 10));
    advance(world, 2);
    assert.equal(gate.open, false);
    solvePlatePair(world, gate);
    world.respawn(world.players[0]);
    advance(world, 200);
    assert.equal(gate.open, true);
  }
});

test('lever pair rejects same player and expired attempts; two identities solve and latch', () => {
  const world = new GameWorld(COOP_LEVEL_INDEX, 2);
  for (const gate of world.gates.filter(gate => gate.source === 'paired-levers')) {
    for (const leverIndex of gate.indices) {
      const lever = world.levers[leverIndex];
      place(world.players[0], lever.x, lever.y + 38);
      advance(world, 1, [{ interactPressed: true }]);
    }
    assert.equal(gate.open, false);
    advance(world, 610);
    const lastLever = world.levers[gate.indices[1]];
    place(world.players[1], lastLever.x, lastLever.y + 38);
    advance(world, 1, [{}, { interactPressed: true }]);
    assert.equal(gate.open, false);
    solveLeverPair(world, gate);
    world.respawn(world.players[0]);
    advance(world, 610);
    assert.equal(gate.open, true);
  }
});

test('checkpoints require both nearby grounded partners and all earlier gates open', () => {
  const world = new GameWorld(COOP_LEVEL_INDEX, 2);
  advance(world, 5);
  assert.equal(world.checkpointIndex, 0);
  const checkpoint = world.level.checkpoints[1];
  place(world.players[0], checkpoint.x);
  advance(world, 3);
  assert.equal(world.checkpointIndex, 0);
  place(world.players[1], checkpoint.x + 40);
  advance(world, 3);
  assert.equal(world.checkpointIndex, 0);
  solvePlatePair(world, world.gates[0]);
  solveLeverPair(world, world.gates[1]);
  place(world.players[0], checkpoint.x);
  place(world.players[1], checkpoint.x + 40, 340);
  advance(world, 1);
  assert.equal(world.checkpointIndex, 0);
  place(world.players[1], checkpoint.x + 141);
  advance(world, 1);
  assert.equal(world.checkpointIndex, 0);
  place(world.players[1], checkpoint.x + 40);
  advance(world, 2);
  assert.equal(world.checkpointIndex, 1);
  place(world.players[0], 2200);
  world.players[1].y = 650;
  advance(world, 1, [{ right: true }, { right: true }]);
  assert.equal(world.deaths, 1);
  assert.deepEqual(world.players.map(player => [player.x, player.y, player.arrived]), [[checkpoint.x, 412, false], [checkpoint.x + 40, 412, false]]);
  assert.ok(world.gates.slice(0, 2).every(gate => gate.open));
});

test('first full cooperative segment solves via ordinary movement, jumps and interaction', () => {
  const world = new GameWorld(COOP_LEVEL_INDEX, 2);
  advance(world, 5);
  moveTo(world, 0, 280);
  moveTo(world, 1, 665);
  assert.equal(world.gates[0].open, true);
  moveTo(world, 0, 925);
  moveTo(world, 1, 1210);
  jumpTo(world, 1, 1300, 360);
  advance(world, 1, [{ interactPressed: true }, { interactPressed: true }]);
  assert.equal(world.gates[1].open, true);
  for (const playerIndex of [0, 1]) {
    moveTo(world, playerIndex, 1480);
    jumpTo(world, playerIndex, 1660, 450);
    moveTo(world, playerIndex, 1820 + playerIndex * 40);
  }
  advance(world, 5);
  assert.equal(world.checkpointIndex, 1);
  assert.equal(world.deaths, 0);
});

test('every raised puzzle staircase is reachable with normal jump physics', () => {
  for (let stageIndex = 0; stageIndex < 9; stageIndex += 1) {
    for (const puzzleType of ['plate', 'lever']) {
      const world = new GameWorld(COOP_LEVEL_INDEX, 2);
      const start = stageIndex * 1750;
      if (puzzleType === 'lever') solvePlatePair(world, world.gates[stageIndex * 2]);
      const destination = start + (puzzleType === 'plate' ? 640 : 1270);
      const source = puzzleType === 'plate' ? world.plates[stageIndex * 2 + 1] : world.levers[stageIndex * 2 + 1];
      const feet = source.y + (puzzleType === 'plate' ? 10 : 38);
      if (feet === 450) continue;
      const staircase = world.platforms.filter(platform => platform.x >= destination - 260 && platform.x <= destination).sort((first, second) => first.x - second.x);
      place(world.players[1], staircase[0].x - 55);
      advance(world, 5);
      for (const platform of staircase) jumpTo(world, 1, platform.x + 25, platform.y);
      assert.equal(world.players[1].y + 38, feet);
    }
  }
});

test('all short snow gaps and both moving-ice crossings support ordinary inputs', () => {
  for (let stageIndex = 0; stageIndex < 8; stageIndex += 1) {
    const world = new GameWorld(COOP_LEVEL_INDEX, 2);
    const gate = world.gates[stageIndex * 2 + 1];
    solveLeverPair(world, gate);
    const start = stageIndex * 1750;
    const bridge = world.movingPlatforms.find(platform => platform.originX >= start && platform.originX < start + 1750);
    if (!bridge) {
      place(world.players[1], start + 1480);
      advance(world, 5);
      jumpTo(world, 1, start + 1685, 450);
    } else {
      place(world.players[1], bridge.originX - 20);
      advance(world, 5);
      until(world, () => bridge.x < bridge.originX + 15 && bridge.deltaX < 0);
      const player = world.players[1];
      advance(world, 1, [{}, { right: true, jumpPressed: true }]);
      until(world, () => player.x > bridge.originX + 35, [{}, { right: true }]);
      until(world, () => player.standingOn === bridge);
      until(world, () => player.x > bridge.originX + 175);
      advance(world, 1, [{}, { right: true, jumpPressed: true }]);
      until(world, () => player.x > bridge.originX + 320 && player.grounded, [{}, { right: true }]);
    }
    assert.equal(world.deaths, 0);
  }
});

test('both players climb the aurora balcony normally; interaction triggers only once together', () => {
  const world = new GameWorld(COOP_LEVEL_INDEX, 2);
  const staircase = world.platforms.filter(platform => platform.x >= 15550);
  world.players.forEach((player, index) => place(player, 15490 + index * 10));
  advance(world, 5);
  for (const playerIndex of [0, 1]) {
    for (const platform of staircase) jumpTo(world, playerIndex, platform.x + 25, platform.y);
    const inputs = [];
    inputs[playerIndex] = { interactPressed: true };
    advance(world, 1, inputs);
    assert.equal(world.scenicSpots[0].visited, playerIndex === 1);
  }
  advance(world, 1, [{ interactPressed: true }, { interactPressed: true }]);
  assert.equal(world.events.filter(event => event.type === 'scenic').length, 1);
  assert.equal(world.events.find(event => event.type === 'scenic').id, 'snow-aurora');
  world.respawn(world.players[0]);
  assert.equal(world.scenicSpots[0].visited, true);
});

test('arrived partner can leave the exit and completion needs both present', () => {
  const world = new GameWorld(COOP_LEVEL_INDEX, 2);
  place(world.players[0], 15860);
  place(world.players[1], 15600);
  advance(world, 1);
  assert.equal(world.players[0].arrived, true);
  assert.equal(world.completed, false);
  moveTo(world, 0, 15780);
  assert.equal(world.players[0].arrived, false);
  place(world.players[0], 15860);
  place(world.players[1], 15900);
  advance(world, 1);
  assert.equal(world.completed, true);
  advance(world, 100);
  assert.equal(world.events.filter(event => event.type === 'complete').length, 1);
});

test('entire snow expedition is solvable with normal inputs without teleporting or opening gates', context => {
  const world = new GameWorld(COOP_LEVEL_INDEX, 2);
  advance(world, 5);
  for (let stageIndex = 0; stageIndex < 9; stageIndex += 1) {
    const start = stageIndex * 1750;
    const hazard = world.hazards.find(hazard => hazard.x === start + 350);
    moveTo(world, 0, start + 280);
    moveTo(world, 1, start + 300);
    if (hazard) jumpTo(world, 1, start + 430, 450);
    const plate = world.plates[stageIndex * 2 + 1];
    const plateStairs = world.platforms.filter(platform => platform.x >= start + 380 && platform.x <= start + 640);
    if (plateStairs.length) {
      moveTo(world, 1, plateStairs[0].x - 55);
      for (const platform of plateStairs) jumpTo(world, 1, platform.x + 25, platform.y);
    } else moveTo(world, 1, plate.x + 10);
    assert.equal(world.gates[stageIndex * 2].open, true);
    if (hazard) {
      moveTo(world, 0, start + 300);
      jumpTo(world, 0, start + 430, 450);
    }
    moveTo(world, 0, start + 925);
    const leverStairs = world.platforms.filter(platform => platform.x >= start + 1010 && platform.x <= start + 1270);
    moveTo(world, 1, leverStairs[0].x - 55);
    for (const platform of leverStairs) jumpTo(world, 1, platform.x + 25, platform.y);
    advance(world, 1, [{ interactPressed: true }, { interactPressed: true }]);
    assert.equal(world.gates[stageIndex * 2 + 1].open, true);
    if (stageIndex === 8) break;
    const bridge = world.movingPlatforms.find(platform => platform.originX >= start && platform.originX < start + 1750);
    for (const playerIndex of [0, 1]) {
      const player = world.players[playerIndex];
      if (bridge) {
        moveTo(world, playerIndex, bridge.originX - 65);
        until(world, () => bridge.x < bridge.originX + 15 && bridge.deltaX < 0);
        const inputs = [];
        inputs[playerIndex] = { right: true, jumpPressed: true };
        advance(world, 1, inputs);
        inputs[playerIndex] = { right: true };
        until(world, () => player.x > bridge.originX + 35, inputs);
        until(world, () => player.standingOn === bridge);
        until(world, () => player.x > bridge.originX + 175);
        inputs[playerIndex] = { right: true, jumpPressed: true };
        advance(world, 1, inputs);
        inputs[playerIndex] = { right: true };
        until(world, () => player.x > bridge.originX + 320 && player.grounded, inputs);
      } else {
        moveTo(world, playerIndex, start + 1480);
        jumpTo(world, playerIndex, start + 1685, 450);
      }
      moveTo(world, playerIndex, start + 1820 + playerIndex * 40);
    }
    assert.equal(world.checkpointIndex, stageIndex + 1);
  }
  moveTo(world, 0, 15860);
  until(world, () => world.completed, [{}, { right: true }], 5000);
  assert.equal(world.completed, true);
  context.diagnostic(`Known-route sequential input time: ${world.time.toFixed(1)} seconds; blind-play pacing requires human playtesting.`);
  assert.equal(world.deaths, 0);
  assert.ok(world.gates.every(gate => gate.open));
});

test('JSON snapshots copy mutable render state and preserve rider and collection identities', () => {
  for (const levelIndex of [0, 1, 2, 3, 4, COOP_LEVEL_INDEX]) {
    const host = new GameWorld(levelIndex, 2);
    const client = new GameWorld(levelIndex, 2);
    advance(host, 60);
    const solid = host.movingPlatforms[0] || host.crates[0] || host.terrain[0];
    host.players[0].standingOn = solid;
    host.players[0].grounded = true;
    const snapshot = JSON.parse(JSON.stringify(host.captureSnapshot()));
    const playerReference = client.players[0];
    const plateReference = client.plates;
    assert.equal(client.applySnapshot(snapshot), true);
    assert.equal(client.players[0], playerReference);
    assert.equal(client.plates, plateReference);
    assert.equal(client.players[0].standingOn, client.resolveSolid(snapshot.players[0].standingOn));
    assert.notEqual(client.players[0].standingOn, solid);
    assert.deepEqual(client.captureSnapshot(), snapshot);
    snapshot.players[0].x += 10;
    assert.notEqual(client.players[0].x, snapshot.players[0].x);
  }
});

test('closed snow gates cannot be jumped over and shared plates ignore crates', () => {
  const world = new GameWorld(COOP_LEVEL_INDEX, 2);
  const gate = world.gates[0];
  place(world.players[0], gate.x - 80);
  advance(world, 5);
  advance(world, 1, [{ right: true, jumpPressed: true }]);
  advance(world, 120, [{ right: true }]);
  assert.ok(world.players[0].x + world.players[0].w <= gate.x);
  const firstPlate = world.plates[0];
  place(world.players[0], firstPlate.x + 10);
  world.crates.push({ x: world.plates[1].x, y: 410, w: 40, h: 40, carrier: null });
  world.updateMechanisms(0);
  assert.equal(world.plates[1].active, false);
  assert.equal(gate.open, false);
});

test('cooperative snapshot restores solved gates, pending lever windows, scenic and shared respawn', () => {
  const host = new GameWorld(COOP_LEVEL_INDEX, 2);
  solvePlatePair(host, host.gates[0]);
  solveLeverPair(host, host.gates[1]);
  host.players.forEach((player, index) => place(player, 1860 + index * 40));
  advance(host, 2);
  host.scenicSpots[0].visited = true;
  const lever = host.levers[2];
  place(host.players[0], lever.x);
  advance(host, 1, [{ interactPressed: true }]);
  const client = new GameWorld(COOP_LEVEL_INDEX, 2);
  assert.equal(client.applySnapshot(JSON.parse(JSON.stringify(host.captureSnapshot()))), true);
  assert.deepEqual(client.captureSnapshot(), host.captureSnapshot());
  for (const world of [host, client]) {
    world.events = [];
    advance(world, 10, [{ left: true }, { right: true }]);
  }
  assert.deepEqual(client.captureSnapshot(), host.captureSnapshot());
  client.respawn(client.players[1]);
  assert.equal(client.players[0].x, 1860);
  assert.equal(client.players[1].x, 1900);
  assert.equal(client.gates[0].open, true);
  assert.equal(client.scenicSpots[0].visited, true);
});

test('snapshot rejection is bounded, validates references, and never partially applies', () => {
  const world = new GameWorld(COOP_LEVEL_INDEX, 2);
  const before = world.captureSnapshot();
  const mutations = [
    snapshot => { snapshot.players[0].x = Infinity; },
    snapshot => { snapshot.players[0].standingOn = 'movingPlatforms:9000'; },
    snapshot => { snapshot.players[0].carrying = 0; },
    snapshot => { snapshot.players.push(snapshot.players[0]); },
    snapshot => { snapshot.gates[0].open = 'true'; },
    snapshot => { snapshot.events = Array(65).fill({ type: 'jump' }); },
    snapshot => { snapshot.events = [{ type: 'hint', text: 'x'.repeat(257) }]; },
    snapshot => { snapshot.levelIndex = 0; },
    snapshot => { snapshot.checkpointIndex = 2000; },
    snapshot => { snapshot.levers[0].activatedBy = 4; },
    snapshot => { snapshot.extra = {}; },
    snapshot => { snapshot.completed = true; },
    snapshot => { snapshot.players[0].__proto__ = { polluted: true }; }
  ];
  for (const mutate of mutations) {
    const snapshot = structuredClone(before);
    mutate(snapshot);
    assert.equal(world.applySnapshot(snapshot), false);
    assert.deepEqual(world.captureSnapshot(), before);
  }
  for (const value of [null, [], 4, 'bad']) assert.equal(world.applySnapshot(value), false);
});
