(() => {
  'use strict';

  const element = identifier => document.getElementById(identifier);
  const game = window.SproutGame;
  const simulationStep = 1 / 120;
  const networkInterval = 1 / 20;
  const defaultRelayUrl = 'https://sprout-adventure-rooms.3597327971.workers.dev';
  const emptyInput = () => ({ left: false, right: false, jumpPressed: false, jumpReleased: false, interactPressed: false });
  let client = null;
  let roomConfirmed = false;
  let session = null;
  let members = [];
  let localReady = false;
  let simulationAccumulator = 0;
  let networkAccumulator = 0;
  let sequence = 0;
  let acknowledgedSequence = 0;
  let remoteInput = emptyInput();
  let pendingLocalInput = emptyInput();
  let lastSentInput = emptyInput();
  let remoteQueue = [];
  let pendingInputs = [];
  let eventQueue = [];
  let latestRemoteInputAt = 0;
  let latestStateAt = 0;
  let remoteRenderTarget = null;
  let lastRelayEvents = 0;
  let relayEventSequence = 0;
  let disconnected = false;

  function showStatus(message) {
    element('room-status').textContent = message;
  }

  function openLobby() {
    game.pauseForMenu();
    element('map-book').hidden = true;
    element('coop-lobby').hidden = false;
    element('close-coop-lobby').focus();
  }

  function clearSimulationInput() {
    remoteInput = emptyInput();
    pendingLocalInput = emptyInput();
    lastSentInput = emptyInput();
    remoteQueue = [];
    pendingInputs = [];
    simulationAccumulator = 0;
    networkAccumulator = 0;
    remoteRenderTarget = null;
  }

  function mergeInput(previous, next) {
    return {
      left: Boolean(next.left), right: Boolean(next.right),
      jumpPressed: previous.jumpPressed || Boolean(next.jumpPressed),
      jumpReleased: previous.jumpReleased || Boolean(next.jumpReleased),
      interactPressed: previous.interactPressed || Boolean(next.interactPressed)
    };
  }

  function updateLobby() {
    const connected = Boolean(client?.connected && roomConfirmed);
    element('room-entry').hidden = Boolean(client);
    element('room-controls').hidden = !client;
    element('room-identity').hidden = !roomConfirmed;
    element('active-room-code').textContent = roomConfirmed ? client?.room || '' : '';
    element('room-role').textContent = roomConfirmed ? (client?.role === 'host' ? '你是房主 · 将房间号发给朋友' : '你是伙伴 · 等待房主开始') : '';
    element('create-room').disabled = Boolean(client);
    element('join-room').disabled = Boolean(client);
    element('copy-room-link').disabled = !connected;
    element('ready-room').disabled = !connected || Boolean(session);
    element('room-members').textContent = members.map(member => `${member.slot + 1} 号${member.slot === 0 ? '房主' : '伙伴'} · ${!member.connected ? '离线' : member.ready ? '已准备' : '未准备'}`).join(' / ');
    element('start-room').hidden = client?.role !== 'host';
    element('start-room').disabled = !connected || client.role !== 'host' || members.filter(member => member.connected && member.ready).length !== 2;
    element('start-room').textContent = session ? '重新开始雪境' : '两人准备后开始';
    element('ready-room').textContent = localReady ? '取消准备' : '我准备好了';
  }

  function startSession() {
    if (!client) return;
    session = { slot: client.role === 'host' ? 0 : 1 };
    disconnected = false;
    sequence = 0;
    acknowledgedSequence = 0;
    lastRelayEvents = 0;
    relayEventSequence = 0;
    eventQueue = [];
    clearSimulationInput();
    latestRemoteInputAt = performance.now();
    latestStateAt = performance.now();
    element('coop-lobby').hidden = true;
    game.startCoop(session);
    updateLobby();
  }

  function predictPlayer(world, player, input, deltaTime) {
    const physics = window.SproutEngine.PHYSICS;
    player.coyote = player.grounded ? physics.coyoteTime : Math.max(0, player.coyote - deltaTime);
    player.jumpBuffer = input.jumpPressed ? physics.jumpBuffer : Math.max(0, player.jumpBuffer - deltaTime);
    const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
    const targetVelocity = direction * physics.speed;
    const maximumChange = physics.acceleration * deltaTime;
    player.velocityX += Math.max(-maximumChange, Math.min(maximumChange, targetVelocity - player.velocityX));
    if (direction) player.facing = direction;
    if (player.jumpBuffer > 0 && player.coyote > 0) {
      player.velocityY = -physics.jump;
      player.jumpBuffer = 0;
      player.coyote = 0;
      player.grounded = false;
    }
    if (input.jumpReleased && player.velocityY < -230) player.velocityY = -230;
    player.velocityY = Math.min(player.velocityY + physics.gravity * deltaTime, 950);
    const currentForce = world.currents.reduce((force, current) => force + (window.SproutEngine.overlaps(player, current) ? current.force : 0), 0);
    const previousPosition = player.x;
    world.moveBody(player, (player.velocityX + currentForce) * deltaTime, 'x', world.getSolids());
    player.x = Math.max(0, Math.min(world.level.width - player.w, player.x));
    if (player.grounded) player.walkDistance += Math.abs(player.x - previousPosition);
    player.grounded = false;
    player.standingOn = null;
    world.moveBody(player, player.velocityY * deltaTime, 'y', world.getSolids());
  }

  function applyGuestState(message) {
    if (!session || session.slot !== 1 || !message.snapshot) return;
    const world = game.getWorld();
    const previousPartner = { ...world.players[0] };
    const { relayEvents = [], ...authoritativeSnapshot } = message.snapshot;
    if (!Array.isArray(relayEvents) || !Number.isSafeInteger(message.ack)) return;
    const replayEvents = relayEvents.filter(envelope => Number.isSafeInteger(envelope?.sequence) && envelope.sequence > lastRelayEvents).slice(-64);
    authoritativeSnapshot.events = replayEvents.map(envelope => envelope.event);
    if (!world.applySnapshot(authoritativeSnapshot)) return;
    latestStateAt = performance.now();
    pendingInputs = pendingInputs.filter(entry => entry.sequence > message.ack);
    // Re-run only the local body. Checkpoints, hazards, pickups and mechanisms remain host-owned.
    const localPlayer = world.players[1];
    const savedEvents = world.events;
    world.events = [];
    for (const entry of pendingInputs.slice(-12)) {
      for (let stepIndex = 0; stepIndex < entry.steps; stepIndex += 1) {
        const input = stepIndex === 0 ? entry.input : { left: entry.input.left, right: entry.input.right };
        predictPlayer(world, localPlayer, input, simulationStep);
      }
    }
    world.events = savedEvents;
    remoteRenderTarget = { x: world.players[0].x, y: world.players[0].y };
    if (Math.abs(previousPartner.x - remoteRenderTarget.x) < 180 && Math.abs(previousPartner.y - remoteRenderTarget.y) < 140) {
      world.players[0].x = previousPartner.x;
      world.players[0].y = previousPartner.y;
    }
    for (const envelope of replayEvents) lastRelayEvents = Math.max(lastRelayEvents, envelope.sequence);
    game.processEvents();
  }

  function handleMessage(message) {
    if (message.type === 'welcome') {
      disconnected = false;
      roomConfirmed = true;
      if (client?.role === 'host') element('room-code').value = '';
      showStatus(message.slot === 0 ? '建房成功。你是房主，可以邀请朋友加入。' : '加入成功。你是伙伴，两人准备后由房主开始。');
      updateLobby();
    } else if (message.type === 'lobby') {
      members = message.players;
      if (client?.connected && members.filter(member => member.connected).length === 2) disconnected = false;
      localReady = Boolean(members.find(member => member.slot === (client?.role === 'host' ? 0 : 1))?.ready);
      updateLobby();
    } else if (message.type === 'started' || message.type === 'restarted') {
      startSession();
    } else if (message.type === 'input' && session?.slot === 0) {
      if (!client || !game.isPlaying()) return;
      if (message.sequence <= acknowledgedSequence || remoteQueue.some(entry => entry.sequence === message.sequence)) return;
      if (remoteQueue.length >= 40) { pauseSession(true); return; }
      remoteQueue.push(message);
      latestRemoteInputAt = performance.now();
    } else if (message.type === 'state') {
      applyGuestState(message);
    } else if (message.type === 'pause' && session) {
      clearSimulationInput();
      latestRemoteInputAt = performance.now();
      latestStateAt = performance.now();
      if (!message.paused && (document.hidden || document.body.dataset.orientationBlocked === 'true')) {
        client?.send({ type: 'pause', paused: true });
        return;
      }
      if (!message.paused) {
        element('map-book').hidden = true;
        element('coop-lobby').hidden = true;
      }
      game.setNetworkPaused(message.paused);
    } else if (message.type === 'peer-left') {
      disconnected = true;
      clearSimulationInput();
      if (session) game.setNetworkPaused(true, '伙伴已断线，等待重新连接。若未能恢复，请回地图册重新建房。');
      showStatus('伙伴已断线。房间暂时暂停，等待重新连接。');
    } else if (message.type === 'ended') {
      disconnected = true;
      clearSimulationInput();
      if (session) game.setNetworkPaused(true, '房间已结束，请打开地图册重新创建房间。');
      showStatus('房间已结束。请离开房间后重新创建。');
    } else if (message.type === 'error') {
      const errorMessages = {
        not_ready: '请两位玩家都点击“我准备好了”。',
        peer_missing: '伙伴尚未在线，请等待对方加入或恢复连接。',
        room_full: '房间已满，请核对房间号或请房主重新建房。',
        room_not_found: '房间不存在或已过期，请让朋友确认建房成功。',
        rate_limited: '操作过于频繁，请稍等片刻再试。',
        already_started: '游戏已经开始，请等待房主操作。',
        paused: '游戏已暂停，请等待房主继续。'
      };
      showStatus(errorMessages[message.code] || '房间操作未成功，请稍后重试。');
    }
  }

  function connectRoom(role) {
    if (client) return;
    if (!window.SproutNetwork) { showStatus('联机模块未加载，请刷新页面。'); return; }
    const room = role === 'host' ? window.SproutNetwork.generateRoomCode() : element('room-code').value.trim();
    if (!/^[1-9][0-9]{5}$/.test(room)) { showStatus('请输入朋友发来的 6 位房间码，首位不能为 0。'); return; }
    roomConfirmed = false;
    if (role === 'host') element('room-code').value = '';
    const failureMessage = role === 'host'
      ? '创建失败，房间尚未确认创建。请检查网络后重试；不要分享未确认的房间号。'
      : '加入失败。请确认房主显示“建房成功”且仍在线，并核对房间号；若仍失败，请双方检查网络。';
    try {
      const connectingClient = new window.SproutNetwork.RoomClient({
        url: defaultRelayUrl,
        onMessage: message => {
          if (client === connectingClient) handleMessage(message);
        },
        onStatus: status => {
          if (client !== connectingClient) return;
          const state = typeof status === 'string' ? status : status.status;
          if (['disconnected', 'reconnecting', 'error', 'ended', 'closed'].includes(state)) {
            disconnected = true;
            clearSimulationInput();
            if (session) game.setNetworkPaused(true, '连接中断，正在等待恢复。无法恢复时请退出房间重新创建。');
            if (['error', 'ended', 'closed'].includes(state)) {
              if (roomConfirmed) {
                const hadSession = Boolean(session);
                leaveRoom();
                if (hadSession) game.returnToSingle();
                showStatus('房间连接已结束，请重新创建或加入。你没有变成另一位玩家。');
              }
            } else {
              showStatus('连接中断，正在自动重连。你的房间号与身份保持不变，请勿重复建房。');
            }
            updateLobby();
          }
        }
      });
      client = connectingClient;
      showStatus(role === 'host' ? '正在创建房间，请等待服务器确认…' : '正在加入朋友的房间…');
      updateLobby();
      client.connect({ room, role }).catch(() => {
        if (client !== connectingClient) return;
        leaveRoom();
        showStatus(failureMessage);
      });
    } catch {
      leaveRoom();
      showStatus(failureMessage);
    }
  }

  function pauseSession(paused) {
    if (!session || !client) return;
    if (!paused && (client.role !== 'host' || disconnected || members.filter(member => member.connected).length !== 2)) {
      game.showToast('请等两人重新在线后，由房主继续。');
      return;
    }
    if (paused) {
      clearSimulationInput();
      game.setNetworkPaused(true);
    }
    client.send({ type: 'pause', paused });
  }

  function restartSession() {
    if (client?.role !== 'host') { game.showToast('请由房主重开本关。'); return; }
    client.send({ type: 'restart' });
  }

  function leaveRoom() {
    const previousClient = client;
    client = null;
    roomConfirmed = false;
    session = null;
    members = [];
    localReady = false;
    disconnected = false;
    clearSimulationInput();
    previousClient?.close();
    updateLobby();
  }

  function tick(deltaTime, localInput) {
    if (!session || !client || disconnected) return;
    const world = game.getWorld();
    pendingLocalInput = mergeInput(pendingLocalInput, localInput || emptyInput());
    simulationAccumulator += deltaTime;
    networkAccumulator += deltaTime;
    if (performance.now() - (session.slot === 0 ? latestRemoteInputAt : latestStateAt) > 4000) {
      pauseSession(true);
      game.showToast('同步等待超过 4 秒，已暂停以免误操作。');
      return;
    }
    if (session.slot === 0) {
      while (simulationAccumulator >= simulationStep && game.isPlaying()) {
        const received = remoteQueue.shift();
        if (received) { remoteInput = received.input; acknowledgedSequence = received.sequence; }
        if (performance.now() - latestRemoteInputAt > 350) remoteInput = emptyInput();
        world.step(simulationStep, [pendingLocalInput, remoteInput]);
        pendingLocalInput = { ...emptyInput(), left: pendingLocalInput.left, right: pendingLocalInput.right };
        remoteInput = { ...emptyInput(), left: remoteInput.left, right: remoteInput.right };
        for (const event of world.events) eventQueue.push({ sequence: ++relayEventSequence, event: { ...event } });
        eventQueue = eventQueue.slice(-64);
        game.processEvents();
        simulationAccumulator -= simulationStep;
      }
      if (networkAccumulator >= networkInterval || world.completed) {
        const snapshot = world.captureSnapshot();
        snapshot.relayEvents = eventQueue;
        client.send({ type: 'state', snapshot, ack: acknowledgedSequence });
        networkAccumulator %= networkInterval;
      }
    } else {
      const directionChanged = pendingLocalInput.left !== lastSentInput.left || pendingLocalInput.right !== lastSentInput.right;
      const actionChanged = pendingLocalInput.jumpPressed || pendingLocalInput.jumpReleased || pendingLocalInput.interactPressed;
      if (networkAccumulator >= networkInterval || directionChanged || actionChanged) {
        const input = { ...pendingLocalInput };
        const entry = { sequence: ++sequence, input, steps: 0 };
        if (client.send({ type: 'input', sequence: entry.sequence, input }) !== false) {
          pendingInputs.push(entry);
          lastSentInput = input;
          pendingLocalInput = { ...emptyInput(), left: input.left, right: input.right };
          networkAccumulator = 0;
        }
        pendingInputs = pendingInputs.slice(-24);
      }
      while (simulationAccumulator >= simulationStep) {
        const entry = pendingInputs[pendingInputs.length - 1];
        if (entry) {
          const input = entry.steps === 0 ? entry.input : { left: entry.input.left, right: entry.input.right };
          const savedEvents = world.events;
          world.events = [];
          predictPlayer(world, world.players[1], input, simulationStep);
          world.events = savedEvents;
          entry.steps += 1;
        }
        simulationAccumulator -= simulationStep;
      }
      if (remoteRenderTarget) {
        const interpolation = Math.min(1, deltaTime * 20);
        world.players[0].x += (remoteRenderTarget.x - world.players[0].x) * interpolation;
        world.players[0].y += (remoteRenderTarget.y - world.players[0].y) * interpolation;
      }
    }
  }

  element('open-coop-lobby').addEventListener('click', openLobby);
  element('close-coop-lobby').addEventListener('click', () => { element('coop-lobby').hidden = true; element('open-map-book').focus(); });
  element('create-room').addEventListener('click', () => connectRoom('host'));
  element('join-room').addEventListener('click', () => connectRoom('guest'));
  element('ready-room').addEventListener('click', () => client?.send({ type: 'ready', ready: !localReady }));
  element('start-room').addEventListener('click', () => session ? restartSession() : client?.send({ type: 'start' }));
  element('leave-room').addEventListener('click', () => { leaveRoom(); game.returnToSingle(); showStatus('已离开房间，单人存档不受影响。'); });
  element('copy-room-link').addEventListener('click', async () => {
    if (!client?.connected || !roomConfirmed) return;
    const invitation = new URL(window.location.href);
    invitation.search = '';
    invitation.hash = new URLSearchParams({ room: client.room }).toString();
    try { await navigator.clipboard.writeText(invitation.href); showStatus('邀请链接已复制，发给朋友后请两人分别点击准备。'); }
    catch { showStatus(`复制失败，请手动分享链接：${invitation.href}`); }
  });

  for (const modal of [element('map-book'), element('coop-lobby')]) {
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); modal.hidden = true; element('open-map-book').focus(); }
      if (event.key !== 'Tab') return;
      const controls = [...modal.querySelectorAll('button:not(:disabled), input, summary, a[href]')].filter(control => control.getClientRects().length);
      const firstControl = controls[0];
      const lastControl = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === firstControl) { event.preventDefault(); lastControl?.focus(); }
      else if (!event.shiftKey && document.activeElement === lastControl) { event.preventDefault(); firstControl?.focus(); }
    });
  }

  updateLobby();
  const invitation = new URLSearchParams(window.location.hash.slice(1));
  if (/^[1-9][0-9]{5}$/.test(invitation.get('room') || '')) {
    element('room-code').value = invitation.get('room');
    openLobby();
    showStatus('朋友邀请你一起探险。点击加入房间，连接成功后再准备。');
  }
  window.SproutCoop = { tick, open: openLobby, pause: pauseSession, restart: restartSession, leave: leaveRoom };
})();
