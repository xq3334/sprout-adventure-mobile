(function exposeEngine(root) {
  'use strict';

  const PHYSICS = Object.freeze({ gravity: 1650, speed: 235, jump: 650, acceleration: 1700, coyoteTime: 0.11, jumpBuffer: 0.13 });
  const LEVELS = [
    {
      name: '初见森林', description: '一段轻轻的起步，认识跳跃、弹簧和森林里的第一道机关。',
      difficulty: '基础体验 · 起步', mechanism: '靠近拉杆，点交互打开木门',
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
      name: '树屋机关', description: '先踩上木箱登上高台，再学习用另一只木箱压住踏板。两种用法，都是后面冒险的准备。',
      difficulty: '基础体验 · 木箱', mechanism: '垫箱登高，再用木箱压住踏板',
      hint: '第一处高台无法从地面直接跳上去。先跳到木箱上，再跳上高台；后半程用另一只箱子压住踏板。',
      width: 2040, spawn: { x: 85, y: 412 },
      terrain: [[0, 450, 500, 120], [350, 300, 150, 150], [620, 450, 440, 120], [1180, 450, 860, 120]],
      platforms: [[715, 355, 150, 20], [915, 280, 110, 20], [1630, 345, 125, 20]],
      hazards: [[780, 432, 65, 18], [1700, 432, 65, 18]], springs: [], levers: [],
      gates: [{ x: 1470, y: 220, w: 34, h: 230, source: 'plate', index: 0 }],
      plates: [{ x: 1330, y: 440, w: 76, h: 10, active: false, requiresCrate: true }], crates: [{ x: 1230, y: 410, w: 40, h: 40 }, { x: 280, y: 410, w: 40, h: 40 }], movingPlatforms: [],
      checkpoints: [{ x: 1200, y: 450 }], gems: [[420, 260], [750, 315], [970, 240], [1380, 370], [1685, 305]],
      exit: { x: 1910, y: 370, w: 66, h: 80 }, signs: [{ x: 185, y: 345, text: '先踩木箱，再跳上高台' }, { x: 1260, y: 335, text: '交互：抱起 / 放下' }]
    },
    {
      name: '云间旅途', description: '搭上慢悠悠的浮岛，借弹簧越过山谷。最后一束星光，藏在风经过的地方。',
      difficulty: '基础体验 · 浮台', mechanism: '乘坐浮台，到达拉杆并打开终点门',
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
    },
    {
      name: '月影古堡', theme: 'castle', description: '基础体验结束，真正的旅程从月下古堡开始。穿过巡逻庭院与喷焰长廊，在观月台留下一张月光纪念。',
      difficulty: '正式闯关 · 月影', mechanism: '穿过庭院，拉动钟楼开门杆',
      hint: '蝙蝠只在灯柱标出的领地巡逻；等喷口熄灭再通过。观月台靠近后点交互打卡，不是通关必需。',
      width: 4280, spawn: { x: 85, y: 412 },
      terrain: [[0, 450, 700, 120], [810, 450, 660, 120], [1580, 450, 940, 120], [2640, 450, 660, 120], [3410, 450, 870, 120]],
      platforms: [[310, 355, 120, 20], [930, 360, 120, 20], [1200, 330, 130, 20], [1740, 365, 130, 20], [2060, 360, 120, 20], [2180, 275, 260, 22], [2790, 355, 125, 20], [3520, 360, 130, 20]],
      hazards: [[1080, 432, 60, 18], [2860, 432, 60, 18]], springs: [], movingPlatforms: [], crates: [], plates: [],
      levers: [{ x: 3730, y: 412, active: false }], gates: [{ x: 3910, y: 210, w: 36, h: 240, source: 'lever', index: 0 }],
      checkpoints: [{ x: 850, y: 450 }, { x: 1620, y: 450 }, { x: 2680, y: 450 }, { x: 3450, y: 450 }],
      bats: [{ x: 440, y: 397, w: 30, h: 22, range: 165, period: 4.8 }, { x: 1200, y: 391, w: 30, h: 22, range: 170, period: 4.2 }, { x: 2950, y: 393, w: 30, h: 22, range: 200, period: 4.5 }, { x: 3580, y: 395, w: 30, h: 22, range: 95, period: 3.8 }],
      flameJets: [{ x: 1830, y: 380, w: 34, h: 70, period: 4.6, activeDuration: 1.8, phase: 0 }, { x: 3050, y: 380, w: 34, h: 70, period: 5.2, activeDuration: 1.6, phase: 1.2 }],
      scenicSpots: [{ id: 'moon-castle', name: '月影古堡 · 观月台', x: 2320, y: 275 }],
      gems: [[360, 315], [750, 365], [985, 320], [1260, 290], [1790, 325], [2110, 320], [2330, 225], [2840, 315], [3580, 320], [4080, 400]],
      exit: { x: 4150, y: 370, w: 66, h: 80 },
      signs: [{ x: 170, y: 335, text: '正式闯关 · 月影古堡' }, { x: 475, y: 300, text: '灯柱之间是蝙蝠领地' }, { x: 1730, y: 295, text: '喷口亮起前会有预警' }, { x: 2070, y: 300, text: '登上高台 · 交互打卡' }, { x: 3730, y: 335, text: '拉杆开启古堡出口' }]
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
      this.bats = (this.level.bats || []).map(bat => ({ ...bat, originX: bat.x, originY: bat.y }));
      this.flameJets = (this.level.flameJets || []).map(jet => ({ ...jet, active: false, warning: false }));
      this.scenicSpots = (this.level.scenicSpots || []).map(spot => ({ ...spot, visited: false }));
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
      const scenicSpot = this.getNearbyScenicSpot(player);
      if (scenicSpot) {
        if (!scenicSpot.visited) {
          scenicSpot.visited = true;
          this.events.push({ type: 'scenic', id: scenicSpot.id, name: scenicSpot.name, x: scenicSpot.x, y: scenicSpot.y });
        } else this.events.push({ type: 'hint', text: '月光纪念已留下，继续向古堡深处出发吧。' });
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

    getNearbyScenicSpot(player) {
      return this.scenicSpots.find(spot => player.grounded && Math.abs(player.x + player.w / 2 - spot.x) < 55 && Math.abs(player.y + player.h - spot.y) < 12);
    }

    updateNightObstacles() {
      this.bats.forEach(bat => {
        const phase = this.time * Math.PI * 2 / bat.period;
        bat.x = bat.originX + (1 - Math.cos(phase)) * bat.range / 2;
        bat.y = bat.originY + Math.sin(phase * 2) * 8;
      });
      this.flameJets.forEach(jet => {
        const phase = (this.time + jet.phase) % jet.period;
        jet.active = phase >= jet.period - jet.activeDuration;
        jet.warning = !jet.active && phase >= jet.period - jet.activeDuration - .8;
      });
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
        const weights = this.crates.filter(crate => crate.carrier === null);
        if (!plate.requiresCrate) weights.push(...this.players);
        plate.active = weights.some(body => overlaps(body, detectionArea));
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
      this.updateNightObstacles();
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
        const touchingDanger = this.hazards.some(hazard => overlaps(player, hazard)) || this.bats.some(bat => overlaps(player, bat)) || this.flameJets.some(jet => jet.active && overlaps(player, jet));
        if (player.y > 610 || (player.invincible <= 0 && touchingDanger)) {
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
