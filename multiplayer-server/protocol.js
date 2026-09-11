export const MAX_SNAPSHOT_BYTES = 64 * 1024;
export const MAX_MESSAGE_BYTES = MAX_SNAPSHOT_BYTES + 1024;
export const RECONNECT_WINDOW_MS = 30_000;
export const HEARTBEAT_TIMEOUT_MS = 45_000;
export const ROOM_LIFETIME_MS = 6 * 60 * 60 * 1000;
export const ROOM_PATTERN = /^[1-9][0-9]{5}$/;
export const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

const inputFields = ['left', 'right', 'jumpPressed', 'jumpReleased', 'interactPressed'];
const encoder = new TextEncoder();

export function byteLength(value) {
  return encoder.encode(value).byteLength;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function isSequence(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function parseMessage(raw, slot) {
  if (typeof raw !== 'string') return { error: 'text_only' };
  if (byteLength(raw) > MAX_MESSAGE_BYTES) return { error: 'message_too_large' };
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return { error: 'invalid_json' };
  }
  if (!isRecord(message) || typeof message.type !== 'string') return { error: 'invalid_message' };
  switch (message.type) {
    case 'ping':
    case 'start':
    case 'restart':
      if (!hasExactKeys(message, ['type'])) return { error: 'invalid_schema' };
      if (message.type !== 'ping' && slot !== 0) return { error: 'host_only' };
      break;
    case 'ready':
      if (!hasExactKeys(message, ['type', 'ready']) || typeof message.ready !== 'boolean') return { error: 'invalid_schema' };
      break;
    case 'pause':
      if (!hasExactKeys(message, ['type', 'paused']) || typeof message.paused !== 'boolean') return { error: 'invalid_schema' };
      break;
    case 'input':
      if (slot !== 1) return { error: 'guest_only' };
      if (!hasExactKeys(message, ['type', 'sequence', 'input']) || !isSequence(message.sequence)
        || !hasExactKeys(message.input, inputFields) || !inputFields.every(field => typeof message.input[field] === 'boolean')) {
        return { error: 'invalid_schema' };
      }
      break;
    case 'state':
      if (slot !== 0) return { error: 'host_only' };
      if (!hasExactKeys(message, ['type', 'snapshot', 'ack']) || !isRecord(message.snapshot)
        || !(message.ack === -1 || isSequence(message.ack))) return { error: 'invalid_schema' };
      if (byteLength(JSON.stringify(message.snapshot)) > MAX_SNAPSHOT_BYTES) return { error: 'snapshot_too_large' };
      break;
    default:
      return { error: 'unknown_type' };
  }
  return { message };
}

export function isAllowedOrigin(origin, environment) {
  if (!origin || origin === 'null') return false;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) return false;
  const configuredOrigins = String(environment.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (configuredOrigins.includes(origin)) return true;
  return environment.ALLOW_LOCALHOST === 'true'
    && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
}

export function consumeRateLimit(attachment, messageBytes, now) {
  if (!attachment.rate || now - attachment.rate.since >= 1000) {
    attachment.rate = { since: now, messages: 0, bytes: 0 };
  }
  attachment.rate.messages += 1;
  attachment.rate.bytes += messageBytes;
  return attachment.rate.messages <= 90 && attachment.rate.bytes <= 2 * 1024 * 1024;
}
