import { createTimeoutSignal } from './response.js';

export const LARK_ENDPOINTS = {
  TENANT_ACCESS_TOKEN: '/auth/v3/tenant_access_token/internal',
  MESSAGES: '/im/v1/messages'
};

export const sharedTenantTokenCache = {
  key: '',
  token: '',
  expiresAt: 0
};

export async function callLarkApi(pathname, payload, config, runtime = {}, method = 'POST') {
  const token = await getTenantAccessToken(config, runtime);
  const fetchImpl = runtime.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

  const timeout = createTimeoutSignal(config.requestTimeoutMs);
  let response;
  try {
    response = await fetchImpl(`${config.larkApiBase}${pathname}`, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
        'user-agent': config.userAgent
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: timeout.signal
    });
  } finally {
    timeout.cancel();
  }
  return readLarkResponse(response, method, pathname);
}

export async function getTenantAccessToken(config, runtime = {}) {
  if (config.tenantAccessToken) return config.tenantAccessToken;
  if (!config.appId || !config.appSecret) throw new Error('DDYS_LARK_APP_ID and DDYS_LARK_APP_SECRET are required to call Lark API.');

  const cache = runtime.tenantTokenCache || sharedTenantTokenCache;
  const now = runtime.now || (() => Date.now());
  const key = `${config.larkApiBase}|${config.appId}`;
  if (cache.key === key && cache.token && cache.expiresAt > now()) return cache.token;

  const fetchImpl = runtime.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const timeout = createTimeoutSignal(config.requestTimeoutMs);
  let response;
  try {
    response = await fetchImpl(`${config.larkApiBase}${LARK_ENDPOINTS.TENANT_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json; charset=utf-8',
        'user-agent': config.userAgent
      },
      body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
      signal: timeout.signal
    });
  } finally {
    timeout.cancel();
  }

  const data = await readLarkResponse(response, 'POST', LARK_ENDPOINTS.TENANT_ACCESS_TOKEN);
  const token = String(data.tenant_access_token || '').trim();
  if (!token) throw new Error('Lark tenant_access_token response is empty.');
  const expireSeconds = Number(data.expire || 7200);
  cache.key = key;
  cache.token = token;
  cache.expiresAt = now() + Math.max(60, expireSeconds - 60) * 1000;
  return token;
}

export function replyMessage(messageId, payload, config, runtime = {}) {
  if (!messageId) throw new Error('Lark message_id is required to reply.');
  return callLarkApi(`${LARK_ENDPOINTS.MESSAGES}/${encodeURIComponent(messageId)}/reply`, payload, config, runtime, 'POST');
}

export function sendMessage(receiveIdType, receiveId, payload, config, runtime = {}) {
  if (!receiveIdType || !receiveId) throw new Error('Lark receive_id_type and receive_id are required to send a message.');
  const separator = LARK_ENDPOINTS.MESSAGES.includes('?') ? '&' : '?';
  return callLarkApi(`${LARK_ENDPOINTS.MESSAGES}${separator}receive_id_type=${encodeURIComponent(receiveIdType)}`, {
    receive_id: receiveId,
    ...payload
  }, config, runtime, 'POST');
}

export function updateMessage(messageId, payload, config, runtime = {}) {
  if (!messageId) throw new Error('Lark message_id is required to update a message.');
  return callLarkApi(`${LARK_ENDPOINTS.MESSAGES}/${encodeURIComponent(messageId)}`, payload, config, runtime, 'PATCH');
}

async function readLarkResponse(response, method, pathname) {
  const type = response.headers?.get?.('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await readTextAsMessage(response);
  if (!response.ok) throw new Error(`Lark API ${method} ${pathname} failed: ${data?.msg || data?.message || response.status}`);
  if (data && typeof data === 'object' && 'code' in data && data.code !== 0) {
    throw new Error(`Lark API ${method} ${pathname} failed: ${data.msg || data.message || data.code}`);
  }
  return data?.data && typeof data.data === 'object' ? { ...data.data, raw: data } : data;
}

async function readTextAsMessage(response) {
  const body = await response.text();
  return body ? { message: body } : {};
}
