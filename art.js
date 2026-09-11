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

  function drawPalaceBackground(context, camera, width) {
    const water = context.createLinearGradient(0, 0, 0, 540);
    water.addColorStop(0, '#176782'); water.addColorStop(.45, '#12465f'); water.addColorStop(1, '#081e3b');
    context.fillStyle = water; context.fillRect(0, 0, width, 540);
    for (let beam = 0; beam < 6; beam += 1) {
      const position = beam * 205 - camera * .04 % 205;
      const light = context.createLinearGradient(0, 0, 0, 430);
      light.addColorStop(0, '#9ff2e92b'); light.addColorStop(1, '#98deff00');
      context.fillStyle = light;
      context.beginPath(); context.moveTo(position, 0); context.lineTo(position + 40, 0);
      context.lineTo(position + 175, 430); context.lineTo(position + 80, 430); context.fill();
    }
    for (let layer = 0; layer < 2; layer += 1) {
      const offset = camera * (.13 + layer * .13) % 340;
      for (let column = -1; column < 5; column += 1) {
        const position = column * 340 - offset;
        const roof = 170 + layer * 80;
        context.fillStyle = layer ? '#23566c' : '#1c4b64';
        context.beginPath(); context.ellipse(position + 140, roof, 112, 70, 0, Math.PI, Math.PI * 2); context.fill();
        context.fillRect(position + 28, roof, 224, 360);
        context.strokeStyle = layer ? '#61909b55' : '#46869844'; context.lineWidth = 3;
        context.strokeRect(position + 28, roof, 224, 300);
        for (let arch = 0; arch < 3; arch += 1) {
          const archX = position + 48 + arch * 65;
          context.fillStyle = '#0b304b'; context.beginPath(); context.roundRect(archX, roof + 25, 45, 220, [22, 22, 0, 0]); context.fill();
          context.fillStyle = '#79c6bc44'; context.fillRect(archX - 8, roof + 20, 6, 235);
          context.fillStyle = '#d8ca9866'; context.fillRect(archX - 12, roof + 15, 14, 5);
        }
        drawGlow(context, position + 140, roof - 5, 25, '#a4ffeb33');
      }
    }
    for (let fish = 0; fish < 18; fish += 1) {
      const positionX = ((fish * 97 + skyTime * 9 - camera * .18) % 1100 + 1100) % 1100;
      const positionY = 120 + fish % 4 * 38 + Math.sin(fish * 2 + skyTime * .5) * 5;
      context.fillStyle = '#a3dbd72b'; context.beginPath(); context.ellipse(positionX, positionY, 7, 3, 0, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.moveTo(positionX - 5, positionY); context.lineTo(positionX - 11, positionY - 4); context.lineTo(positionX - 11, positionY + 4); context.fill();
    }
    for (let bubble = 0; bubble < 32; bubble += 1) {
      const positionX = ((bubble * 137 - camera * .3) % 1020 + 1020) % 1020;
      const positionY = 540 - (bubble * 67 + skyTime * (8 + bubble % 4)) % 560;
      context.strokeStyle = '#b5f5ee35'; context.lineWidth = .8;
      context.beginPath(); context.arc(positionX, positionY, 2 + bubble % 4, 0, Math.PI * 2); context.stroke();
    }
    return true;
  }

  function drawPalaceStone(context, stone) {
    context.save();
    context.beginPath(); context.roundRect(stone.x, stone.y, stone.w, stone.h, 5); context.clip();
    context.fillStyle = '#38777f'; context.fillRect(stone.x, stone.y, stone.w, stone.h);
    context.strokeStyle = '#205263'; context.lineWidth = 1.5;
    for (let row = 0; row < stone.h / 28; row += 1) {
      for (let column = -1; column < stone.w / 64; column += 1) context.strokeRect(stone.x + column * 64 + row % 2 * 32, stone.y + row * 28, 64, 28);
    }
    context.fillStyle = '#bde7da'; context.fillRect(stone.x, stone.y, stone.w, 5);
    context.fillStyle = '#c4b78b'; context.fillRect(stone.x, stone.y + 7, stone.w, 2);
    context.restore();
  }

  function drawWhaleShow(context, elapsed, reduceMotion) {
    if (elapsed < 0 || elapsed >= SCENIC_DURATION) return;
    const envelope = Math.min(1, elapsed / 1.5, (SCENIC_DURATION - elapsed) / 2);
    context.save(); context.globalAlpha = envelope;
    drawGlow(context, 540, 150, 230, '#9effdf33');
    const positionX = reduceMotion ? 545 : 200 + elapsed * 55;
    const positionY = 115 + (reduceMotion ? 0 : Math.sin(elapsed * .5) * 12);
    context.translate(positionX, positionY);
    const skin = context.createLinearGradient(0, -45, 0, 50);
    skin.addColorStop(0, '#479cb6'); skin.addColorStop(.65, '#28627e'); skin.addColorStop(1, '#9bd8d2');
    context.fillStyle = skin; context.strokeStyle = '#b7f1e699'; context.lineWidth = 1.5;
    context.beginPath(); context.moveTo(-115, 0);
    context.bezierCurveTo(-45, -65, 95, -58, 124, -10);
    context.bezierCurveTo(150, 42, 12, 64, -95, 18);
    context.lineTo(-160, 40); context.quadraticCurveTo(-153, 10, -125, 5);
    context.quadraticCurveTo(-162, -7, -153, -40); context.closePath(); context.fill(); context.stroke();
    context.beginPath(); context.moveTo(10, 23); context.quadraticCurveTo(5, 88, -39, 63); context.lineTo(-15, 25); context.fill(); context.stroke();
    context.fillStyle = '#ecfff0'; context.beginPath(); context.arc(96, 2, 2.3, 0, Math.PI * 2); context.fill();
    for (let stripe = 0; stripe < 4; stripe += 1) {
      context.beginPath(); context.moveTo(30, 30 + stripe * 4); context.quadraticCurveTo(70, 42 + stripe * 2, 111, 22); context.strokeStyle = '#c3f5e655'; context.lineWidth = .7; context.stroke();
    }
    context.restore(); context.save(); context.globalCompositeOperation = 'screen';
    for (let pearl = 0; pearl < 30; pearl += 1) {
      const angle = pearl * Math.PI * 2 / 30 + (reduceMotion ? 0 : elapsed * .14);
      const radius = 85 + pearl % 3 * 14;
      const positionX = 470 + Math.cos(angle) * radius * 1.7;
      const positionY = 125 + Math.sin(angle) * radius * .55;
      context.globalAlpha = envelope * .65;
      drawGlow(context, positionX, positionY, 8, '#b0ffe788');
      context.fillStyle = '#eeffdf'; context.fillRect(positionX, positionY, 2, 2);
    }
    context.restore();
  }

  function drawSnowBackground(context, camera, width) {
    context.save();
    const sky = context.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, '#101c38'); sky.addColorStop(.52, '#294762'); sky.addColorStop(1, '#6d8998');
    context.fillStyle = sky; context.fillRect(0, 0, width, 540);
    const span = Math.max(960, width) + 100;
    const motionTime = reducedMotion ? 0 : skyTime;
    for (let star = 0; star < 64; star += 1) {
      const positionX = ((star * 137.7 - camera * .035) % span + span) % span;
      context.fillStyle = star % 5 ? '#d0e6ef88' : '#fff2d5';
      context.fillRect(positionX, 18 + star * 59 % 220, star % 5 ? 1 : 2, 1.5);
    }
    const moonX = width * .78 - camera * .018;
    drawGlow(context, moonX, 80, 105, '#c4e7fa25');
    context.fillStyle = '#e0edf1';
    context.beginPath(); context.arc(moonX, 80, 23, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#a8cbdc55';
    context.beginPath(); context.arc(moonX - 8, 76, 6, 0, Math.PI * 2); context.fill();
    // Fixed-size parallax tiles bound the detail cost independently of level length.
    for (let layer = 0; layer < 3; layer += 1) {
      const tileWidth = 420;
      const offset = camera * (.07 + layer * .075) % tileWidth;
      for (let mountain = -1; mountain < Math.min(12, Math.ceil(width / tileWidth) + 2); mountain += 1) {
        const positionX = mountain * tileWidth - offset;
        const peakY = 125 + layer * 60;
        context.fillStyle = ['#425b77', '#38566e', '#304b5f'][layer];
        context.beginPath(); context.moveTo(positionX - 80, 510);
        context.lineTo(positionX + 135, peakY); context.lineTo(positionX + 218, peakY + 100);
        context.lineTo(positionX + 298, peakY + 55); context.lineTo(positionX + 530, 510); context.closePath(); context.fill();
        context.fillStyle = ['#acc8d8', '#87aebf', '#6893a6'][layer];
        context.beginPath(); context.moveTo(positionX + 135, peakY);
        context.lineTo(positionX + 218, peakY + 100); context.lineTo(positionX + 168, peakY + 78);
        context.lineTo(positionX + 143, peakY + 104); context.lineTo(positionX + 124, peakY + 63);
        context.lineTo(positionX + 73, peakY + 106); context.closePath(); context.fill();
        context.fillStyle = '#162e433b';
        context.beginPath(); context.moveTo(positionX + 135, peakY + 6);
        context.lineTo(positionX + 178, 510); context.lineTo(positionX + 355, 510); context.closePath(); context.fill();
      }
    }
    for (let ruin = -1; ruin < Math.min(9, Math.ceil(width / 340) + 2); ruin += 1) {
      const positionX = ruin * 340 - camera * .28 % 340;
      const roofY = 308 + (ruin + 3) % 2 * 27;
      context.fillStyle = '#3b5c6b'; context.fillRect(positionX, roofY, 130, 220);
      context.fillStyle = '#213d50';
      context.beginPath(); context.roundRect(positionX + 36, roofY + 40, 57, 190, [28, 28, 0, 0]); context.fill();
      context.strokeStyle = '#7396a14d'; context.lineWidth = 2;
      context.strokeRect(positionX + 7, roofY + 10, 116, 195);
      context.fillStyle = '#adcbd4'; context.fillRect(positionX - 5, roofY, 140, 5);
      context.fillStyle = '#628da0';
      for (let icicle = 0; icicle < 7; icicle += 1) {
        const icicleX = positionX + 8 + icicle * 18;
        context.beginPath(); context.moveTo(icicleX, roofY + 5); context.lineTo(icicleX + 4, roofY + 17 + icicle % 3 * 7);
        context.lineTo(icicleX + 8, roofY + 5); context.fill();
      }
      context.fillStyle = '#97dfdb66'; context.fillRect(positionX + 61, roofY + 63, 5, 24);
    }
    for (let pine = -1; pine < Math.min(28, Math.ceil(width / 65) + 2); pine += 1) {
      const positionX = pine * 65 - camera * .39 % 65;
      const height = 63 + (pine + 4) % 4 * 18;
      context.fillStyle = '#254454'; context.fillRect(positionX - 2, 420, 4, 90);
      for (let branch = 0; branch < 3; branch += 1) {
        const branchY = 453 - height + branch * 23;
        const spread = 18 + branch * 9;
        context.fillStyle = '#284957';
        context.beginPath(); context.moveTo(positionX, branchY); context.lineTo(positionX - spread, branchY + 47);
        context.lineTo(positionX + spread, branchY + 47); context.closePath(); context.fill();
        context.fillStyle = '#91b3c080';
        context.beginPath(); context.moveTo(positionX, branchY); context.lineTo(positionX - spread * .7, branchY + 32);
        context.lineTo(positionX + 5, branchY + 23); context.closePath(); context.fill();
      }
    }
    // Snow is background-only; solid platforms retain an uninterrupted bright top edge.
    for (let flake = 0; flake < 48; flake += 1) {
      const positionX = ((flake * 113.7 - camera * .45 + Math.sin(motionTime * .2 + flake) * 12) % span + span) % span - 30;
      const positionY = (flake * 79 + motionTime * (7 + flake % 4)) % 540;
      context.fillStyle = flake % 3 ? '#d7f4ff55' : '#eafaff99';
      context.beginPath(); context.arc(positionX, positionY, flake % 3 ? 1 : 1.7, 0, Math.PI * 2); context.fill();
    }
    context.restore();
    return true;
  }

  function drawSnowStone(context, stone) {
    context.save();
    context.beginPath(); context.roundRect(stone.x, stone.y, stone.w, stone.h, 4); context.clip();
    const ice = context.createLinearGradient(0, stone.y, 0, stone.y + stone.h);
    ice.addColorStop(0, '#78afc3'); ice.addColorStop(.3, '#4e7b95'); ice.addColorStop(1, '#324d69');
    context.fillStyle = ice; context.fillRect(stone.x, stone.y, stone.w, stone.h);
    context.strokeStyle = '#263f5c88'; context.lineWidth = 1.5;
    const rows = Math.min(16, Math.ceil(stone.h / 28));
    const columns = Math.min(80, Math.ceil(stone.w / 64));
    for (let row = 0; row < rows; row += 1) {
      for (let column = -1; column < columns; column += 1) {
        context.strokeRect(stone.x + column * 64 + row % 2 * 32, stone.y + row * 28, 64, 28);
      }
    }
    context.strokeStyle = '#c2eeff66'; context.lineWidth = 1;
    for (let seam = 0; seam < Math.min(32, Math.ceil(stone.w / 47)); seam += 1) {
      const positionX = stone.x + 19 + seam * 47;
      context.beginPath(); context.moveTo(positionX, stone.y + 9); context.lineTo(positionX + 8, stone.y + 19);
      context.lineTo(positionX + 3, stone.y + 33); context.stroke();
    }
    context.fillStyle = '#a5d8e9'; context.fillRect(stone.x, stone.y + 5, stone.w, 6);
    context.fillStyle = '#f0fbff'; context.fillRect(stone.x, stone.y, stone.w, 5);
    context.restore();
    return true;
  }

  function drawAuroraShow(context, elapsed, reduceMotion) {
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= SCENIC_DURATION) return;
    const envelope = Math.min(1, elapsed / 1.5, (SCENIC_DURATION - elapsed) / 2);
    const motionTime = reduceMotion ? 0 : elapsed;
    context.save(); context.globalCompositeOperation = 'screen';
    context.globalAlpha = envelope;
    drawGlow(context, 470, 95, 245, '#6eeccf20');
    for (let ribbon = 0; ribbon < 4; ribbon += 1) {
      const crest = positionX => 64 + ribbon * 29 + Math.sin(positionX * .006 + ribbon * .75 + motionTime * .18) * 30
        + Math.sin(positionX * .013 - motionTime * .12) * 9;
      const colors = ['#70efca', '#8bdff7', '#b6a2f3', '#a2f4df'];
      const curtain = context.createLinearGradient(0, 10, 0, 300);
      curtain.addColorStop(0, `${colors[ribbon]}00`); curtain.addColorStop(.35, `${colors[ribbon]}55`);
      curtain.addColorStop(.75, `${colors[ribbon]}16`); curtain.addColorStop(1, `${colors[ribbon]}00`);
      context.beginPath(); context.moveTo(-30, crest(-30));
      for (let positionX = -10; positionX <= 990; positionX += 20) context.lineTo(positionX, crest(positionX));
      for (let positionX = 990; positionX >= -30; positionX -= 20) context.lineTo(positionX, crest(positionX) + 80 + ribbon * 8);
      context.closePath(); context.fillStyle = curtain; context.fill();
      context.beginPath(); context.moveTo(-30, crest(-30));
      for (let positionX = -10; positionX <= 990; positionX += 20) context.lineTo(positionX, crest(positionX));
      context.strokeStyle = `${colors[ribbon]}88`; context.lineWidth = 1.6; context.stroke();
      context.strokeStyle = `${colors[ribbon]}23`; context.lineWidth = 2;
      for (let fold = 0; fold < 28; fold += 1) {
        const positionX = fold * 36 + ribbon * 7;
        const height = crest(positionX);
        context.beginPath(); context.moveTo(positionX, height + 3);
        context.quadraticCurveTo(positionX - 12, height + 38, positionX - 5, height + 65); context.stroke();
      }
    }
    // Two matching star trails meet above the terrace, echoing the cooperative scene.
    const reveal = reduceMotion ? 1 : Math.max(0, Math.min(1, (elapsed - 3) / 2.5));
    for (let companion = 0; companion < 2; companion += 1) {
      const direction = companion === 0 ? -1 : 1;
      for (let star = 0; star < 6; star += 1) {
        const visibility = Math.min(1, Math.max(0, reveal * 6 - star));
        const positionX = 480 + direction * (190 - star * 38);
        const positionY = 185 - Math.sin(star / 5 * Math.PI) * 40;
        context.globalAlpha = envelope * visibility;
        if (star > 0) {
          context.strokeStyle = companion ? '#d9c0ff99' : '#a3ffe099'; context.lineWidth = .8;
          context.beginPath(); context.moveTo(positionX + direction * 38, 185 - Math.sin((star - 1) / 5 * Math.PI) * 40);
          context.lineTo(positionX, positionY); context.stroke();
        }
        drawGlow(context, positionX, positionY, star === 5 ? 20 : 11, companion ? '#dfbaff66' : '#aaffdf77');
        context.strokeStyle = '#eeffff'; context.lineWidth = 1;
        context.beginPath(); context.moveTo(positionX - 3, positionY); context.lineTo(positionX + 3, positionY);
        context.moveTo(positionX, positionY - 3); context.lineTo(positionX, positionY + 3); context.stroke();
      }
    }
    for (let flake = 0; flake < 32; flake += 1) {
      const positionX = 45 + flake * 131 % 870 + Math.sin(flake + motionTime * .22) * 9;
      const positionY = 20 + (flake * 43 + motionTime * 6) % 275;
      context.globalAlpha = envelope * .45;
      context.fillStyle = flake % 2 ? '#cdfff1' : '#e5dcff';
      context.beginPath(); context.arc(positionX, positionY, flake % 4 ? 1 : 1.8, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  }

  function drawBackground(context, camera, width, theme) {
    if (theme === 5) return drawSnowBackground(context, camera, width);
    if (theme === 4) return drawPalaceBackground(context, camera, width);
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

  window.StorybookArt = { ready, updateSky, drawImage, drawBackground, drawTree, drawTerrain, drawPlayer, drawCastleStone, drawScenicSky, drawScenicTerrace, drawWhaleShow, drawPalaceStone, drawSnowStone, drawAuroraShow, SCENIC_DURATION, meteorShow };
})();
