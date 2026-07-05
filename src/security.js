const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function verifyLarkRequest(headers, rawBody, config, now = () => Date.now()) {
  if (!config.encryptKey) return { ok: true, skipped: true };

  const timestamp = headers.get('x-lark-request-timestamp') || '';
  const nonce = headers.get('x-lark-request-nonce') || '';
  const signature = headers.get('x-lark-signature') || '';
  if (!timestamp || !nonce || !signature) return { ok: false, status: 401, message: 'Missing Lark callback signature.' };
  if (!/^\d+$/.test(timestamp)) return { ok: false, status: 401, message: 'Invalid Lark callback timestamp.' };

  if (config.signatureToleranceSeconds > 0) {
    const ageSeconds = Math.abs(Math.floor(now() / 1000) - Number(timestamp));
    if (ageSeconds > config.signatureToleranceSeconds) {
      return { ok: false, status: 401, message: 'Lark callback signature timestamp is outside tolerance.' };
    }
  }

  const expected = await sha256Hex(`${timestamp}${nonce}${config.encryptKey}${rawBody}`);
  return constantTimeEqual(signature.toLowerCase(), expected)
    ? { ok: true }
    : { ok: false, status: 401, message: 'Invalid Lark callback signature.' };
}

export async function decodeLarkEventBody(rawBody, config) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new LarkSecurityError('Invalid Lark callback JSON.', 400);
  }

  if (!payload || typeof payload !== 'object') throw new LarkSecurityError('Invalid Lark callback payload.', 400);
  if (!payload.encrypt) return payload;
  if (!config.encryptKey) throw new LarkSecurityError('DDYS_LARK_ENCRYPT_KEY is required for encrypted callbacks.', 500);

  const decrypted = await decryptLarkEncrypt(payload.encrypt, config.encryptKey);
  try {
    return JSON.parse(decrypted);
  } catch {
    throw new LarkSecurityError('Invalid decrypted Lark callback JSON.', 400);
  }
}

export async function decryptLarkEncrypt(encrypted, encryptKey) {
  const keyBytes = await sha256Bytes(String(encryptKey || ''));
  const iv = keyBytes.slice(0, 16);
  const cipherText = base64ToBytes(encrypted);
  if (!cipherText.length || cipherText.length % 16 !== 0) throw new LarkSecurityError('Invalid encrypted Lark callback body.', 400);

  try {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, cipherText);
    return textDecoder.decode(plainBuffer);
  } catch (error) {
    if (error instanceof LarkSecurityError) throw error;
    throw new LarkSecurityError('Failed to decrypt Lark callback body.', 400);
  }
}

export function verifyVerificationToken(payload, config) {
  if (!config.verificationToken) {
    return { ok: false, status: 500, message: 'DDYS_LARK_VERIFICATION_TOKEN is required.' };
  }
  const token = getVerificationToken(payload);
  if (!token || token !== config.verificationToken) {
    return { ok: false, status: 401, message: 'Invalid Lark verification token.' };
  }
  return { ok: true };
}

export function getVerificationToken(payload) {
  return String(payload?.token || payload?.header?.token || payload?.event?.token || '').trim();
}

export function isUrlVerification(payload) {
  return payload?.type === 'url_verification'
    || payload?.event?.type === 'url_verification'
    || payload?.header?.event_type === 'url_verification';
}

export function getUrlVerificationChallenge(payload) {
  return String(payload?.challenge || payload?.event?.challenge || '').trim();
}

export function getLarkEventId(payload) {
  return String(payload?.header?.event_id || payload?.uuid || '').trim();
}

export function getLarkEventType(payload) {
  return String(payload?.header?.event_type || payload?.event?.type || payload?.type || '').trim();
}

export function isLarkMessageEvent(payload) {
  const type = getLarkEventType(payload);
  return type === 'im.message.receive_v1'
    || (payload?.type === 'event_callback' && payload?.event?.type === 'message');
}

export function getLarkSenderIds(payload) {
  const senderId = payload?.event?.sender?.sender_id || payload?.sender?.sender_id || {};
  return {
    openId: String(senderId.open_id || payload?.event?.sender?.open_id || payload?.event?.open_id || payload?.sender?.open_id || '').trim(),
    userId: String(senderId.user_id || payload?.event?.sender?.user_id || payload?.event?.user_id || payload?.sender?.user_id || '').trim(),
    unionId: String(senderId.union_id || payload?.event?.sender?.union_id || payload?.event?.union_id || payload?.sender?.union_id || '').trim()
  };
}

export function getLarkMessage(payload) {
  if (payload?.event?.message || payload?.message) return payload?.event?.message || payload?.message || {};
  const event = payload?.event || {};
  if (!event || typeof event !== 'object') return {};
  if (!event.message_id && !event.msg_type && !event.text && !event.text_without_at_bot) return {};
  const text = event.text_without_at_bot || event.text || '';
  return {
    message_id: event.message_id || event.open_message_id || event.message_id_v2 || '',
    chat_id: event.open_chat_id || event.chat_id || '',
    chat_type: event.chat_type || event.chat_type_v2 || '',
    message_type: event.message_type || event.msg_type || 'text',
    content: event.content || JSON.stringify({ text }),
    text,
    text_without_at_bot: event.text_without_at_bot || ''
  };
}

export function getLarkChatId(payload) {
  return String(getLarkMessage(payload)?.chat_id || payload?.event?.chat_id || payload?.chat_id || '').trim();
}

export function getLarkTenantKey(payload) {
  return String(payload?.header?.tenant_key || payload?.event?.sender?.tenant_key || payload?.event?.tenant_key || payload?.tenant_key || '').trim();
}

export function isActorAllowed(payload, config) {
  const sender = getLarkSenderIds(payload);
  const chatId = getLarkChatId(payload);
  const tenantKey = getLarkTenantKey(payload);
  const openAllowed = config.allowedOpenIds.size === 0 || config.allowedOpenIds.has(sender.openId);
  const userAllowed = config.allowedUserIds.size === 0 || config.allowedUserIds.has(sender.userId);
  const chatAllowed = config.allowedChatIds.size === 0 || config.allowedChatIds.has(chatId);
  const tenantAllowed = config.allowedTenantKeys.size === 0 || config.allowedTenantKeys.has(tenantKey);
  return openAllowed && userAllowed && chatAllowed && tenantAllowed;
}

export function isAdmin(payload, config) {
  const sender = getLarkSenderIds(payload);
  return config.adminOpenIds.has(sender.openId) || config.adminUserIds.has(sender.userId);
}

export class LarkSecurityError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'LarkSecurityError';
    this.status = status;
  }
}

async function sha256Hex(value) {
  return bytesToHex(await sha256Bytes(value));
}

async function sha256Bytes(value) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(String(value)));
  return new Uint8Array(digest);
}

function base64ToBytes(value) {
  const raw = String(value || '').trim();
  if (!raw) return new Uint8Array();
  if (typeof atob === 'function') {
    const binary = atob(raw);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(raw, 'base64'));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= left.charCodeAt(index % Math.max(left.length, 1)) ^ right.charCodeAt(index % Math.max(right.length, 1));
  }
  return diff === 0;
}
