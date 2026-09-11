import {
  byteLength, consumeRateLimit, HEARTBEAT_TIMEOUT_MS, isAllowedOrigin, MAX_MESSAGE_BYTES,
  parseMessage, RECONNECT_WINDOW_MS, ROOM_LIFETIME_MS, ROOM_PATTERN, TOKEN_PATTERN
} from './protocol.js';

function rejectRequest(code, status) {
  return Response.json({ type: 'error', code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, environment) {
    if (!isAllowedOrigin(request.headers.get('Origin'), environment)) return rejectRequest('origin_forbidden', 403);
    const address = new URL(request.url);
    const match = /^\/room\/([1-9][0-9]{5})$/.exec(address.pathname);
    if (!match) return rejectRequest('invalid_room', 400);
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return rejectRequest('websocket_required', 426);
    }
    const role = address.searchParams.get('role');
    const token = address.searchParams.get('token');
    if (!['host', 'guest'].includes(role) || !TOKEN_PATTERN.test(token || '')) return rejectRequest('invalid_credentials', 400);
    if (environment.ROOM_CONNECT_LIMITER) {
      const connectionLimit = await environment.ROOM_CONNECT_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
      if (!connectionLimit.success) return rejectRequest('rate_limited', 429);
    }
    return environment.ROOMS.get(environment.ROOMS.idFromName(match[1])).fetch(request);
  }
};

export class RoomRelay {
  constructor(context, environment) {
    this.context = context;
    this.environment = environment;
    this.session = null;
    context.blockConcurrencyWhile(async () => {
      this.session = await context.storage.get('session') || null;
    });
  }

  fetch(request) {
    return this.context.blockConcurrencyWhile(() => this.connectPeer(request));
  }

  async connectPeer(request) {
    if (!isAllowedOrigin(request.headers.get('Origin'), this.environment)) return rejectRequest('origin_forbidden', 403);
    const address = new URL(request.url);
    const room = address.pathname.slice('/room/'.length);
    const role = address.searchParams.get('role');
    const token = address.searchParams.get('token');
    if (!ROOM_PATTERN.test(room) || !['host', 'guest'].includes(role) || !TOKEN_PATTERN.test(token || '')) {
      return rejectRequest('invalid_credentials', 400);
    }
    await this.expirePeers(Date.now());
    const slot = role === 'host' ? 0 : 1;
    const tokenHash = await hashToken(token);
    if (!this.session) {
      if (slot !== 0 || address.searchParams.get('resume') === '1') return rejectRequest('room_not_found', 404);
      this.session = { room, createdAt: Date.now(), started: false, paused: false, players: [null, null] };
    }
    const previousPlayer = this.session.players[slot];
    if (!previousPlayer && address.searchParams.get('resume') === '1') return rejectRequest('room_not_found', 404);
    if (previousPlayer && previousPlayer.tokenHash !== tokenHash) return rejectRequest('room_full', 409);
    const previousSocket = this.getSocket(slot);
    if (previousSocket) {
      this.detachSocket(previousSocket, 4001, 'replaced');
      if (this.session.started) this.session.paused = true;
    }
    const pair = new WebSocketPair();
    const clientSocket = pair[0];
    const serverSocket = pair[1];
    this.context.acceptWebSocket(serverSocket, [String(slot)]);
    serverSocket.serializeAttachment({ slot, tokenHash, lastSeen: Date.now(), lastSequence: -1, active: true, violations: 0 });
    this.session.players[slot] = { tokenHash, ready: previousPlayer?.ready || false, disconnectedAt: null };
    await this.saveSession();
    await this.scheduleAlarm();
    this.sendTo(serverSocket, { type: 'welcome', slot, room, reconnected: Boolean(previousPlayer), started: this.session.started, paused: this.session.paused });
    this.broadcastLobby();
    if (this.session.started) this.broadcast({ type: 'pause', paused: this.session.paused, reason: 'reconnect', slot });
    return new Response(null, { status: 101, webSocket: clientSocket });
  }

  getSocket(slot) {
    return this.context.getWebSockets(String(slot)).find(socket => socket.readyState === 1 && socket.deserializeAttachment()?.active);
  }

  sendTo(socket, message) {
    try {
      if (socket?.readyState === 1) socket.send(JSON.stringify(message));
    } catch {
      // The close/error event or heartbeat alarm handles failed connections.
    }
  }

  broadcast(message) {
    for (const slot of [0, 1]) this.sendTo(this.getSocket(slot), message);
  }

  broadcastLobby() {
    if (!this.session) return;
    this.broadcast({ type: 'lobby', players: this.session.players.flatMap((player, slot) => player
      ? [{ slot, ready: player.ready, connected: Boolean(this.getSocket(slot)) }] : []) });
  }

  bothPresent() {
    return Boolean(this.getSocket(0) && this.getSocket(1));
  }

  saveSession() {
    return this.context.storage.put('session', this.session);
  }

  scheduleAlarm() {
    const deadlines = this.session.players.filter(player => player?.disconnectedAt !== null && player?.disconnectedAt !== undefined)
      .map(player => player.disconnectedAt + RECONNECT_WINDOW_MS);
    return this.context.storage.setAlarm(Math.min(Date.now() + 15_000, this.session.createdAt + ROOM_LIFETIME_MS, ...deadlines));
  }

  webSocketMessage(socket, raw) {
    return this.context.blockConcurrencyWhile(() => this.handleMessage(socket, raw));
  }

  async handleMessage(socket, raw) {
    const attachment = socket.deserializeAttachment();
    if (!attachment?.active || !this.session) return;
    const messageBytes = typeof raw === 'string' ? byteLength(raw) : raw.byteLength;
    if (messageBytes > MAX_MESSAGE_BYTES || !consumeRateLimit(attachment, messageBytes, Date.now())) {
      this.sendTo(socket, { type: 'error', code: messageBytes > MAX_MESSAGE_BYTES ? 'message_too_large' : 'rate_limited' });
      await this.disconnectPeer(socket, 1008, 'policy_violation');
      return;
    }
    attachment.lastSeen = Date.now();
    socket.serializeAttachment(attachment);
    const parsed = parseMessage(raw, attachment.slot);
    if (parsed.error) {
      attachment.violations += 1;
      socket.serializeAttachment(attachment);
      this.sendTo(socket, { type: 'error', code: parsed.error });
      if (attachment.violations >= 5) await this.disconnectPeer(socket, 1008, 'invalid_messages');
      return;
    }
    const message = parsed.message;
    const reject = code => this.sendTo(socket, { type: 'error', code });
    if (message.type === 'ping') {
      this.sendTo(socket, { type: 'pong' });
      return;
    }
    if (message.type === 'ready') {
      if (this.session.started) return reject('already_started');
      this.session.players[attachment.slot].ready = message.ready;
      await this.saveSession();
      this.broadcastLobby();
      return;
    }
    if (message.type === 'start' || message.type === 'restart') {
      if (!this.bothPresent()) return reject('peer_missing');
      if (!this.session.players.every(player => player?.ready)) return reject('not_ready');
      if (message.type === 'start' && this.session.started) return reject('already_started');
      if (message.type === 'restart' && !this.session.started) return reject('not_started');
      this.session.started = true;
      this.session.paused = false;
      for (const slot of [0, 1]) {
        const peerSocket = this.getSocket(slot);
        const peerAttachment = peerSocket.deserializeAttachment();
        peerAttachment.lastSequence = -1;
        peerSocket.serializeAttachment(peerAttachment);
      }
      await this.saveSession();
      this.broadcast({ type: message.type === 'start' ? 'started' : 'restarted' });
      return;
    }
    if (!this.session.started) return reject('not_started');
    if (message.type === 'pause') {
      if (!message.paused && !this.bothPresent()) return reject('peer_missing');
      this.session.paused = message.paused;
      await this.saveSession();
      this.broadcast({ type: 'pause', paused: message.paused, slot: attachment.slot, reason: 'requested' });
      return;
    }
    if (!this.bothPresent()) return reject('peer_missing');
    if (this.session.paused) return reject('paused');
    if (message.type === 'input') {
      if (message.sequence <= attachment.lastSequence) return reject('stale_input');
      attachment.lastSequence = message.sequence;
      socket.serializeAttachment(attachment);
      this.sendTo(this.getSocket(0), message);
    } else if (message.type === 'state') {
      this.sendTo(this.getSocket(1), message);
    }
  }

  detachSocket(socket, code, reason) {
    const attachment = socket.deserializeAttachment();
    socket.serializeAttachment({ ...attachment, active: false });
    try { socket.close(code, reason); } catch { /* Already closed by the peer. */ }
  }

  async disconnectPeer(socket, code = 4000, reason = 'disconnected') {
    const attachment = socket.deserializeAttachment();
    if (!attachment?.active || !this.session) return;
    this.detachSocket(socket, code, reason);
    const player = this.session.players[attachment.slot];
    if (!player) return;
    player.disconnectedAt = Date.now();
    if (this.session.started) this.session.paused = true;
    await this.saveSession();
    await this.scheduleAlarm();
    this.broadcast({ type: 'peer-left', slot: attachment.slot, reconnectUntil: player.disconnectedAt + RECONNECT_WINDOW_MS, reason });
    if (this.session.started) this.broadcast({ type: 'pause', paused: true, slot: attachment.slot, reason: 'disconnect' });
    this.broadcastLobby();
  }

  webSocketClose(socket) {
    return this.context.blockConcurrencyWhile(() => this.disconnectPeer(socket));
  }

  webSocketError(socket) {
    return this.context.blockConcurrencyWhile(() => this.disconnectPeer(socket));
  }

  async expirePeers(now) {
    if (!this.session) return;
    if (now >= this.session.createdAt + ROOM_LIFETIME_MS
      || this.session.players.some(player => player?.disconnectedAt != null && now >= player.disconnectedAt + RECONNECT_WINDOW_MS)) {
      this.broadcast({ type: 'ended', reason: now >= this.session.createdAt + ROOM_LIFETIME_MS ? 'room_expired' : 'reconnect_timeout' });
      for (const socket of this.context.getWebSockets()) this.detachSocket(socket, 4004, 'room_ended');
      this.session = null;
      await this.context.storage.deleteAll();
      await this.context.storage.deleteAlarm();
    }
  }

  alarm() {
    return this.context.blockConcurrencyWhile(async () => {
      const now = Date.now();
      await this.expirePeers(now);
      if (!this.session) return;
      for (const slot of [0, 1]) {
        const socket = this.getSocket(slot);
        if (socket && now - socket.deserializeAttachment().lastSeen >= HEARTBEAT_TIMEOUT_MS) {
          await this.disconnectPeer(socket, 4000, 'heartbeat_timeout');
        }
      }
      await this.scheduleAlarm();
    });
  }
}
