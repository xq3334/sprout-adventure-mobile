(() => {
  'use strict';

  const art = window.StorybookArt;
  const { GameWorld, LEVELS } = window.SproutEngine;
  const canvas = document.getElementById('game-canvas');
  const context = canvas.getContext('2d');
  const element = identifier => document.getElementById(identifier);
  const { ActionInput, sanitizeProgress, getUnlockedLevel } = window.SproutMobile;
  const actionInput = new ActionInput();
  const touchButtons = [...document.querySelectorAll('[data-touch]')];
  const particles = [];
  const playerCount = 1;
  let world;
  let status = 'welcome';
  let animationTime = 0;
  let previousTime = 0;
  let accumulator = 0;
  let hudElapsed = 0;
  const audioAvailable = typeof window.CozyAudio === 'function';
  // Optional audio must never prevent input handlers or the game loop from starting.
  const cozyAudio = audioAvailable ? new window.CozyAudio() : {
    enabled: false,
    volumes: { music: .38, effects: .42, nature: .2 },
    async unlock() {},
    setPaused() {},
    setEnabled() { this.enabled = false; },
    setVolume(category, value) {
      if (category in this.volumes && Number.isFinite(value)) this.volumes[category] = Math.max(0, Math.min(1, value));
    },
    tick() {},
    effect() {}
  };
  const comfort = { sky: 'auto', reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, hideTimer: true };
  try {
    const saved = JSON.parse(localStorage.getItem('sprout-mobile-comfort-v1') || '{}');
    if (saved && typeof saved === 'object') {
      if (['auto', '0', '1', '2', '3'].includes(saved.sky)) comfort.sky = saved.sky;
      for (const setting of ['reduceMotion', 'hideTimer']) if (typeof saved[setting] === 'boolean') comfort[setting] = saved[setting];
      if (audioAvailable && typeof saved.enabled === 'boolean') cozyAudio.enabled = saved.enabled;
      for (const category of ['music', 'effects', 'nature']) if (typeof saved[category] === 'number') cozyAudio.setVolume(category, saved[category]);
    }
  } catch { /* Private browsing may prevent preference storage. */ }
  let completedLevels = {};
  let storageAvailable = true;
  let toastTime = 0;
  let currentLevel = 0;

  try {
    const savedProgress = JSON.parse(localStorage.getItem('sprout-mobile-progress-v1') || '{}');
    completedLevels = sanitizeProgress(savedProgress, LEVELS);
  } catch {
    storageAvailable = false;
    element('save-status').textContent = '本机存档不可用，仍可正常游玩';
  }

  function roundRectangle(x, y, width, height, radius, fill, stroke) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = 2; context.stroke(); }
  }

  function ellipse(x, y, radiusX, radiusY, fill, rotation = 0) {
    context.beginPath();
    context.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
  }

  function line(points, color, width = 2) {
    context.beginPath();
    points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();
  }

  function text(content, x, y, size = 12, color = '#567345', align = 'center') {
    context.font = `600 ${size}px "Microsoft YaHei", sans-serif`;
    context.textAlign = align;
    context.fillStyle = color;
    context.fillText(content, x, y);
  }

  function drawStar(x, y, size, color) {
    context.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = point * Math.PI / 5 - Math.PI / 2;
      const radius = point % 2 === 0 ? size : size * 0.48;
      const pointX = x + Math.cos(angle) * radius;
      const pointY = y + Math.sin(angle) * radius;
      if (!point) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    }
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  function drawCloud(x, y, scale = 1) {
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    ellipse(0, 0, 44, 17, '#f7f9e9');
    ellipse(-18, -10, 24, 21, '#f7f9e9');
    ellipse(13, -19, 29, 27, '#f7f9e9');
    ellipse(38, -3, 24, 16, '#f7f9e9');
    context.restore();
  }

  function drawTree(x, ground, scale = 1, distant = false) {
    if (!distant && art.drawTree(context, x, ground, scale, currentLevel)) return;
    context.save();
    context.translate(x, ground);
    context.scale(scale, scale);
    const foliage = distant ? '#94b58b' : '#87ad65';
    const light = distant ? '#a7c39b' : '#a4c777';
    roundRectangle(-12, -166, 24, 175, 8, distant ? '#9eaf83' : '#a39363');
    line([[0, -95], [-28, -125]], distant ? '#9eaf83' : '#a39363', 9);
    ellipse(-40, -160, 46, 49, foliage, -.2);
    ellipse(35, -165, 49, 52, foliage, .2);
    ellipse(-6, -207, 55, 59, light);
    ellipse(-31, -223, 26, 25, '#ffffff12');
    if (!distant) {
      line([[-5, -42], [-5, -60]], '#8d7e54', 2);
      ellipse(13, -201, 4, 7, '#6d9554');
      ellipse(31, -190, 3, 5, '#6d9554');
    }
    context.restore();
  }

  function drawBackground(camera, viewWidth) {
    if (art.drawBackground(context, camera, viewWidth, currentLevel)) return;
    const gradient = context.createLinearGradient(0, 0, 0, 540);
    gradient.addColorStop(0, currentLevel === 2 ? '#d2e8df' : '#cce5d0');
    gradient.addColorStop(.7, '#e4ebc3');
    gradient.addColorStop(1, '#cbdcb2');
    context.fillStyle = gradient;
    context.fillRect(0, 0, viewWidth, 540);
    ellipse(733 - camera * .08, 100, 43, 43, '#fbf3c2');
    ellipse(733 - camera * .08, 100, 58, 58, '#fbf3c226');
    for (let index = -1; index < 6; index += 1) {
      drawCloud(index * 320 + 80 - camera * .13 + Math.sin(animationTime * .04 + index) * 9, 95 + (index % 3) * 31, .7 + ((index + 6) % 3) * .16);
    }
    const layers = [{ color: '#b9d1ae', base: 355, height: 105, parallax: .18 }, { color: '#adc797', base: 405, height: 98, parallax: .32 }];
    layers.forEach(layer => {
      context.beginPath();
      context.moveTo(-100, 540);
      for (let position = -100; position <= viewWidth + 100; position += 15) {
        const height = layer.base - Math.sin((position + camera * layer.parallax) * .008) * layer.height * .4 - Math.sin((position + camera * layer.parallax) * .003 + 1) * layer.height * .6;
        context.lineTo(position, height);
      }
      context.lineTo(viewWidth + 100, 540);
      context.closePath();
      context.fillStyle = layer.color;
      context.fill();
    });
    for (let index = -1; index < 10; index += 1) drawTree(index * 205 + 100 - camera * .43, 437, .65 + ((index + 12) % 3) * .17, true);
    for (let index = 0; index < 7; index += 1) {
      const birdX = index * 190 + 150 - camera * .2;
      line([[birdX - 6, 133 + (index % 2) * 30], [birdX, 136 + (index % 2) * 30], [birdX + 6, 132 + (index % 2) * 30]], '#94af8d', 1.5);
    }
  }

  function drawTerrain(terrain) {
    if (art.drawTerrain(context, terrain)) return;
    const { x, y, w, h } = terrain;
    roundRectangle(x, y + 4, w, h, 9, '#b59c71');
    context.fillStyle = '#c4ad7c';
    context.fillRect(x + 4, y + 20, w - 8, 19);
    roundRectangle(x - 3, y - 3, w + 6, 17, 7, '#91b665');
    roundRectangle(x, y - 4, w, 8, 4, '#b4d582');
    for (let position = x + 12; position < x + w - 10; position += 32) {
      ellipse(position, y + 12, 10, 6 + Math.sin(position) * 3, '#91b665');
      if (position % 3 < 1.3) ellipse(position + 4, y + 56, 4, 2, '#a98d65');
      line([[position, y - 4], [position - 3, y - 11], [position + 1, y - 7], [position + 4, y - 13]], '#94b86b', 1.5);
    }
    for (let position = x + 22; position < x + w - 25; position += 89) {
      ellipse(position, y + 76, 8, 5, '#ae946c', .3);
      ellipse(position + 21, y + 46, 3, 2, '#d5bb8b');
    }
  }

  function drawPlatform(platform, moving = false) {
    const { x, y, w, h } = platform;
    roundRectangle(x, y, w, h, 6, moving ? '#bfa77b' : '#aa926c');
    roundRectangle(x - 3, y - 4, w + 6, 10, 5, moving ? '#bdd492' : '#a6c876');
    for (let position = x + 13; position < x + w; position += 25) line([[position, y + 9], [position + 9, y + 9]], '#917c59', 1.3);
    if (moving) {
      ellipse(x + 18, y + h + 4, 13, 5, '#dce9c9');
      ellipse(x + w - 18, y + h + 4, 13, 5, '#dce9c9');
    } else {
      line([[x + 20, y + h], [x + 24, y + h + 14], [x + 17, y + h + 21]], '#819f5b', 2);
      ellipse(x + 20, y + h + 13, 6, 3, '#88a961', .4);
    }
  }

  function drawDecorations() {
    world.terrain.forEach((terrain, terrainIndex) => {
      if (terrain.w > 310) drawTree(terrain.x + terrain.w - 70, terrain.y, .82 + terrainIndex % 2 * .22);
      if (terrainIndex === 1) art.drawImage(context, 'cottage', terrain.x + 35, terrain.y - 160, 210, 160);
      for (let flowerOffset = 10; flowerOffset < terrain.w - 100; flowerOffset += 180) {
        art.drawImage(context, 'flowers', terrain.x + flowerOffset, terrain.y - 40, 100, 40);
      }
      for (let offset = 38; offset < terrain.w - 30; offset += 130) {
        const position = terrain.x + offset;
        const ground = terrain.y;
        line([[position, ground], [position - 2, ground - 17]], '#70975a', 2);
        ellipse(position - 6, ground - 8, 6, 3, '#88aa61', .5);
        ellipse(position + 3, ground - 13, 5, 3, '#88aa61', -.5);
        ellipse(position - 2, ground - 20, 5, 5, '#f8edba');
        ellipse(position - 2, ground - 20, 2, 2, '#d5b75e');
      }
      if (terrainIndex % 2 === 0) {
        const mushroomX = terrain.x + 63;
        roundRectangle(mushroomX - 4, terrain.y - 18, 8, 18, 3, '#f7e8b9');
        ellipse(mushroomX, terrain.y - 21, 15, 10, '#d79b78');
        ellipse(mushroomX - 4, terrain.y - 24, 3, 2, '#f6d8ae');
      }
    });
  }

  function drawMechanisms() {
    world.hazards.forEach(hazard => {
      roundRectangle(hazard.x - 3, hazard.y + 12, hazard.w + 6, 8, 4, '#956c67');
      for (let position = hazard.x + 4; position < hazard.x + hazard.w; position += 17) {
        context.beginPath();
        context.moveTo(position - 6, hazard.y + hazard.h);
        context.lineTo(position + 1, hazard.y - 2);
        context.lineTo(position + 9, hazard.y + hazard.h);
        context.fillStyle = '#a7827c';
        context.fill();
        line([[position + 1, hazard.y + 3], [position + 5, hazard.y + 13]], '#c4a29a', 2);
      }
    });
    world.springs.forEach(spring => {
      line([[spring.x + 6, spring.y + 10], [spring.x + 31, spring.y + 6], [spring.x + 9, spring.y + 2], [spring.x + 30, spring.y - 3]], '#829e67', 3);
      roundRectangle(spring.x - 1, spring.y - 7, spring.w + 2, 8, 4, '#e7c674', '#b4a160');
      text('↑', spring.x + 20, spring.y - 18, 16, '#96a470');
    });
    world.level.plates.forEach(plate => {
      roundRectangle(plate.x, plate.y + 3, plate.w, 8, 4, '#988560');
      roundRectangle(plate.x + 3, plate.y + (plate.active ? 4 : -2), plate.w - 6, 7, 3, plate.active ? '#aaca72' : '#e6c371');
      text(plate.active ? '已触发' : '压力踏板', plate.x + plate.w / 2, plate.y + 36, 10, '#77684d');
    });
    world.level.levers.forEach(lever => {
      roundRectangle(lever.x - 6, lever.y + 27, 35, 11, 4, '#a69166');
      line([[lever.x + 11, lever.y + 28], [lever.x + (lever.active ? 28 : -4), lever.y + 2]], '#8d8061', 6);
      ellipse(lever.x + (lever.active ? 28 : -4), lever.y + 2, 8, 8, lever.active ? '#accb77' : '#e2ba68');
      roundRectangle(lever.x - 4, lever.y - 36, 31, 21, 6, '#f9fce6d9');
      text('交互', lever.x + 11, lever.y - 21, 11);
    });
    world.gates.forEach(gate => {
      roundRectangle(gate.x - 7, gate.y - 5, gate.w + 14, gate.h + 10, 6, '#8e855b');
      roundRectangle(gate.x - 3, gate.y, gate.w + 6, gate.h, 4, '#c9d3a4');
      if (!gate.open) {
        for (let position = gate.x; position < gate.x + gate.w; position += 12) roundRectangle(position, gate.y + 4, 9, gate.h - 4, 3, '#b4a071');
        roundRectangle(gate.x - 8, gate.y + gate.h / 2, gate.w + 16, 12, 3, '#98855d');
      } else {
        context.fillStyle = '#dcecc875';
        context.fillRect(gate.x, gate.y + 20, gate.w, gate.h - 20);
        roundRectangle(gate.x - 8, gate.y + 4, gate.w + 16, 13, 3, '#9ca86c');
      }
      ellipse(gate.x + gate.w / 2, gate.y - 14, 6, 6, gate.open ? '#b7d786' : '#e8c77d');
    });
    world.level.checkpoints.forEach((checkpoint, index) => {
      const active = index <= world.checkpointIndex;
      line([[checkpoint.x + 10, checkpoint.y], [checkpoint.x + 10, checkpoint.y - 68]], '#9c8962', 4);
      context.beginPath();
      context.moveTo(checkpoint.x + 12, checkpoint.y - 68);
      context.quadraticCurveTo(checkpoint.x + 29, checkpoint.y - 75 + Math.sin(animationTime * 3) * 3, checkpoint.x + 42, checkpoint.y - 63);
      context.lineTo(checkpoint.x + 38, checkpoint.y - 41);
      context.quadraticCurveTo(checkpoint.x + 25, checkpoint.y - 53, checkpoint.x + 12, checkpoint.y - 45);
      context.closePath();
      context.fillStyle = active ? '#e5be6a' : '#f1edcc';
      context.fill();
      drawStar(checkpoint.x + 25, checkpoint.y - 56, 5, active ? '#fff5c9' : '#bcc69a');
      ellipse(checkpoint.x + 10, checkpoint.y - 3, 17, 5, '#9db778');
    });
    world.crates.forEach(crate => {
      if (crate.carrier !== null) return;
      if (art.drawImage(context, 'crate', crate.x - 3, crate.y - 3, crate.w + 6, crate.h + 6)) return;
      roundRectangle(crate.x, crate.y, crate.w, crate.h, 5, '#ceb07c', '#9e855c');
      roundRectangle(crate.x + 6, crate.y + 6, crate.w - 12, crate.h - 12, 2, '#bb9a67', '#dfc18c');
      line([[crate.x + 7, crate.y + 7], [crate.x + 33, crate.y + 33]], '#e0c28f', 5);
      line([[crate.x + 33, crate.y + 7], [crate.x + 7, crate.y + 33]], '#e0c28f', 5);
    });
  }

  function drawExit() {
    const exit = world.level.exit;
    if (art.drawImage(context, 'portal', exit.x - 25, exit.y - 51, 116, 140)) {
      text('下一段冒险', exit.x + 33, exit.y + 108, 11, '#fff3e5');
      drawStar(exit.x + 33, exit.y - 43 + Math.sin(animationTime * 2) * 3, 8, '#fff3ca');
      return;
    }
    ellipse(exit.x + 33, exit.y + 80, 54, 9, '#6e985948');
    roundRectangle(exit.x - 7, exit.y - 10, 80, 94, [38, 38, 6, 6], '#a2b675');
    roundRectangle(exit.x + 1, exit.y - 4, 64, 84, [31, 31, 4, 4], '#ecf1c5');
    const portal = context.createLinearGradient(exit.x, exit.y, exit.x + 66, exit.y + 80);
    portal.addColorStop(0, '#edf6b5');
    portal.addColorStop(1, '#a9d298');
    roundRectangle(exit.x + 8, exit.y + 4, 50, 75, [25, 25, 2, 2], portal);
    ellipse(exit.x + 32, exit.y + 43, 13, 29, '#f7ffd769');
    drawStar(exit.x + 33, exit.y - 28, 12, '#f5e4a0');
    text('下一段冒险', exit.x + 33, exit.y + 108, 11, '#e9f3d3');
    for (let index = 0; index < 4; index += 1) {
      ellipse(exit.x + 13 + index * 12, exit.y + 70 - ((animationTime * 18 + index * 21) % 67), 2, 2, '#fffbdc');
    }
  }

  function drawPlayer(player) {
    if (art.drawPlayer(context, player, animationTime, playerCount)) return;
    if (player.invincible > 0 && Math.floor(animationTime * 14) % 2 === 0) return;
    const walking = player.grounded && Math.abs(player.velocityX) > 20;
    const bounce = walking ? Math.sin(animationTime * 18) * 1.5 : Math.sin(animationTime * 2) * .7;
    const bodyColor = player.id === 0 ? '#d5e998' : '#f0cea0';
    const shadeColor = player.id === 0 ? '#a2bf6e' : '#d3a575';
    context.save();
    context.translate(player.x + player.w / 2, player.y + player.h);
    ellipse(0, 1, 20, 5, '#46704420');
    const step = walking ? Math.sin(animationTime * 18) * 3 : 0;
    ellipse(-8, -2 + step, 7, 4, shadeColor);
    ellipse(8, -2 - step, 7, 4, shadeColor);
    roundRectangle(-16, -37 + bounce, 32, 34, [14, 14, 12, 12], bodyColor, shadeColor);
    ellipse(-16, -17 + bounce + step, 5, 8, bodyColor, -.4);
    ellipse(16, -17 + bounce - step, 5, 8, bodyColor, .4);
    const faceShift = player.facing * 2;
    ellipse(-5 + faceShift, -23 + bounce, 2, 3, '#42593c');
    ellipse(6 + faceShift, -23 + bounce, 2, 3, '#42593c');
    ellipse(-9 + faceShift, -17 + bounce, 3, 1.6, '#e5b391');
    ellipse(10 + faceShift, -17 + bounce, 3, 1.6, '#e5b391');
    context.beginPath();
    context.arc(1 + faceShift, -19 + bounce, 3, .2, Math.PI - .2);
    context.strokeStyle = '#647545';
    context.lineWidth = 1.2;
    context.stroke();
    line([[0, -37 + bounce], [1 + Math.sin(animationTime * 3), -48 + bounce]], '#6b9353', 2.5);
    ellipse(-6, -47 + bounce, 8, 4, '#7fa65e', .5);
    ellipse(6, -50 + bounce, 8, 4, player.id === 0 ? '#98bd69' : '#d6b371', -.5);
    context.restore();
  }

  function drawScene(viewX, viewWidth, camera, playerLabel) {
    context.save();
    context.beginPath();
    context.rect(viewX, 0, viewWidth, 540);
    context.clip();
    context.translate(viewX, 0);
    drawBackground(camera, viewWidth);
    context.save();
    context.translate(-camera, 0);
    drawDecorations();
    world.terrain.forEach(drawTerrain);
    world.platforms.forEach(platform => drawPlatform(platform));
    world.movingPlatforms.forEach(platform => drawPlatform(platform, true));
    drawMechanisms();
    drawExit();
    world.level.signs.forEach(sign => {
      roundRectangle(sign.x - 70, sign.y - 24, 140, 29, 8, '#f5f5d4ce');
      text(sign.text, sign.x, sign.y - 5, 11, '#849563');
    });
    world.gems.forEach((gem, index) => {
      if (gem.collected) return;
      const bob = comfort.reduceMotion ? 0 : Math.sin(animationTime * 2.6 + index) * 4;
      ellipse(gem.x, gem.y + bob, 18, 18, '#fff1aa30');
      drawStar(gem.x, gem.y + bob, 11, '#f8dc87');
      drawStar(gem.x - 2, gem.y - 2 + bob, 5, '#fff2b8');
    });
    world.players.forEach(drawPlayer);
    particles.forEach(particle => {
      context.globalAlpha = Math.max(0, particle.life);
      ellipse(particle.x, particle.y, particle.size, particle.size, particle.color);
    });
    context.globalAlpha = 1;
    for (let index = 0; index < (comfort.reduceMotion ? 0 : 18); index += 1) {
      const driftX = (index * 139 + animationTime * 8) % world.level.width;
      ellipse(driftX, 160 + Math.sin(index * 17 + animationTime * .5) * 100 + index % 3 * 65, 2, 1, '#f9f7d1a0', animationTime * .2);
    }
    context.restore();
    if (playerLabel) text(playerLabel, viewWidth / 2, 87, 12, '#64845a');
    context.restore();
  }

  function render() {
    const player = world.players[0];
    const camera = Math.max(0, Math.min(world.level.width - 960, player.x - 960 * .43));
    drawScene(0, 960, camera);
  }

  function syncTouchButtons() {
    touchButtons.forEach(button => {
      const held = actionInput.held.has(button.dataset.touch);
      button.classList.toggle('is-held', held);
      button.setAttribute('aria-pressed', String(held));
    });
  }

  function clearInput() {
    actionInput.clear();
    syncTouchButtons();
    if (world) world.players[0].jumpBuffer = 0;
  }

  function refreshLevelTabs() {
    const unlockedLevel = getUnlockedLevel(completedLevels, LEVELS.length);
    document.querySelectorAll('[data-level]').forEach(button => {
      const index = Number(button.dataset.level);
      button.disabled = index > unlockedLevel;
      button.classList.toggle('locked', button.disabled);
      button.classList.toggle('active', index === currentLevel);
      button.classList.toggle('cleared', Boolean(completedLevels[index]));
      button.setAttribute('aria-pressed', String(index === currentLevel));
      button.setAttribute('aria-disabled', String(button.disabled));
      button.title = button.disabled ? '完成上一关后解锁' : LEVELS[index].name;
    });
  }

  function showOverlay(title, description, buttonLabel, eyebrow = 'TAKE YOUR TIME. KEEP YOUR CURIOSITY.') {
    clearInput();
    document.body.dataset.playing = 'false';
    element('overlay-title').textContent = title;
    element('overlay-description').textContent = description;
    element('play-button').textContent = `${buttonLabel}  →`;
    element('overlay-eyebrow').textContent = eyebrow;
    element('overlay').hidden = false;
  }

  function loadLevel(index, startPlaying = false) {
    if (!Number.isInteger(index) || index < 0 || index > getUnlockedLevel(completedLevels, LEVELS.length)) return;
    currentLevel = index;
    document.querySelector('.settings-menu').open = false;
    world = new GameWorld(index, 1);
    particles.length = 0;
    accumulator = 0;
    toastTime = 0;
    clearInput();
    const level = LEVELS[index];
    status = startPlaying ? 'playing' : 'welcome';
    document.body.dataset.playing = String(startPlaying);
    element('level-name').textContent = level.name;
    element('level-description').textContent = level.description;
    element('location-text').textContent = `0${index + 1} · ${level.name}`;
    element('panel-number').textContent = `0${index + 1} / 03`;
    element('mechanism-description').textContent = level.mechanism;
    element('context-tip').textContent = level.hint;
    element('difficulty-text').textContent = level.difficulty;
    element('world-caption').textContent = '跟着风，也跟着自己的好奇心。';
    element('bottom-tip').textContent = '左手移动 · 右手跳跃 · 靠近机关点交互';
    document.querySelectorAll('#difficulty-dots i').forEach((dot, dotIndex) => dot.classList.toggle('filled', dotIndex <= index));
    refreshLevelTabs();
    element('overlay').hidden = startPlaying;
    element('pause-button').textContent = 'Ⅱ';
    element('pause-button').setAttribute('aria-label', '暂停游戏');
    if (!startPlaying) showOverlay('森林正在等你。', '左手按住方向，右手轻点跳跃。\n松开跳跃可以跳低一点，靠近机关点交互。', '开始探险', 'WELCOME TO GREENLEAF ISLAND');
    updateHud();
    cozyAudio.setPaused(!startPlaying);
    if (startPlaying) { canvas.focus({ preventScroll: true }); enableAudio(); }
  }

  function pauseGame() {
    if (status !== 'playing' && status !== 'paused') return;
    clearInput();
    if (status === 'playing') {
      status = 'paused';
      cozyAudio.setPaused(true);
      showOverlay('在树荫下歇一会。', '风还在吹，森林也不会离开。\n准备好了，就继续向前。', '继续探险');
      element('pause-button').textContent = '▷';
      element('pause-button').setAttribute('aria-label', '继续游戏');
    } else startGame();
  }

  function startGame() {
    document.querySelector('.settings-menu').open = false;
    if (document.body.dataset.orientationBlocked === 'true') return;
    document.body.dataset.playing = 'true';
    if (status === 'complete') {
      loadLevel((currentLevel + 1) % LEVELS.length, true);
      return;
    }
    status = 'playing';
    accumulator = 0;
    clearInput();
    element('overlay').hidden = true;
    element('pause-button').textContent = 'Ⅱ';
    element('pause-button').setAttribute('aria-label', '暂停游戏');
    canvas.focus({ preventScroll: true });
    enableAudio();
  }

  function enableAudio() {
    cozyAudio.setPaused(false);
    cozyAudio.unlock().then(updateSoundButton);
  }

  function playSound(type) {
    cozyAudio.effect(type);
  }

  function updateSoundButton() {
    const enabled = cozyAudio.enabled;
    element('sound-button').setAttribute('aria-pressed', String(enabled));
    element('sound-button').setAttribute('aria-label', enabled ? '关闭全部声音' : '开启音乐与音效');
    element('sound-button').title = enabled ? '关闭全部声音' : '开启音乐与音效';
    element('sound-button').querySelector('.sound-slash').hidden = enabled;
    element('audio-status').textContent = !audioAvailable
      ? '音乐模块暂时未加载，仍可安静游玩；请刷新页面后再试。'
      : !enabled ? '声音已关闭，安静地走走也很好。' : cozyAudio.musicFailed ? '背景音乐加载失败，已使用合成旋律；动作音效仍可用。' : cozyAudio.musicBuffer ? 'Carefree · 音乐已就绪，暂停时停止，继续时接续播放。' : '开始后加载背景音乐，跳跃与交互音效即时响应。';
  }

  function saveComfort() {
    try { localStorage.setItem('sprout-mobile-comfort-v1', JSON.stringify({ ...comfort, ...cozyAudio.volumes, enabled: cozyAudio.enabled })); }
    catch { element('audio-status').textContent = '设置已应用，本机无法保存，下次打开需重新设置。'; }
  }

  function showToast(message) {
    element('bottom-tip').textContent = message;
    toastTime = 4;
  }

  function processEvents() {
    world.events.splice(0).forEach(event => {
      playSound(event.type);
      if (event.type === 'land' && !comfort.reduceMotion) {
        for (let index = 0; index < 6; index += 1) particles.push({ x: event.x, y: event.y - 2, velocityX: (index - 2.5) * 15, velocityY: -15 - Math.random() * 15, size: 2, life: .5, color: '#f7e6db' });
      }
      if (event.type === 'gem' && !comfort.reduceMotion) {
        for (let index = 0; index < 14; index += 1) particles.push({ x: event.x, y: event.y, velocityX: (Math.random() - .5) * 130, velocityY: -Math.random() * 100, size: 2 + Math.random() * 2, life: 1, color: '#fff0ad' });
      }
      if ((event.type === 'jump' || event.type === 'spring') && !comfort.reduceMotion) {
        const player = world.players[0];
        for (let index = 0; index < 9; index += 1) particles.push({ x: player.x + player.w / 2, y: player.y + player.h, velocityX: (index - 4) * 15, velocityY: 8 + Math.random() * 20, size: 2 + Math.random() * 2, life: .6, color: '#fff7df' });
      }
      if (event.type === 'checkpoint') showToast('营地点亮了！跌落后会从这里重新出发。');
      if (event.type === 'respawn') showToast('没关系，再试一次。这一次一定会走得更远。');
      if (event.type === 'hint') showToast(event.text);
      if (event.type === 'complete') {
        status = 'complete';
        clearInput();
        const storageKey = String(currentLevel);
        const previousBest = completedLevels[storageKey];
        completedLevels[storageKey] = { gems: Math.max(previousBest?.gems || 0, world.collected), time: Math.min(previousBest?.time || Infinity, world.time) };
        if (storageAvailable) {
          try { localStorage.setItem('sprout-mobile-progress-v1', JSON.stringify(completedLevels)); }
          catch { storageAvailable = false; element('save-status').textContent = '存档未能写入，不影响当前游玩'; }
        }
        const lastLevel = currentLevel === LEVELS.length - 1;
        showOverlay(lastLevel ? '小小芽，也能走很远。' : '又走远了一点。', `收集星光 ${world.collected} / ${world.gems.length} · 用时 ${formatTime(world.time)}\n勇敢重来 ${world.deaths} 次\n${lastLevel ? '三段旅程全部完成，可以回头收集遗漏的星光。' : '下一关已经解锁，继续你的森林旅程。'}`, lastLevel ? '再走一遍' : '前往下一关', 'A LITTLE COURAGE GOES A LONG WAY');
        refreshLevelTabs();
      }
    });
  }

  function formatTime(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }

  function updateHud() {
    element('gem-count').textContent = `${world.collected} / ${world.gems.length}`;
    element('timer').textContent = formatTime(world.time);
    [['checkpoint', world.checkpointIndex >= 0], ['mechanism', world.mechanismUsed], ['gems', world.collected === world.gems.length]].forEach(([objective, complete]) => {
      const item = element(`objective-${objective}`);
      item.classList.toggle('complete', complete);
      item.querySelector('.objective-state').textContent = complete ? '✓' : '○';
    });
    const player = world.players[0];
    const canInteract = player.carrying !== null || world.level.levers.some(lever => Math.abs(lever.x - player.x) < 66 && Math.abs(lever.y - player.y) < 75) || world.crates.some(crate => crate.carrier === null && Math.abs(crate.x - player.x) < 70 && Math.abs(crate.y - player.y) < 65);
    document.querySelector('[data-touch="interact"]').classList.toggle('is-near', canInteract && status === 'playing');
  }

  function getInputs() {
    return actionInput.consume();
  }

  function animate(timestamp) {
    const deltaTime = previousTime ? Math.min((timestamp - previousTime) / 1000, .1) : 0;
    previousTime = timestamp;
    if (status !== 'paused' && !document.hidden) animationTime += deltaTime;
    const skyName = art.updateSky(status === 'paused' || document.hidden ? 0 : deltaTime, comfort.sky, comfort.reduceMotion);
    element('sky-label').textContent = `${skyName} · ${comfort.reduceMotion ? '装饰静止' : comfort.sky === 'auto' ? '天空约五分钟循环' : '留住这一刻'}`;
    element('timer').hidden = comfort.hideTimer;
    element('timer').previousElementSibling.hidden = comfort.hideTimer;
    document.querySelector('.timer-divider').hidden = comfort.hideTimer;
    cozyAudio.tick();
    if (status === 'playing') {
      accumulator += deltaTime;
      while (accumulator >= 1 / 120 && status === 'playing') {
        world.step(1 / 120, getInputs());
        accumulator -= 1 / 120;
        processEvents();
      }
      if (toastTime > 0) {
        toastTime -= deltaTime;
        if (toastTime <= 0) element('bottom-tip').textContent = '掉下去也没关系，小芽总会重新长大。';
      }
    }
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.x += particle.velocityX * deltaTime;
      particle.y += particle.velocityY * deltaTime;
      particle.velocityY += 90 * deltaTime;
      particle.life -= deltaTime * 1.5;
      if (particle.life <= 0) particles.splice(index, 1);
    }
    render();
    hudElapsed += deltaTime;
    if (hudElapsed >= .1) { updateHud(); hudElapsed = 0; }
    requestAnimationFrame(animate);
  }

  const keyboardActions = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'jump', ArrowUp: 'jump', KeyE: 'interact', Enter: 'interact' };
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) pauseGame(); return; }
    if (event.code === 'KeyR' && document.activeElement === canvas) { event.preventDefault(); if (!event.repeat) loadLevel(currentLevel, true); return; }
    if (status !== 'playing' || document.activeElement !== canvas || !keyboardActions[event.code]) return;
    event.preventDefault();
    if (!event.repeat) actionInput.press(`keyboard:${event.code}`, keyboardActions[event.code]);
    syncTouchButtons();
  });
  window.addEventListener('keyup', event => {
    actionInput.release(`keyboard:${event.code}`);
    syncTouchButtons();
  });
  function leavePage() {
    clearInput();
    if (status === 'playing') pauseGame();
    cozyAudio.setPaused(true);
  }
  window.addEventListener('blur', leavePage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) leavePage(); });
  canvas.addEventListener('blur', clearInput);
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
  element('play-button').addEventListener('click', startGame);
  element('pause-button').addEventListener('click', pauseGame);
  ['restart-button', 'sidebar-restart'].forEach(identifier => element(identifier).addEventListener('click', () => loadLevel(currentLevel, true)));
  element('sound-button').addEventListener('click', () => {
    cozyAudio.setEnabled(!cozyAudio.enabled);
    if (cozyAudio.enabled && status !== 'paused') enableAudio();
    updateSoundButton();
    saveComfort();
    if (status === 'playing') canvas.focus({ preventScroll: true });
  });
  for (const category of ['music', 'effects', 'nature']) {
    const slider = element(`${category}-volume`);
    slider.value = Math.round(cozyAudio.volumes[category] * 100);
    element(`${category}-output`).textContent = `${slider.value}%`;
    slider.addEventListener('input', () => {
      cozyAudio.setVolume(category, Number(slider.value) / 100);
      element(`${category}-output`).textContent = `${slider.value}%`;
      saveComfort();
    });
  }
  element('sky-mode').value = comfort.sky;
  element('sky-mode').addEventListener('change', event => { comfort.sky = event.target.value; saveComfort(); });
  for (const [identifier, setting] of [['reduce-motion', 'reduceMotion'], ['hide-timer', 'hideTimer']]) {
    element(identifier).checked = comfort[setting];
    element(identifier).addEventListener('change', event => { comfort[setting] = event.target.checked; saveComfort(); });
  }
  cozyAudio.onMusicStatus = updateSoundButton;
  cozyAudio.onError = () => {
    updateSoundButton();
    showToast('浏览器暂时无法播放声音，可点击音符重试；不影响游戏。');
  };
  updateSoundButton();
  document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => loadLevel(Number(button.dataset.level), true)));
  touchButtons.forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (status !== 'playing') return;
      canvas.focus({ preventScroll: true });
      try { button.setPointerCapture(event.pointerId); } catch { /* Window release handlers also cover browsers without capture. */ }
      actionInput.press(`pointer:${event.pointerId}`, button.dataset.touch);
      syncTouchButtons();
    });
    button.addEventListener('lostpointercapture', releasePointer);
  });
  function releasePointer(event) {
    actionInput.release(`pointer:${event.pointerId}`);
    syncTouchButtons();
  }
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  window.addEventListener('gameviewportchange', leavePage);
  document.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('dragstart', event => event.preventDefault());
  document.querySelector('.settings-menu').addEventListener('toggle', event => {
    if (event.target.open) { clearInput(); if (status === 'playing') pauseGame(); }
  });

  art.ready.then(results => {
    if (results.some(loaded => !loaded)) showToast('部分绘本素材加载失败，请刷新页面或重启本地服务。');
  });
  loadLevel(0);
  requestAnimationFrame(animate);
})();
