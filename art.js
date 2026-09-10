(() => {
  'use strict';

  const images = new Map();
  const names = ['cottage', 'flowers', 'ground', 'crate', 'portal', 'friend-0', 'friend-1'];
  for (let theme = 0; theme < 3; theme += 1) names.push(`sky-${theme}`, `hills-${theme}`, `tree-${theme}`);
  const ready = Promise.all(names.map(name => new Promise(resolve => {
    const image = new Image();
    image.onload = () => { images.set(name, image); resolve(true); };
    image.onerror = () => resolve(false);
    image.src = `assets/${name}.png`;
  })));
  const motionStates = ['idle', 'walk', 'rise', 'fall', 'land', 'carry_idle', 'carry_walk'];

  function drawImage(context, name, ...coordinates) {
    const image = images.get(name);
    if (!image) return false;
    context.drawImage(image, ...coordinates);
    return true;
  }

  let skyTime = 0;
  let skyMode = 'auto';
  let reducedMotion = false;
  const skyPalettes = [
    { name: '晨光', top: '#f1dce3', bottom: '#fbefd9', night: 0 },
    { name: '晴午', top: '#d8e9eb', bottom: '#f8f2db', night: 0 },
    { name: '晚霞', top: '#dac9e3', bottom: '#f7d6c5', night: 0 },
    { name: '月夜', top: '#777da8', bottom: '#d9cfe4', night: 1 }
  ];

  function blendColor(first, second, amount) {
    const channels = [1, 3, 5].map(offset => {
      const start = parseInt(first.slice(offset, offset + 2), 16);
      const end = parseInt(second.slice(offset, offset + 2), 16);
      return Math.round(start + (end - start) * amount);
    });
    return `rgb(${channels.join(',')})`;
  }

  function skyState() {
    const position = skyMode === 'auto' ? (skyTime / 75) % 4 : Number(skyMode);
    const index = Math.floor(position);
    const fraction = position - index;
    const blend = fraction * fraction * (3 - 2 * fraction);
    const current = skyPalettes[index];
    const next = skyPalettes[(index + 1) % 4];
    return { top: blendColor(current.top, next.top, blend), bottom: blendColor(current.bottom, next.bottom, blend),
      night: current.night + (next.night - current.night) * blend, name: blend > .5 ? next.name : current.name };
  }

  function updateSky(deltaTime, mode, reduce) {
    skyMode = mode;
    reducedMotion = reduce;
    if (!reduce) skyTime += deltaTime;
    return skyState().name;
  }

  function drawCastleBackground(context, camera, width) {
    const gradient = context.createLinearGradient(0, 0, 0, 540);
    gradient.addColorStop(0, '#11192f');
    gradient.addColorStop(.6, '#39436c');
    gradient.addColorStop(1, '#738198');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, 540);
    for (let index = 0; index < 70; index += 1) {
      const position = ((index * 137 - camera * .06) % 1100 + 1100) % 1100;
      context.fillStyle = index % 3 ? '#c3d7ed88' : '#fff0ce';
      context.fillRect(position, 20 + index * 47 % 220, 1.5, 1.5);
    }
    const moonX = 740 - camera * .035;
    const halo = context.createRadialGradient(moonX, 98, 15, moonX, 98, 145);
    halo.addColorStop(0, '#d2deff55');
    halo.addColorStop(1, '#d2deff00');
    context.fillStyle = halo;
    context.fillRect(moonX - 145, 0, 290, 250);
    context.fillStyle = '#f3ebd5';
    context.beginPath(); context.arc(moonX, 98, 38, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#c5c8d03b';
    for (const [offsetX, offsetY, radius] of [[-14, -9, 8], [13, 15, 10], [15, -17, 5]]) {
      context.beginPath(); context.arc(moonX + offsetX, 98 + offsetY, radius, 0, Math.PI * 2); context.fill();
    }
    for (let layer = 0; layer < 2; layer += 1) {
      const parallax = layer === 0 ? .16 : .32;
      for (let index = -1; index < 9; index += 1) {
        const towerX = index * 260 - (camera * parallax % 260);
        const towerTop = 220 + (index + 9) % 3 * 34 - layer * 15;
        context.fillStyle = layer === 0 ? '#293351' : '#202b46';
        context.fillRect(towerX, towerTop, 100, 320);
        context.fillRect(towerX + 100, towerTop + 95, 160, 225);
        context.beginPath(); context.moveTo(towerX - 14, towerTop); context.lineTo(towerX + 50, towerTop - 72); context.lineTo(towerX + 114, towerTop); context.fill();
        for (let merlon = 0; merlon < 4; merlon += 1) context.fillRect(towerX + 110 + merlon * 40, towerTop + 81, 20, 18);
        context.fillStyle = layer === 0 ? '#f6cb7830' : '#f6cb7888';
        for (let row = 0; row < 3; row += 1) {
          context.beginPath(); context.roundRect(towerX + 38, towerTop + 25 + row * 65, 20, 34, [10, 10, 0, 0]); context.fill();
        }
      }
    }
    context.fillStyle = '#b7c8e512';
    for (let index = 0; index < 4; index += 1) {
      context.beginPath(); context.ellipse(index * 310 - camera * .04 % 310, 408 + index % 2 * 24, 250, 22, 0, 0, Math.PI * 2); context.fill();
    }
    return true;
  }

  const SCENIC_DURATION = 10;
  const meteorShow = [
    { delay: .7, startX: 100, startY: 8, distance: 530, fall: 205, duration: 1.7, tail: 160 },
    { delay: 1.5, startX: 380, startY: -30, distance: 450, fall: 230, duration: 1.5, tail: 125 },
    { delay: 2.3, startX: -80, startY: 40, distance: 680, fall: 190, duration: 2.2, tail: 210 },
    { delay: 3.2, startX: 580, startY: -20, distance: 400, fall: 195, duration: 1.6, tail: 100 },
    { delay: 4.1, startX: 180, startY: -30, distance: 620, fall: 240, duration: 2.1, tail: 185 },
    { delay: 5.2, startX: 460, startY: 5, distance: 500, fall: 220, duration: 1.8, tail: 140 }
  ];
  const constellation = [[305, 160], [342, 116], [389, 142], [430, 93], [478, 119], [520, 74], [559, 108]];

  function drawGlow(context, positionX, positionY, radius, color) {
    const gradient = context.createRadialGradient(positionX, positionY, 0, positionX, positionY, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, '#a4dfff00');
    context.fillStyle = gradient;
    context.fillRect(positionX - radius, positionY - radius, radius * 2, radius * 2);
  }

  function drawScenicSky(context, elapsed, reduceMotion) {
    if (elapsed < 0 || elapsed >= SCENIC_DURATION) return;
    const envelope = Math.min(1, elapsed / 1.2, (SCENIC_DURATION - elapsed) / 1.8);
    context.save();
    context.globalAlpha = envelope;
    context.globalCompositeOperation = 'screen';
    // Wide, translucent ribbons stay in the sky rather than masking playable terrain.
    for (let ribbon = 0; ribbon < 3; ribbon += 1) {
      const gradient = context.createLinearGradient(0, 35, 0, 230);
      gradient.addColorStop(0, '#90b4ff00');
      gradient.addColorStop(.5, ribbon % 2 ? '#b798f51c' : '#79dfd822');
      gradient.addColorStop(1, '#b1ceff00');
      context.beginPath();
      for (let position = -20; position <= 980; position += 20) {
        const height = 80 + ribbon * 29 + Math.sin(position * .007 + ribbon + (reduceMotion ? 0 : elapsed * .22)) * 26;
        if (position === -20) context.moveTo(position, height);
        else context.lineTo(position, height);
      }
      context.lineTo(980, 230); context.lineTo(-20, 230); context.closePath();
      context.fillStyle = gradient; context.fill();
    }
    if (!reduceMotion) {
      for (const meteor of meteorShow) {
        const progress = (elapsed - meteor.delay) / meteor.duration;
        if (progress <= 0 || progress >= 1) continue;
        const brightness = Math.min(1, progress * 8, (1 - progress) * 5) * envelope;
        const headX = meteor.startX + meteor.distance * progress;
        const headY = meteor.startY + meteor.fall * progress;
        const tailLength = meteor.tail * Math.min(1, progress * 5);
        const tailX = headX - tailLength;
        const tailY = headY - tailLength * meteor.fall / meteor.distance;
        const trail = context.createLinearGradient(tailX, tailY, headX, headY);
        trail.addColorStop(0, '#9fb5ff00');
        trail.addColorStop(.5, '#95bbff35');
        trail.addColorStop(.88, '#c2e6ffb0');
        trail.addColorStop(1, '#fff4df');
        context.globalAlpha = brightness;
        context.beginPath(); context.moveTo(tailX, tailY);
        context.lineTo(headX, headY - 2); context.lineTo(headX + 3, headY);
        context.lineTo(headX, headY + 2); context.closePath();
        context.fillStyle = trail; context.fill();
        context.beginPath(); context.moveTo(tailX, tailY); context.lineTo(headX, headY);
        context.strokeStyle = trail; context.lineWidth = .8; context.stroke();
        drawGlow(context, headX, headY, 17, '#badfff99');
        context.fillStyle = '#fff9ea'; context.beginPath(); context.arc(headX, headY, 1.8, 0, Math.PI * 2); context.fill();
        for (let spark = 1; spark <= 9; spark += 1) {
          const lag = spark * 10;
          const sparkX = headX - lag;
          const sparkY = headY - lag * meteor.fall / meteor.distance + Math.sin(spark * 3.7 + elapsed * 2) * spark * .65;
          context.globalAlpha = brightness * (1 - spark / 10) * .65;
          context.fillRect(sparkX, sparkY, spark % 3 ? 1 : 2, 1.4);
        }
      }
    }
    const reveal = reduceMotion ? 7 : Math.max(0, (elapsed - 3) * 2);
    constellation.forEach(([positionX, positionY], index) => {
      const visibility = Math.min(1, Math.max(0, reveal - index));
      context.globalAlpha = envelope * visibility;
      if (index > 0) {
        const [previousX, previousY] = constellation[index - 1];
        context.beginPath(); context.moveTo(previousX, previousY);
        context.lineTo(previousX + (positionX - previousX) * visibility, previousY + (positionY - previousY) * visibility);
        context.strokeStyle = '#c1dcff99'; context.lineWidth = .8; context.stroke();
      }
      drawGlow(context, positionX, positionY, 13, '#b9dcff80');
      context.strokeStyle = '#fff2cd'; context.lineWidth = 1.2;
      context.beginPath(); context.moveTo(positionX - 4, positionY); context.lineTo(positionX + 4, positionY);
      context.moveTo(positionX, positionY - 4); context.lineTo(positionX, positionY + 4); context.stroke();
    });
    context.restore();
  }

  function drawScenicTerrace(context, spot, elapsed, reduceMotion) {
    if (elapsed < 0 || elapsed >= SCENIC_DURATION) return;
    const envelope = Math.min(1, elapsed, (SCENIC_DURATION - elapsed) / 2);
    context.save();
    context.globalCompositeOperation = 'screen';
    context.globalAlpha = envelope * .65;
    drawGlow(context, spot.x, spot.y - 40, 130, '#a9bfff45');
    for (let ring = 0; ring < 3; ring += 1) {
      const expansion = reduceMotion ? .4 + ring * .18 : (elapsed * .22 + ring / 3) % 1;
      context.globalAlpha = envelope * (1 - expansion) * .5;
      context.beginPath(); context.ellipse(spot.x, spot.y - 2, 30 + expansion * 100, 6 + expansion * 13, 0, 0, Math.PI * 2);
      context.strokeStyle = '#b5dcff'; context.lineWidth = 1; context.stroke();
    }
    for (let mote = 0; mote < 24; mote += 1) {
      const rise = reduceMotion ? mote / 24 : (elapsed * .13 + mote * .618) % 1;
      const positionX = spot.x + Math.sin(mote * 9.3 + (reduceMotion ? 0 : elapsed * .4)) * (45 + mote * 2);
      const positionY = spot.y - 10 - rise * 150;
      context.globalAlpha = envelope * Math.sin(rise * Math.PI) * .8;
      drawGlow(context, positionX, positionY, 7, mote % 2 ? '#ffe6a677' : '#b7eaff77');
      context.fillStyle = '#fff1c9'; context.fillRect(positionX, positionY, 1.5, 1.5);
    }
    context.restore();
  }

  function drawCastleStone(context, stone) {
    context.save();
    context.beginPath(); context.roundRect(stone.x, stone.y, stone.w, stone.h, 4); context.clip();
    context.fillStyle = '#424b65'; context.fillRect(stone.x, stone.y, stone.w, stone.h);
    context.strokeStyle = '#252f49'; context.lineWidth = 2;
    for (let row = 0; row < stone.h / 25; row += 1) {
      for (let column = -1; column < stone.w / 55; column += 1) {
        context.strokeRect(stone.x + column * 55 + row % 2 * 27, stone.y + row * 25, 55, 25);
      }
    }
    context.fillStyle = '#b4c5d6'; context.fillRect(stone.x, stone.y, stone.w, 5);
    context.fillStyle = '#859eac'; context.fillRect(stone.x, stone.y + 5, stone.w, 4);
    context.restore();
  }

  function drawBackground(context, camera, width, theme) {
    if (theme === 3) return drawCastleBackground(context, camera, width);
    if (!images.has(`sky-${theme}`) || !images.has(`hills-${theme}`)) return false;
    const state = skyState();
    const gradient = context.createLinearGradient(0, 0, 0, 540);
    gradient.addColorStop(0, state.top);
    gradient.addColorStop(1, state.bottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, 540);
    context.save();
    // Python's painted sky supplies paper texture beneath the slowly changing light.
    context.globalAlpha = .18;
    drawImage(context, `sky-${theme}`, -camera * .08, 0, 1280, 540);
    context.globalAlpha = 1;
    const celestialX = 927 - camera * .08;
    context.fillStyle = '#fff5dc';
    context.beginPath();
    context.arc(celestialX, 100, 32, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = state.night * .7;
    for (let index = 0; index < 35; index += 1) {
      const positionX = ((index * 137 + 31) % 1250) - camera * .1;
      const positionY = 28 + (index * 73) % 225;
      const radius = reducedMotion ? 1.3 : 1.3 + Math.sin(skyTime * .6 + index) * .3;
      context.beginPath();
      context.arc(positionX, positionY, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = .55;
    for (let index = 0; index < 5; index += 1) {
      const cloudX = ((index * 340 + skyTime * 2) % 1700) - 180 - camera * .12;
      const cloudY = 125 + index % 3 * 38;
      for (const [offsetX, offsetY, radius] of [[-24, 0, 25], [0, -10, 34], [30, 0, 26]]) {
        context.beginPath();
        context.ellipse(cloudX + offsetX, cloudY + offsetY, radius, radius * .45, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
    const offset = -(camera * .28) % 1280;
    drawImage(context, `hills-${theme}`, offset, 0);
    drawImage(context, `hills-${theme}`, offset + 1280, 0);
    return true;
  }

  function drawTree(context, position, ground, scale, theme) {
    return drawImage(context, `tree-${theme}`, position - 120 * scale, ground - 295 * scale, 240 * scale, 300 * scale);
  }

  function drawTerrain(context, terrain) {
    const image = images.get('ground');
    if (!image) return false;
    context.save();
    context.beginPath();
    context.roundRect(terrain.x, terrain.y, terrain.w, terrain.h, 5);
    context.clip();
    for (let offset = 0; offset < terrain.w; offset += 128) {
      context.drawImage(image, terrain.x + offset, terrain.y);
    }
    context.restore();
    return true;
  }

  function drawPlayer(context, player, animationTime, playerCount) {
    const atlas = images.get(`friend-${player.id}`);
    if (!atlas) return false;
    if (!reducedMotion && player.invincible > 0 && Math.floor(animationTime * 14) % 2 === 0) return true;
    const carrying = player.carrying !== null;
    let state = 'idle';
    if (carrying) state = player.grounded && Math.abs(player.velocityX) > 12 ? 'carry_walk' : 'carry_idle';
    else if (!player.grounded) state = player.velocityY < 0 ? 'rise' : 'fall';
    else if (player.landingTime > 0) state = 'land';
    else if (Math.abs(player.velocityX) > 12) state = 'walk';
    const walking = state === 'walk' || state === 'carry_walk';
    // Distance, rather than wall-clock time, drives steps so feet stop when blocked.
    const frame = walking ? Math.floor(player.walkDistance / 6) % 8 : Math.floor(animationTime * 2.5) % 8;
    const landingAmount = Math.sin(Math.min(1, player.landingTime / .16) * Math.PI) * .12;
    const airborneStretch = !player.grounded && !carrying ? Math.min(.07, Math.abs(player.velocityY) / 10000) : 0;
    const scaleX = 1 + landingAmount - airborneStretch * .5;
    const scaleY = 1 - landingAmount + airborneStretch;
    const feetX = player.x + player.w / 2;
    const feetY = player.y + player.h;
    context.save();
    context.fillStyle = '#87728a22';
    context.beginPath();
    context.ellipse(feetX, feetY, 19, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.translate(feetX, feetY);
    context.scale(player.facing * scaleX, scaleY);
    context.drawImage(atlas, frame * 96, motionStates.indexOf(state) * 96, 96, 96, -34, -59.5, 68, 68);
    if (carrying) {
      // The carried box is decorative until dropped, and is anchored to the raised hands.
      drawImage(context, 'crate', -21, -87, 42, 42);
    }
    context.restore();
    if (playerCount === 2) {
      context.font = '600 10px "Microsoft YaHei", sans-serif';
      context.textAlign = 'center';
      context.fillStyle = player.id === 0 ? '#7d8c68' : '#9b7e9e';
      context.fillText(player.id === 0 ? '1P 奶油兔' : '2P 绒绒熊', feetX, feetY - (carrying ? 82 : 67));
    }
    return true;
  }

  window.StorybookArt = { ready, updateSky, drawImage, drawBackground, drawTree, drawTerrain, drawPlayer, drawCastleStone, drawScenicSky, drawScenicTerrace, SCENIC_DURATION, meteorShow };
})();
