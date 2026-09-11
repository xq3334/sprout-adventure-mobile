(function exposeSproutNetwork(root) {
  'use strict';

  const MAX_MESSAGE_BYTES = 65 * 1024;
  const MAX_BUFFERED_BYTES = 256 * 1024;
  const RECONNECT_WINDOW_MS = 30_000;
  const ROOM_PATTERN = /^[1-9][0-9]{5}$/;
  const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

  function requireCrypto() {
    if (!root.crypto?.getRandomValues) throw new Error('Secure randomness requires HTTPS or localhost.');
    return root.crypto;
  }

  function generateRoomCode() {
    const randomValues = new Uint32Array(1);
    const rejectionThreshold = Math.floor(0x100000000 / 900000) * 900000;
    do { requireCrypto().getRandomValues(randomValues); } while (randomValues[0] >= rejectionThreshold);
    return String(100000 + randomValues[0] % 900000);
  }

  function generateToken() {
    const randomValues = new Uint8Array(32);
    requireCrypto().getRandomValues(randomValues);
    return Array.from(randomValues, value => value.toString(16).padStart(2, '0')).join('');
  }

  class RoomClient {
    constructor({ url, onMessage = () => {}, onStatus = () => {} }) {
      this.url = new URL(url);
      const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(this.url.hostname);
      if (this.url.protocol === 'https:') this.url.protocol = 'wss:';
      if (this.url.protocol === 'http:' && localHost) this.url.protocol = 'ws:';
      if (this.url.protocol !== 'wss:' && !(this.url.protocol === 'ws:' && localHost)) {
        throw new Error('Room server must use WSS, except localhost development.');
      }
      if (this.url.username || this.url.password) throw new Error('Room server URL must not contain credentials.');
      this.onMessage = onMessage;
      this.onStatus = onStatus;
      this.role = null;
      this.room = null;
      this.token = null;
      this.socket = null;
      this.connected = false;
      this.closed = true;
      this.generation = 0;
      this.reconnectDeadline = 0;
      this.retryCount = 0;
      this.retryTimer = null;
      this.heartbeatTimer = null;
      this.handshakeTimer = null;
      this.pendingConnection = null;
    }

    connect({ room, role, token } = {}) {
      if (!['host', 'guest'].includes(role)) return Promise.reject(new Error('Role must be host or guest.'));
      const selectedRoom = room == null && role === 'host' ? generateRoomCode() : String(room || '').trim();
      if (!ROOM_PATTERN.test(selectedRoom)) return Promise.reject(new Error('Room code must contain six digits, starting 1–9.'));
      if (token !== undefined && !TOKEN_PATTERN.test(token)) return Promise.reject(new Error('Invalid reconnect token.'));
      this.close();
      this.room = selectedRoom;
      this.role = role;
      this.token = token || generateToken();
      this.closed = false;
      this.connected = false;
      this.reconnectDeadline = 0;
      this.retryCount = 0;
      const promise = new Promise((resolve, reject) => { this.pendingConnection = { resolve, reject }; });
      this.openSocket(false, token !== undefined);
      return promise;
    }

    openSocket(resuming, requireExistingRoom = false) {
      if (this.closed) return;
      const generation = this.generation;
      const address = new URL(this.url);
      address.pathname = `/room/${this.room}`;
      address.search = '';
      address.hash = '';
      address.searchParams.set('role', this.role);
      address.searchParams.set('token', this.token);
      if (resuming || requireExistingRoom) address.searchParams.set('resume', '1');
      this.onStatus(resuming ? 'reconnecting' : 'connecting', { room: this.room, role: this.role });
      let socket;
      try {
        socket = new root.WebSocket(address.href);
      } catch (error) {
        this.finishConnection(error);
        return;
      }
      this.socket = socket;
      let welcomed = false;
      const isCurrent = () => generation === this.generation && socket === this.socket && !this.closed;
      this.handshakeTimer = root.setTimeout(() => {
        if (isCurrent() && !welcomed) socket.close(4000, 'handshake_timeout');
      }, resuming ? Math.max(1, Math.min(8000, this.reconnectDeadline - Date.now())) : 8000);
      socket.onmessage = event => {
        if (!isCurrent()) return;
        if (typeof event.data !== 'string' || new TextEncoder().encode(event.data).byteLength > MAX_MESSAGE_BYTES) {
          socket.close(4008, 'invalid_server_message');
          return;
        }
        let message;
        try { message = JSON.parse(event.data); } catch { socket.close(4008, 'invalid_server_json'); return; }
        if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
          socket.close(4008, 'invalid_server_message');
          return;
        }
        if (message.type === 'welcome') {
          if (message.room !== this.room || message.slot !== (this.role === 'host' ? 0 : 1)) {
            socket.close(4008, 'invalid_welcome');
            return;
          }
          welcomed = true;
          this.connected = true;
          this.reconnectDeadline = 0;
          this.retryCount = 0;
          root.clearTimeout(this.handshakeTimer);
          let lastPong = Date.now();
          this.updatePong = () => { lastPong = Date.now(); };
          this.heartbeatTimer = root.setInterval(() => {
            if (!isCurrent()) return;
            if (Date.now() - lastPong > 35_000) socket.close(4000, 'heartbeat_timeout');
            else this.send({ type: 'ping' });
          }, 10_000);
          this.onStatus('connected', { room: this.room, role: this.role, reconnected: Boolean(message.reconnected) });
          this.pendingConnection?.resolve(message);
          this.pendingConnection = null;
        }
        if (message.type === 'pong') {
          this.updatePong?.();
          return;
        }
        if (message.type === 'ended') {
          this.onMessage(message);
          this.close();
          this.onStatus('ended', { reason: message.reason });
          return;
        }
        this.onMessage(message);
      };
      socket.onerror = () => {
        // Browsers intentionally hide HTTP upgrade rejection details; close carries retry policy.
      };
      socket.onclose = event => {
        if (!isCurrent()) return;
        this.connected = false;
        this.clearTimers();
        this.socket = null;
        const terminalClose = [1000, 1008, 4001, 4004, 4008].includes(event.code);
        if (terminalClose || (!welcomed && !resuming)) {
          this.finishConnection(new Error(event.reason || 'Unable to join room. Check the room code, available slot, server URL and allowed origin.'), event.code);
          return;
        }
        if (!this.reconnectDeadline) this.reconnectDeadline = Date.now() + RECONNECT_WINDOW_MS;
        const remaining = this.reconnectDeadline - Date.now();
        if (remaining <= 0) {
          this.finishConnection(new Error('Reconnect window expired.'), 4004);
          return;
        }
        this.onStatus('disconnected', { code: event.code, reason: event.reason, reconnectUntil: this.reconnectDeadline });
        const delay = Math.min(remaining, 500 * 2 ** Math.min(this.retryCount++, 3));
        this.retryTimer = root.setTimeout(() => {
          if (Date.now() >= this.reconnectDeadline) this.finishConnection(new Error('Reconnect window expired.'), 4004);
          else this.openSocket(true);
        }, delay);
      };
    }

    send(message) {
      if (!this.connected || this.socket?.readyState !== 1) return false;
      let serialized;
      try { serialized = JSON.stringify(message); } catch { return false; }
      if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).byteLength > MAX_MESSAGE_BYTES) return false;
      if (this.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
        this.onStatus('backpressure', { bufferedAmount: this.socket.bufferedAmount });
        return false;
      }
      try { this.socket.send(serialized); return true; } catch { return false; }
    }

    clearTimers() {
      root.clearTimeout(this.retryTimer);
      root.clearTimeout(this.handshakeTimer);
      root.clearInterval(this.heartbeatTimer);
      this.retryTimer = null;
      this.handshakeTimer = null;
      this.heartbeatTimer = null;
    }

    finishConnection(error, code) {
      this.closed = true;
      this.connected = false;
      this.clearTimers();
      this.pendingConnection?.reject(error);
      this.pendingConnection = null;
      this.onStatus('error', { message: error.message, code });
    }

    close() {
      const wasActive = !this.closed;
      this.closed = true;
      this.connected = false;
      this.generation += 1;
      this.clearTimers();
      this.pendingConnection?.reject(new Error('Connection cancelled.'));
      this.pendingConnection = null;
      const previousSocket = this.socket;
      this.socket = null;
      if (previousSocket && previousSocket.readyState < 2) previousSocket.close(1000, 'client_closed');
      if (wasActive) this.onStatus('closed', {});
    }
  }

  const network = { RoomClient, generateRoomCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = network;
  root.SproutNetwork = network;
})(typeof globalThis !== 'undefined' ? globalThis : this);
