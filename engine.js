(function exposeEngine(root) {
  'use strict';

  const PHYSICS = Object.freeze({ gravity: 1650, speed: 235, jump: 650, acceleration: 1700, coyoteTime: 0.11, jumpBuffer: 0.13 });
  const LEVELS = [
    {
      name: '初见森林', music: 'forest', description: '一段轻轻的起步，认识跳跃、弹簧和森林里的第一道机关。',
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
      name: '树屋机关', music: 'treehouse', description: '先踩上木箱登上高台，再学习用另一只木箱压住踏板。两种用法，都是后面冒险的准备。',
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
      name: '云间旅途', music: 'clouds', description: '搭上慢悠悠的浮岛，借弹簧越过山谷。最后一束星光，藏在风经过的地方。',
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
      name: '月影古堡', theme: 'castle', music: 'castle', description: '穿过月下庭院，在观月台见证流星与星座苏醒。更深处的钟楼断桥和错峰喷焰，等待真正的冒险者。',
      difficulty: '正式闯关 · 月影', mechanism: '穿过断桥，拉动钟楼开门杆',
      hint: '观月台可选打卡。后段等浮桥靠近再跳；喷焰依次熄灭，先在两喷口中间停稳，不要一口气冲过。',
      width: 5680, spawn: { x: 85, y: 412 },
      terrain: [[0, 450, 700, 120], [810, 450, 660, 120], [1580, 450, 940, 120], [2640, 450, 660, 120], [3410, 450, 870, 120], [4610, 450, 480, 120], [5240, 450, 440, 120]],
      platforms: [[310, 355, 120, 20], [930, 360, 120, 20], [1200, 330, 130, 20], [1740, 365, 130, 20], [2060, 360, 120, 20], [2180, 275, 260, 22], [2790, 355, 125, 20], [3520, 360, 130, 20]],
      hazards: [[1080, 432, 60, 18], [2860, 432, 60, 18]], springs: [],
      movingPlatforms: [{ x: 4280, y: 420, w: 100, h: 22, range: 230, period: 4.8 }], crates: [], plates: [],
      levers: [{ x: 5380, y: 412, active: false }], gates: [{ x: 5500, y: 210, w: 36, h: 240, source: 'lever', index: 0 }],
      checkpoints: [{ x: 850, y: 450 }, { x: 1620, y: 450 }, { x: 2680, y: 450 }, { x: 3450, y: 450 }, { x: 4110, y: 450 }, { x: 4640, y: 450 }, { x: 5280, y: 450 }],
      bats: [{ x: 440, y: 397, w: 30, h: 22, range: 165, period: 4.8 }, { x: 1200, y: 391, w: 30, h: 22, range: 170, period: 4.2 }, { x: 2950, y: 393, w: 30, h: 22, range: 200, period: 4.5 }, { x: 3580, y: 395, w: 30, h: 22, range: 95, period: 3.8 }],
      flameJets: [{ x: 1830, y: 380, w: 34, h: 70, period: 4.6, activeDuration: 1.8, phase: 0 }, { x: 3050, y: 380, w: 34, h: 70, period: 5.2, activeDuration: 1.6, phase: 1.2 },
        { x: 4760, y: 345, w: 36, h: 105, period: 4.8, activeDuration: 2.2, phase: 0 },
        { x: 4930, y: 345, w: 36, h: 105, period: 4.8, activeDuration: 2.2, phase: 2.4 }],
      scenicSpots: [{ id: 'moon-castle', name: '月影古堡 · 观月台', x: 2320, y: 275 }],
      gems: [[360, 315], [750, 365], [985, 320], [1260, 290], [1790, 325], [2110, 320], [2330, 225], [2840, 315], [3580, 320], [4080, 400], [4440, 340], [4850, 400], [5165, 350], [5410, 400]],
      exit: { x: 5570, y: 370, w: 66, h: 80 },
      signs: [{ x: 170, y: 335, text: '正式闯关 · 月影古堡' }, { x: 475, y: 300, text: '灯柱之间是蝙蝠领地' }, { x: 1730, y: 295, text: '喷口亮起前会有预警' }, { x: 2070, y: 300, text: '登上高台 · 交互打卡' }, { x: 4140, y: 335, text: '钟楼断桥 · 等浮桥靠近' }, { x: 4700, y: 290, text: '错峰喷焰 · 分两次通过' }, { x: 5380, y: 335, text: '拉杆开启古堡出口' }]
    },
    {
      name: '潮汐王宫', theme: 'palace', music: 'palace',
      description: '戴上泡泡头盔，沿海底王宫的遗迹前进。穿过水母巡游的珊瑚庭院与潮汐断廊，在鲸歌回廊等待深海巨影经过。',
      difficulty: '进阶闯关 · 潮汐', mechanism: '开启两道贝壳机关，进入珍珠王座',
      hint: '仍用方向与跳跃，不需要连续游泳。箭头潮流会推人，先看水母和水柱节奏；鲸歌回廊在高处，打卡不影响通关。',
      width: 6120, spawn: { x: 85, y: 412 },
      terrain: [[0, 450, 680, 120], [820, 450, 620, 120], [1760, 450, 740, 120], [2650, 450, 790, 120], [3780, 450, 620, 120], [4550, 450, 740, 120], [5450, 450, 670, 120]],
      platforms: [[280, 355, 115, 20], [1000, 350, 120, 20], [1910, 350, 120, 20], [2800, 360, 120, 20], [2920, 275, 130, 20], [3070, 190, 250, 22], [3950, 350, 115, 20], [5630, 350, 120, 20]],
      hazards: [[1090, 432, 65, 18], [4100, 432, 70, 18], [5700, 432, 65, 18]],
      springs: [], crates: [], plates: [],
      movingPlatforms: [{ x: 1440, y: 420, w: 95, h: 22, range: 225, period: 4.2 }, { x: 3440, y: 415, w: 90, h: 22, range: 250, period: 3.8 }],
      levers: [{ x: 2310, y: 412, active: false }, { x: 5840, y: 412, active: false }],
      gates: [{ x: 2420, y: 210, w: 32, h: 240, source: 'lever', index: 0 }, { x: 5940, y: 210, w: 32, h: 240, source: 'lever', index: 1 }],
      checkpoints: [{ x: 850, y: 450 }, { x: 1320, y: 450 }, { x: 1800, y: 450 }, { x: 2690, y: 450 }, { x: 3330, y: 450 }, { x: 3820, y: 450 }, { x: 4590, y: 450 }, { x: 5490, y: 450 }],
      jellyfish: [{ x: 420, y: 385, w: 32, h: 38, range: 130, period: 4.2 }, { x: 1160, y: 382, w: 32, h: 38, range: 90, period: 3.8 }, { x: 2010, y: 380, w: 32, h: 38, range: 130, period: 3.6 }, { x: 4140, y: 380, w: 32, h: 38, range: 100, period: 3.4 }, { x: 5630, y: 383, w: 32, h: 38, range: 115, period: 3.5 }],
      currents: [{ x: 1810, y: 320, w: 420, h: 130, force: -55 }, { x: 3880, y: 320, w: 410, h: 130, force: 45 }],
      flameJets: [{ x: 930, y: 350, w: 34, h: 100, period: 4.6, activeDuration: 2, phase: 0 }, { x: 4700, y: 330, w: 36, h: 120, period: 4.4, activeDuration: 2.1, phase: 0 }, { x: 4870, y: 330, w: 36, h: 120, period: 4.4, activeDuration: 2.1, phase: 2.2 }, { x: 5130, y: 330, w: 36, h: 120, period: 4.4, activeDuration: 2.1, phase: .8 }],
      scenicSpots: [{ id: 'whale-palace', name: '潮汐王宫 · 鲸歌回廊', x: 3210, y: 190 }],
      gems: [[330, 315], [750, 355], [1050, 310], [1570, 340], [1960, 310], [2280, 390], [2575, 350], [2850, 320], [2980, 235], [3200, 145], [3590, 330], [4000, 310], [4475, 350], [4805, 400], [5230, 390], [5380, 350], [5680, 310], [5870, 395]],
      exit: { x: 6020, y: 370, w: 66, h: 80 },
      signs: [{ x: 175, y: 325, text: '泡泡头盔 · 仍用跳跃前进' }, { x: 475, y: 295, text: '水母有毒 · 观察巡游' }, { x: 1320, y: 310, text: '断廊 · 等浮石回航' }, { x: 1910, y: 280, text: '逆流区 · 跳稳再前进' }, { x: 2310, y: 330, text: '贝壳机关 · 点交互' }, { x: 2820, y: 285, text: '三级高台 · 鲸歌打卡' }, { x: 3330, y: 320, text: '深渊浮石 · 看准落点' }, { x: 4610, y: 285, text: '三重水柱 · 分段等待' }, { x: 5840, y: 320, text: '开启珍珠王座' }]
    }
  ];

  const COOP_LEVEL_INDEX = 5;

  function createSnowLevel() {
    const level = {
      name: '雪境双星', mode: 'coop', theme: 'snow', music: 'snow', requiresPlayers: 2,
      description: '两个人，从雪松山口走到极光尽头。九段长途、双人踏板与共鸣拉杆，留下只属于你们的雪境合照。',
      difficulty: '双人远征 · 约十分钟初见探索', mechanism: '分站双踏板；五秒内由不同伙伴拉动共鸣双杆',
      hint: '机关打开后永久保持。旗帜须两人靠近才保存；一人跌落会一起回旗帜。出口也要一起到达。',
      width: 16000, spawn: { x: 85, y: 412 },
      terrain: [], platforms: [], hazards: [], springs: [], movingPlatforms: [], crates: [],
      plates: [], levers: [], gates: [], checkpoints: [], gems: [], signs: [],
      currents: [
        { x: 6250, y: 400, w: 180, h: 50, force: -25 },
        { x: 11500, y: 400, w: 180, h: 50, force: 25 }
      ],
      flameJets: [
        { x: 1050, y: 355, w: 32, h: 95, period: 4.8, activeDuration: 1.5, phase: 0 },
        { x: 8050, y: 355, w: 32, h: 95, period: 4.8, activeDuration: 1.5, phase: 1.6 },
        { x: 13300, y: 355, w: 32, h: 95, period: 4.8, activeDuration: 1.5, phase: 3.2 }
      ],
      scenicSpots: [{ id: 'snow-aurora', name: '雪境双星 · 极光约定台', x: 15830, y: 190, radius: 100, requiresPlayers: 2 }],
      exit: { x: 15850, y: 370, w: 100, h: 80 }
    };
    const stages = [
      { start: 0, name: '雪松山口', plateHeight: 450, leverHeight: 360, gap: 120 },
      { start: 1750, name: '高低回声', plateHeight: 360, leverHeight: 275, gap: 130 },
      { start: 3500, name: '霜桥守望', plateHeight: 275, leverHeight: 360, gap: 300 },
      { start: 5250, name: '冰晶阶庭', plateHeight: 360, leverHeight: 190, gap: 140 },
      { start: 7000, name: '雪谷双钟', plateHeight: 275, leverHeight: 275, gap: 120 },
      { start: 8750, name: '风渡浮冰', plateHeight: 450, leverHeight: 190, gap: 300 },
      { start: 10500, name: '银杉长阶', plateHeight: 275, leverHeight: 360, gap: 140 },
      { start: 12250, name: '星雪回廊', plateHeight: 360, leverHeight: 275, gap: 130 },
      { start: 14000, name: '极光之约', plateHeight: 275, leverHeight: 190, gap: 0 }
    ];
    const addStaircase = (destinationX, height, terraceWidth) => {
      const stairCount = Math.ceil((450 - height) / 90) - 1;
      for (let stairIndex = 0; stairIndex < stairCount; stairIndex += 1) {
        level.platforms.push([destinationX - (stairCount - stairIndex) * 130, 365 - stairIndex * 85, 120, 20]);
      }
      if (height < 450) level.platforms.push([destinationX, height, terraceWidth, 22]);
    };
    stages.forEach((stage, stageIndex) => {
      const start = stage.start;
      const groundEnd = start + (stage.gap === 300 ? 1430 : 1530);
      level.terrain.push([start, 450, stageIndex === 8 ? 2000 : groundEnd - start, 120]);
      if (stageIndex < 8) {
        const nextGround = groundEnd + stage.gap;
        if (nextGround < start + 1750) level.terrain.push([nextGround, 450, start + 1750 - nextGround, 120]);
      }
      level.checkpoints.push({ x: start + 110, y: 450 });
      level.signs.push({ x: start + 135, y: 315, text: `${stageIndex + 1} / 9 · ${stage.name} · 旗帜等同伴` });
      const firstPlateIndex = level.plates.length;
      level.plates.push(
        { x: start + 270, y: 440, w: 66, h: 10, active: false, requiresPlayers: true },
        { x: start + 650, y: stage.plateHeight - 10, w: 66, h: 10, active: false, requiresPlayers: true }
      );
      addStaircase(start + 640, stage.plateHeight, 150);
      level.gates.push({ x: start + 820, y: -400, w: 34, h: 850, source: 'paired-plates', indices: [firstPlateIndex, firstPlateIndex + 1] });
      level.signs.push({ x: start + 265, y: 300, text: '各站一块踏板 · 同时亮起永久开门' });
      const firstLeverIndex = level.levers.length;
      level.levers.push(
        { x: start + 925, y: 412, active: false, activatedBy: null, activatedAt: null },
        { x: start + 1310, y: stage.leverHeight - 38, active: false, activatedBy: null, activatedAt: null }
      );
      addStaircase(start + 1270, stage.leverHeight, 100);
      level.gates.push({ x: start + 1410, y: -400, w: 34, h: 850, source: 'paired-levers', indices: [firstLeverIndex, firstLeverIndex + 1], window: 5 });
      level.signs.push({ x: start + 930, y: 295, text: '一人留在低处 · 同伴登高 · 五秒内分别交互' });
      if (stage.gap === 300) {
        level.movingPlatforms.push({ x: groundEnd, y: 420, w: 110, h: 22, range: 190, period: 4.8 });
        level.signs.push({ x: groundEnd + 45, y: 300, text: '浮冰可往返 · 先到者等旗帜' });
      }
      if ([1, 3, 4, 6, 7].includes(stageIndex)) level.hazards.push([start + 350, 432, 50, 18]);
      level.gems.push([start + 440, 320], [start + 695, stage.plateHeight - 45], [start + 1320, stage.leverHeight - 45]);
    });
    level.currents.forEach(current => level.signs.push({ x: current.x, y: 315, text: '轻雪风廊 · 迎风稳走，顺风收步' }));
    level.flameJets.forEach(jet => level.signs.push({ x: jet.x - 65, y: 285, text: '冰泉亮起前有预警 · 熄灭后通过' }));
    // Optional summit detour stays beyond all gates, with three ordinary jump-height steps.
    level.platforms.push([15550, 365, 120, 20], [15680, 280, 120, 20], [15810, 190, 180, 22]);
    level.signs.push({ x: 15500, y: 300, text: '登上三级高台 · 两人同上极光台 · 交互合照' });
    return level;
  }

  LEVELS.push(createSnowLevel());

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
      this.plates = this.level.plates;
      this.levers = this.level.levers;
      this.currents = (this.level.currents || []).map(current => ({ ...current }));
      this.jellyfish = (this.level.jellyfish || []).map(creature => ({ ...creature, originX: creature.x, originY: creature.y }));
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

    captureSnapshot() {
      const snapshot = { version: 1, levelIndex: this.levelIndex, playerCount: this.players.length };
      for (const field of ['time', 'deaths', 'collected', 'completed', 'mechanismUsed', 'checkpointIndex']) snapshot[field] = this[field];
      const fieldsByCollection = this.getSnapshotFields();
      for (const [collection, fields] of Object.entries(fieldsByCollection)) {
        snapshot[collection] = this[collection].map(body => Object.fromEntries(fields.map(field => {
          const value = field === 'standingOn' ? this.identifySolid(body.standingOn) : body[field];
          return [field, value === undefined ? null : value];
        })));
      }
      // Events are transient effects, not simulation history. The transport deduplicates by host tick.
      snapshot.events = this.events.slice(-64).map(event => ({ ...event }));
      return snapshot;
    }

    getSnapshotFields() {
      return {
        players: ['id', 'x', 'y', 'velocityX', 'velocityY', 'grounded', 'coyote', 'jumpBuffer', 'facing', 'invincible', 'standingOn', 'carrying', 'walkDistance', 'landingTime', 'respawnX', 'respawnY', 'arrived'],
        crates: ['x', 'y', 'velocityY', 'carrier'], gates: ['open', 'grace'],
        plates: ['active'], levers: ['active', 'activatedBy', 'activatedAt'],
        movingPlatforms: ['x', 'deltaX'], gems: ['collected'], scenicSpots: ['visited'],
        bats: ['x', 'y'], jellyfish: ['x', 'y'], flameJets: ['active', 'warning']
      };
    }

    identifySolid(solid) {
      if (!solid) return null;
      for (const collection of ['terrain', 'platforms', 'movingPlatforms', 'gates', 'crates']) {
        const index = this[collection].indexOf(solid);
        if (index >= 0) return `${collection}:${index}`;
      }
      return null;
    }

    resolveSolid(identifier) {
      if (typeof identifier !== 'string' || identifier.length > 40) return null;
      const match = /^(terrain|platforms|movingPlatforms|gates|crates):(\d{1,4})$/.exec(identifier);
      return match ? this[match[1]][Number(match[2])] || null : null;
    }

    applySnapshot(snapshot) {
      const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
      const boundedNumber = (value, minimum, maximum) => Number.isFinite(value) && value >= minimum && value <= maximum;
      const boundedInteger = (value, minimum, maximum) => Number.isInteger(value) && boundedNumber(value, minimum, maximum);
      if (!isRecord(snapshot) || snapshot.version !== 1 || snapshot.levelIndex !== this.levelIndex || snapshot.playerCount !== this.players.length) return false;
      const fieldsByCollection = this.getSnapshotFields();
      const scalarFields = ['time', 'deaths', 'collected', 'completed', 'mechanismUsed', 'checkpointIndex'];
      const allowedKeys = ['version', 'levelIndex', 'playerCount', 'events', ...scalarFields, ...Object.keys(fieldsByCollection)];
      if (Object.keys(snapshot).length !== allowedKeys.length || Object.keys(snapshot).some(field => !allowedKeys.includes(field))) return false;
      if (!boundedNumber(snapshot.time, 0, 604800) || !boundedInteger(snapshot.deaths, 0, 1000000) || !boundedInteger(snapshot.collected, 0, this.gems.length) || !boundedInteger(snapshot.checkpointIndex, -1, this.level.checkpoints.length - 1)) return false;
      if (typeof snapshot.completed !== 'boolean' || typeof snapshot.mechanismUsed !== 'boolean') return false;
      const booleanFields = ['grounded', 'arrived', 'active', 'open', 'collected', 'visited', 'warning'];
      const validatedCollections = {};
      for (const [collection, fields] of Object.entries(fieldsByCollection)) {
        const entries = snapshot[collection];
        if (!Array.isArray(entries) || entries.length !== this[collection].length) return false;
        validatedCollections[collection] = [];
        for (let index = 0; index < entries.length; index += 1) {
          const entry = entries[index];
          if (!isRecord(entry) || Object.keys(entry).length !== fields.length || Object.keys(entry).some(field => !fields.includes(field))) return false;
          const validated = {};
          for (const field of fields) {
            const value = entry[field];
            let valid;
            if (booleanFields.includes(field)) valid = typeof value === 'boolean';
            else if (field === 'standingOn') valid = value === null || this.resolveSolid(value) !== null;
            else if (field === 'id') valid = value === index;
            else if (field === 'facing') valid = value === -1 || value === 1;
            else if (field === 'carrying') valid = value === null || boundedInteger(value, 0, this.crates.length - 1);
            else if (field === 'carrier' || field === 'activatedBy') valid = value === null || boundedInteger(value, 0, this.players.length - 1);
            else if (field === 'activatedAt') valid = value === null || boundedNumber(value, 0, snapshot.time);
            else if (field === 'x' || field === 'respawnX') valid = boundedNumber(value, -100, this.level.width + 100);
            else if (field === 'y' || field === 'respawnY') valid = boundedNumber(value, -2000, 1000);
            else if (field === 'velocityX' || field === 'velocityY' || field === 'deltaX') valid = boundedNumber(value, -2000, 2000);
            else if (field === 'walkDistance') valid = boundedNumber(value, 0, 1000000000);
            else valid = boundedNumber(value, 0, 10);
            if (!valid) return false;
            validated[field] = value;
          }
          validatedCollections[collection].push(validated);
        }
      }
      if (snapshot.collected !== validatedCollections.gems.filter(gem => gem.collected).length) return false;
      for (const player of validatedCollections.players) {
        if (player.carrying !== null && validatedCollections.crates[player.carrying].carrier !== player.id) return false;
      }
      for (let crateIndex = 0; crateIndex < validatedCollections.crates.length; crateIndex += 1) {
        const carrier = validatedCollections.crates[crateIndex].carrier;
        if (carrier !== null && validatedCollections.players[carrier].carrying !== crateIndex) return false;
      }
      if (snapshot.completed && (this.players.length < (this.level.requiresPlayers || 1) || !validatedCollections.players.every(player => player.arrived && overlaps({ ...player, w: 30, h: 38 }, this.level.exit)))) return false;
      if (!Array.isArray(snapshot.events) || snapshot.events.length > 64) return false;
      const eventTypes = ['scenic', 'hint', 'interact', 'respawn', 'jump', 'land', 'spring', 'gem', 'checkpoint', 'complete'];
      const validatedEvents = [];
      for (const event of snapshot.events) {
        if (!isRecord(event) || Object.keys(event).length > 6 || !eventTypes.includes(event.type)) return false;
        const validated = {};
        for (const [field, value] of Object.entries(event)) {
          if (['type', 'id', 'name', 'text'].includes(field)) {
            if (typeof value !== 'string' || value.length > 256) return false;
          } else if (field === 'x' || field === 'y') {
            if (!boundedNumber(value, -2000, this.level.width + 1000)) return false;
          } else return false;
          validated[field] = value;
        }
        validatedEvents.push(validated);
      }
      // Apply only after full validation; retain object identity used by renderers and platform riders.
      for (const field of scalarFields) this[field] = snapshot[field];
      for (const [collection, entries] of Object.entries(validatedCollections)) {
        entries.forEach((entry, index) => {
          if (Object.hasOwn(entry, 'standingOn')) entry.standingOn = this.resolveSolid(entry.standingOn);
          Object.assign(this[collection][index], entry);
        });
      }
      this.events = validatedEvents;
      return true;
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
        if (scenicSpot.requiresPlayers && (this.players.length < scenicSpot.requiresPlayers || !this.players.every(teammate => this.getNearbyScenicSpot(teammate) === scenicSpot))) {
          this.events.push({ type: 'hint', text: '等同伴也登上极光台，再一起留下纪念。' });
          return;
        }
        if (!scenicSpot.visited) {
          scenicSpot.visited = true;
          this.events.push({ type: 'scenic', id: scenicSpot.id, name: scenicSpot.name, x: scenicSpot.x, y: scenicSpot.y });
        } else this.events.push({ type: 'hint', text: `${scenicSpot.name}纪念已留下，继续向前探索吧。` });
        return;
      }
      const lever = this.level.levers.find(item => Math.abs(item.x - player.x) < 66 && Math.abs(item.y - player.y) < 75);
      if (lever) {
        if (this.level.mode === 'coop') {
          lever.active = true;
          lever.activatedBy = player.id;
          lever.activatedAt = this.time;
        } else lever.active = !lever.active;
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
      return this.scenicSpots.find(spot => player.grounded && Math.abs(player.x + player.w / 2 - spot.x) < (spot.radius || 55) && Math.abs(player.y + player.h - spot.y) < 12);
    }

    updateNightObstacles() {
      [...this.bats, ...this.jellyfish].forEach(bat => {
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
      if (this.level.mode === 'coop') {
        this.players.forEach(teammate => {
          if (teammate.carrying !== null) this.resetCrate(this.crates[teammate.carrying]);
          Object.assign(teammate, { x: teammate.respawnX, y: teammate.respawnY, velocityX: 0, velocityY: 0, invincible: 1.2, grounded: false, standingOn: null, carrying: null, coyote: 0, jumpBuffer: 0, arrived: false });
        });
        this.gates.filter(gate => gate.source === 'paired-levers' && !gate.open).forEach(gate => {
          gate.indices.forEach(leverIndex => Object.assign(this.levers[leverIndex], { active: false, activatedBy: null, activatedAt: null }));
        });
        this.deaths += 1;
        this.events.push({ type: 'respawn' });
        return;
      }
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
        const weights = plate.requiresPlayers ? [] : this.crates.filter(crate => crate.carrier === null);
        if (!plate.requiresCrate) weights.push(...this.players);
        plate.active = weights.some(body => overlaps(body, detectionArea));
        if (plate.active) this.mechanismUsed = true;
      });
      this.gates.forEach(gate => {
        if (gate.source === 'paired-plates' || gate.source === 'paired-levers') {
          if (gate.open) return;
          let solved = false;
          if (gate.source === 'paired-plates') {
            const occupants = gate.indices.map(plateIndex => {
              const plate = this.plates[plateIndex];
              return this.players.filter(player => player.grounded && overlaps(player, { x: plate.x, y: plate.y - 8, w: plate.w, h: 18 }));
            });
            solved = occupants[0].some(first => occupants[1].some(second => first.id !== second.id));
          } else {
            const pairedLevers = gate.indices.map(leverIndex => this.levers[leverIndex]);
            pairedLevers.forEach(lever => {
              if (lever.activatedAt !== null && this.time - lever.activatedAt > gate.window) Object.assign(lever, { active: false, activatedAt: null, activatedBy: null });
            });
            solved = pairedLevers.every(lever => lever.active && lever.activatedBy !== null) && pairedLevers[0].activatedBy !== pairedLevers[1].activatedBy;
          }
          if (this.players.length === 2 && solved) {
            gate.open = true;
            this.mechanismUsed = true;
            this.events.push({ type: 'interact' });
          }
          return;
        }
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
      let groupRespawned = false;
      this.players.forEach((player, index) => {
        if (groupRespawned) return;
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
        const currentForce = this.currents.reduce((force, current) => force + (overlaps(player, current) ? current.force : 0), 0);
        this.moveBody(player, (player.velocityX + currentForce) * deltaTime, 'x', this.getSolids());
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
        const touchingDanger = this.hazards.some(hazard => overlaps(player, hazard)) || this.jellyfish.some(creature => overlaps(player, creature)) || this.bats.some(bat => overlaps(player, bat)) || this.flameJets.some(jet => jet.active && overlaps(player, jet));
        if (player.y > 610 || (player.invincible <= 0 && touchingDanger)) {
          this.respawn(player);
          groupRespawned = this.level.mode === 'coop';
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
          if (this.level.mode === 'coop') return;
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
      if (this.level.mode === 'coop' && !groupRespawned && this.players.length === 2) {
        this.level.checkpoints.forEach((checkpoint, checkpointIndex) => {
          if (checkpointIndex <= this.checkpointIndex) return;
          const together = this.players.every(player => player.grounded && Math.abs(player.x - checkpoint.x) <= 140 && Math.abs(player.y + player.h - checkpoint.y) <= 12);
          const pathOpen = this.gates.every(gate => gate.x >= checkpoint.x || gate.open);
          if (!together || !pathOpen) return;
          this.checkpointIndex = checkpointIndex;
          this.players.forEach((player, playerIndex) => Object.assign(player, { respawnX: checkpoint.x + playerIndex * 40, respawnY: checkpoint.y - player.h }));
          this.events.push({ type: 'checkpoint' });
        });
      }
      if (this.players.length >= (this.level.requiresPlayers || 1) && this.players.every(player => player.arrived)) {
        this.completed = true;
        this.events.push({ type: 'complete' });
      }
    }
  }

  const engine = { GameWorld, LEVELS, COOP_LEVEL_INDEX, PHYSICS, overlaps };
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  else root.SproutEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
