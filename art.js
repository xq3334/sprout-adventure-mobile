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

  function drawBackground(context, camera, width, theme) {
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

  window.StorybookArt = { ready, updateSky, drawImage, drawBackground, drawTree, drawTerrain, drawPlayer };
})();
