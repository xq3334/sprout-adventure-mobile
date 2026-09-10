(function exposeEngine(root) {
  'use strict';

  const PHYSICS = Object.freeze({ gravity: 1650, speed: 235, jump: 650, acceleration: 1700, coyoteTime: 0.11, jumpBuffer: 0.13 });
  const LEVELS = [
    {
      name: '初见森林', description: '一段轻轻的起步，认识跳跃、弹簧和森林里的第一道机关。',
      difficulty: '轻松起步', mechanism: '靠近拉杆，点交互打开木门',
      hint: '左手按住方向，右手点跳跃。松开跳跃可以跳得低一点。',
      width: 1920, spawn: { x: 90, y: 412 },
      terrain: [[0, 450, 340, 120], [440, 450, 400, 120], [940, 450, 300, 120], [1340, 450, 580, 120]],
      platforms: [[220, 358, 110, 20], [580, 350, 120, 20], [760, 280, 100, 20], [1070, 350, 130, 20]],
      hazards: [[620, 432, 75, 18]], springs: [[1170, 438, 40, 12]],
      levers: [{ x: 1400, y: 412, active: false }], gates: [{ x: 1530, y: 245, w: 32, h: 205, source: 'lever', index: 0 }],
      plates: [], crates: [], movingPlatforms: [],
      checkpoints: [{ x: 980, y: 450 }], gems: [[275, 320], [510, 405], [810, 240], [1130, 310], [1700, 402]],
      exit: { x: 1800, y: 370, w: 66, h: 80 }, signs: [{ x: 120, y: 396, text: '方向移动 · 右侧跳跃' }, { x: 1360, y: 350, text: '靠近拉杆点交互' }]
    },
    {
      name: '树屋机关', description: '把森林里的木箱放到踏板上，让沉睡的木门醒来。每一个小机关，都藏着一条新路。',
      difficulty: '动动脑筋', mechanism: '用木箱压住金色踏板',
      hint: '靠近木箱点交互抱起，再点交互放下。把箱子放到踏板上，让门保持打开。',
      width: 2040, spawn: { x: 85, y: 412 },
      terrain: [[0, 450, 500, 120], [620, 450, 440, 120], [1180, 450, 860, 120]],
      platforms: [[235, 360, 135, 20], [715, 355, 150, 20], [915, 280, 110, 20], [1630, 345, 125, 20]],
      hazards: [[780, 432, 65, 18], [1700, 432, 65, 18]], springs: [], levers: [],
      gates: [{ x: 1470, y: 220, w: 34, h: 230, source: 'plate', index: 0 }],
      plates: [{ x: 1330, y: 440, w: 76, h: 10, active: false }], crates: [{ x: 1230, y: 410, w: 40, h: 40 }], movingPlatforms: [],
      checkpoints: [{ x: 1200, y: 450 }], gems: [[290, 320], [750, 315], [970, 240], [1380, 370], [1685, 305]],
      exit: { x: 1910, y: 370, w: 66, h: 80 }, signs: [{ x: 155, y: 390, text: '小心荆棘，跳过去' }, { x: 1260, y: 335, text: '交互：抱起 / 放下' }]
    },
    {
      name: '云间旅途', description: '搭上慢悠悠的浮岛，借弹簧越过山谷。最后一束星光，藏在风经过的地方。',
      difficulty: '勇敢一点', mechanism: '乘坐浮台，到达拉杆并打开终点门',
      hint: '等浮台靠近再起跳，站稳后它会带你走。踩上弹簧时按住方向，借力越过山谷。',
      width: 2060, spawn: { x: 85, y: 412 },
      terrain: [[0, 450, 360, 120], [650, 450, 510, 120], [1470, 450, 590, 120]],
      platforms: [[175, 345, 105, 20], [790, 345, 120, 20], [1040, 300, 100, 20], [1800, 345, 100, 20]],
      hazards: [[850, 432, 70, 18]], springs: [[1090, 438, 40, 12]],
      movingPlatforms: [{ x: 360, y: 420, w: 115, h: 22, range: 190, period: 4.4 }, { x: 1170, y: 395, w: 120, h: 22, range: 195, period: 4.8 }],
      levers: [{ x: 1000, y: 412, active: false }], gates: [{ x: 1660, y: 215, w: 32, h: 235, source: 'lever', index: 0 }],
      plates: [], crates: [], checkpoints: [{ x: 720, y: 450 }, { x: 1510, y: 450 }],
      gems: [[225, 306], [495, 330], [850, 305], [1090, 260], [1845, 305]],
      exit: { x: 1940, y: 370, w: 66, h: 80 }, signs: [{ x: 270, y: 342, text: '等浮台靠近，再跳' }, { x: 970, y: 343, text: '别忘了拉杆 · 交互' }]
    }
  ];

  function overlaps(first, second) {
    return first.x < second.x + second.w && first.x + first.w > second.x && first.y < second.y + second.h && first.y + first.h > second.y;
  }

  function makeRectangle(values) {
    const [x, y, w, h] = values;
    return { x, y, w, h };
  }

  function approach(value, target, amount) {
    return value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
  }

  class GameWorld {
    constructor(levelIndex = 0, playerCount = 1) {
      this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, levelIndex));
      this.level = JSON.parse(JSON.stringify(LEVELS[this.levelIndex]));
      this.time = 0;
      this.deaths = 0;
      this.collected = 0;
      this.completed = false;
      this.mechanismUsed = false;
      this.checkpointIndex = -1;
      this.events = [];
      this.terrain = this.level.terrain.map(makeRectangle);
      this.platforms = this.level.platforms.map(makeRectangle);
      this.hazards = this.level.hazards.map(makeRectangle);
      this.springs = this.level.springs.map(makeRectangle);
      this.movingPlatforms = this.level.movingPlatforms.map(platform => ({ ...platform, originX: platform.x, deltaX: 0 }));
      this.gems = this.level.gems.map(([x, y]) => ({ x, y, w: 18, h: 22, collected: false }));
      this.crates = this.level.crates.map(crate => ({ ...crate, spawnX: crate.x, spawnY: crate.y, velocityY: 0, carrier: null }));
      this.gates = this.level.gates.map(gate => ({ ...gate, open: false, grace: 0 }));
      this.players = Array.from({ length: playerCount === 2 ? 2 : 1 }, (_, index) => ({
        id: index, x: this.level.spawn.x + index * 45, y: this.level.spawn.y,
        w: 30, h: 38, velocityX: 0, velocityY: 0, grounded: false, coyote: 0,
        jumpBuffer: 0, facing: 1, invincible: 0, standingOn: null, carrying: null,
        walkDistance: 0, landingTime: 0,
        respawnX: this.level.spawn.x + index * 45, respawnY: this.level.spawn.y, arrived: false
      }));
    }

    getSolids(includeCrates = true) {
      return [...this.terrain, ...this.platforms, ...this.movingPlatforms, ...this.gates.filter(gate => !gate.open), ...(includeCrates ? this.crates.filter(crate => crate.carrier === null) : [])];
    }

    moveBody(body, distance, axis, solids) {
      body[axis] += distance;
      for (const solid of solids) {
        if (!overlaps(body, solid)) continue;
        if (axis === 'x') {
          if (distance > 0) body.x = solid.x - body.w;
          if (distance < 0) body.x = solid.x + solid.w;
          body.velocityX = 0;
        } else {
          if (distance > 0) {
            body.y = solid.y - body.h;
            body.grounded = true;
            body.standingOn = solid;
          }
          if (distance < 0) body.y = solid.y + solid.h;
          body.velocityY = 0;
        }
      }
    }

    interact(player) {
      if (player.carrying !== null) {
        const crate = this.crates[player.carrying];
        const desiredPosition = { x: player.x + player.facing * 44, y: player.y + player.h - crate.h, w: crate.w, h: crate.h };
        if (desiredPosition.x < 0 || desiredPosition.x + crate.w > this.level.width || this.getSolids().some(solid => solid !== crate && overlaps(desiredPosition, solid))) {
          this.events.push({ type: 'hint', text: '这里放不下木箱，换一个空一点的位置。' });
          return;
        }
        Object.assign(crate, desiredPosition, { carrier: null, velocityY: 0 });
        player.carrying = null;
        this.events.push({ type: 'interact' });
        return;
      }
      const lever = this.level.levers.find(item => Math.abs(item.x - player.x) < 66 && Math.abs(item.y - player.y) < 75);
      if (lever) {
        lever.active = !lever.active;
        this.mechanismUsed = true;
        this.events.push({ type: 'interact' });
        return;
      }
      const crateIndex = this.crates.findIndex(crate => crate.carrier === null && Math.abs(crate.x - player.x) < 70 && Math.abs(crate.y - player.y) < 65);
      if (crateIndex >= 0) {
        player.carrying = crateIndex;
        this.crates[crateIndex].carrier = player.id;
        this.events.push({ type: 'interact' });
      }
    }

    respawn(player) {
      if (player.carrying !== null) {
        this.resetCrate(this.crates[player.carrying]);
        player.carrying = null;
      }
      Object.assign(player, { x: player.respawnX, y: player.respawnY, velocityX: 0, velocityY: 0, invincible: 1.2, grounded: false, standingOn: null, coyote: 0, jumpBuffer: 0, arrived: false });
      this.deaths += 1;
      this.events.push({ type: 'respawn' });
    }

    resetCrate(crate) {
      Object.assign(crate, { x: crate.spawnX, y: crate.spawnY, velocityY: 0, carrier: null });
    }

    updateMechanisms(deltaTime) {
      this.level.plates.forEach(plate => {
        const detectionArea = { x: plate.x, y: plate.y - 8, w: plate.w, h: 18 };
        plate.active = [...this.players, ...this.crates.filter(crate => crate.carrier === null)].some(body => overlaps(body, detectionArea));
        if (plate.active) this.mechanismUsed = true;
      });
      this.gates.forEach(gate => {
        const source = gate.source === 'lever' ? this.level.levers[gate.index] : this.level.plates[gate.index];
        gate.grace = source.active ? 1.4 : Math.max(0, gate.grace - deltaTime);
        const occupied = [...this.players, ...this.crates].some(body => overlaps(body, gate));
        gate.open = source.active || gate.grace > 0 || (gate.open && occupied);
      });
    }

    step(deltaTime, inputs = []) {
      if (this.completed) return;
      deltaTime = Math.min(Math.max(deltaTime, 0), 1 / 30);
      this.time += deltaTime;
      this.movingPlatforms.forEach(platform => {
        const previousX = platform.x;
        platform.x = platform.originX + (1 - Math.cos(this.time * Math.PI * 2 / platform.period)) * platform.range / 2;
        platform.deltaX = platform.x - previousX;
      });
      this.updateMechanisms(deltaTime);
      this.crates.forEach(crate => {
        if (crate.carrier !== null) return;
        crate.velocityY = Math.min(crate.velocityY + PHYSICS.gravity * deltaTime, 900);
        this.moveBody(crate, crate.velocityY * deltaTime, 'y', this.getSolids(false));
        if (crate.y > 620 || this.hazards.some(hazard => overlaps(crate, hazard))) this.resetCrate(crate);
      });
      this.players.forEach((player, index) => {
        const input = inputs[index] || {};
        const wasGrounded = player.grounded;
        player.landingTime = Math.max(0, player.landingTime - deltaTime);
        const solids = this.getSolids();
        player.invincible = Math.max(0, player.invincible - deltaTime);
        if (player.grounded) player.coyote = PHYSICS.coyoteTime;
        else player.coyote = Math.max(0, player.coyote - deltaTime);
        player.jumpBuffer = input.jumpPressed ? PHYSICS.jumpBuffer : Math.max(0, player.jumpBuffer - deltaTime);
        if (player.standingOn && player.standingOn.deltaX) this.moveBody(player, player.standingOn.deltaX, 'x', solids.filter(solid => solid !== player.standingOn));
        const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (direction) player.facing = direction;
        player.velocityX = approach(player.velocityX, direction * PHYSICS.speed, PHYSICS.acceleration * deltaTime);
        if (player.jumpBuffer > 0 && player.coyote > 0) {
          player.velocityY = -PHYSICS.jump;
          player.jumpBuffer = 0;
          player.coyote = 0;
          player.grounded = false;
          this.events.push({ type: 'jump' });
        }
        if (input.jumpReleased && player.velocityY < -230) player.velocityY = -230;
        if (input.interactPressed) this.interact(player);
        player.velocityY = Math.min(player.velocityY + PHYSICS.gravity * deltaTime, 950);
        const movementStartX = player.x;
        this.moveBody(player, player.velocityX * deltaTime, 'x', this.getSolids());
        player.x = Math.max(0, Math.min(this.level.width - player.w, player.x));
        if (wasGrounded) player.walkDistance += Math.abs(player.x - movementStartX);
        const landingSpeed = player.velocityY;
        player.grounded = false;
        player.standingOn = null;
        this.moveBody(player, player.velocityY * deltaTime, 'y', this.getSolids());
        if (!wasGrounded && player.grounded && landingSpeed > 150) {
          player.landingTime = .16;
          this.events.push({ type: 'land', x: player.x + player.w / 2, y: player.y + player.h });
        }
        for (const spring of this.springs) {
          if (overlaps(player, { ...spring, y: spring.y - 8, h: spring.h + 8 }) && player.velocityY >= 0) {
            player.velocityY = -850;
            player.grounded = false;
            player.coyote = 0;
            this.events.push({ type: 'spring' });
          }
        }
        if (player.carrying !== null) {
          const crate = this.crates[player.carrying];
          crate.x = player.x + player.w / 2 - crate.w / 2;
          crate.y = player.y - crate.h - 8;
        }
        if (player.y > 610 || (player.invincible <= 0 && this.hazards.some(hazard => overlaps(player, hazard)))) {
          this.respawn(player);
          return;
        }
        this.gems.forEach(gem => {
          if (!gem.collected && overlaps(player, { x: gem.x - 11, y: gem.y - 13, w: 24, h: 26 })) {
            gem.collected = true;
            this.collected += 1;
            this.events.push({ type: 'gem', x: gem.x, y: gem.y });
          }
        });
        this.level.checkpoints.forEach((checkpoint, checkpointIndex) => {
          if (checkpointIndex <= this.checkpointIndex || Math.abs(player.x - checkpoint.x) > 38 || Math.abs(player.y + player.h - checkpoint.y) > 45) return;
          this.checkpointIndex = checkpointIndex;
          this.players.forEach((teammate, teammateIndex) => {
            teammate.respawnX = checkpoint.x + teammateIndex * 40;
            teammate.respawnY = checkpoint.y - teammate.h;
          });
          this.events.push({ type: 'checkpoint' });
        });
        player.arrived = overlaps(player, this.level.exit);
      });
      this.updateMechanisms(0);
      if (this.players.every(player => player.arrived)) {
        this.completed = true;
        this.events.push({ type: 'complete' });
      }
    }
  }

  const engine = { GameWorld, LEVELS, PHYSICS, overlaps };
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  else root.SproutEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
