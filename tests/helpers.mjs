import assert from 'node:assert/strict';

const encoder = new TextEncoder();

export function createJsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) }
  });
}

export function createRecordingFetch(options = {}) {
  const calls = [];
  const ddysPayload = options.ddysPayload || {
    data: {
      items: [
        {
          id: 'movie-1',
          title: 'Test Movie',
          year: '2026',
          region: 'CN',
          type: 'movie',
          description: 'A useful DDYS result.',
          poster: '/poster.jpg'
        }
      ]
    }
  };

  async function fetchImpl(url, init = {}) {
    const requestUrl = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: requestUrl, init, body });
    if (requestUrl.includes('/search?') || requestUrl.includes('/latest?') || requestUrl.includes('/hot?')) {
      return createJsonResponse(ddysPayload, { status: options.ddysStatus || 200 });
    }
    if (requestUrl.endsWith('/auth/v3/tenant_access_token/internal')) {
      return createJsonResponse(options.tokenPayload || { code: 0, tenant_access_token: 'tenant-token', expire: 7200 });
    }
    if (requestUrl.includes('/im/v1/messages')) {
      return createJsonResponse(options.larkPayload || { code: 0, data: { message_id: 'om_reply' } });
    }
    return createJsonResponse({ code: 999, msg: 'not found' }, { status: 404 });
  }

  return { fetchImpl, calls };
}

export function baseConfig(overrides = {}) {
  return {
    DDYS_LARK_APP_ID: 'cli_test',
    DDYS_LARK_APP_SECRET: 'app-secret',
    DDYS_LARK_TENANT_ACCESS_TOKEN: 'tenant-token',
    DDYS_LARK_VERIFICATION_TOKEN: 'verification-token',
    DDYS_LARK_ENCRYPT_KEY: 'encrypt-key',
    DDYS_LARK_SIGNATURE_TOLERANCE_SECONDS: '0',
    DDYS_API_BASE: 'https://api.example.test/v1',
    DDYS_PUBLIC_BASE: 'https://ddys.example.test',
    ...overrides
  };
}

export function createMessageEvent(text, extra = {}) {
  return {
    schema: '2.0',
    header: {
      event_id: extra.eventId || 'ev_1',
      event_type: 'im.message.receive_v1',
      create_time: '2000000000000',
      token: 'verification-token',
      app_id: 'cli_test',
      tenant_key: extra.tenantKey || 'tenant-1'
    },
    event: {
      sender: {
        sender_id: {
          open_id: extra.openId || 'ou_admin',
          user_id: extra.userId || 'user_admin',
          union_id: extra.unionId || 'on_union'
        },
        sender_type: 'user',
        tenant_key: extra.tenantKey || 'tenant-1'
      },
      message: {
        message_id: extra.messageId || 'om_1',
        root_id: '',
        parent_id: '',
        create_time: '2000000000000',
        chat_id: extra.chatId || 'oc_1',
        chat_type: extra.chatType || 'group',
        message_type: extra.messageType || 'text',
        content: extra.content === undefined ? JSON.stringify({ text }) : extra.content
      }
    }
  };
}

export function createUrlVerification(challenge = 'challenge-code') {
  return {
    schema: '2.0',
    header: {
      event_id: 'ev_verify',
      event_type: 'url_verification',
      token: 'verification-token',
      app_id: 'cli_test',
      tenant_key: 'tenant-1'
    },
    event: {
      type: 'url_verification',
      token: 'verification-token',
      challenge
    }
  };
}

export async function signedRequest(url, payload, init = {}) {
  const body = init.encrypt ? JSON.stringify({ encrypt: await encryptPayload(payload, init.encryptKey || 'encrypt-key') }) : JSON.stringify(payload);
  const timestamp = init.timestamp || '2000000000';
  const nonce = init.nonce || 'nonce-value';
  const signature = init.signature || await signLarkBody(body, timestamp, nonce, init.encryptKey || 'encrypt-key');
  return new Request(url, {
    method: init.method || 'POST',
    headers: {
      'content-type': 'application/json',
      'x-lark-request-timestamp': timestamp,
      'x-lark-request-nonce': nonce,
      'x-lark-signature': signature,
      ...(init.headers || {})
    },
    body
  });
}

export async function signLarkBody(body, timestamp = '2000000000', nonce = 'nonce-value', encryptKey = 'encrypt-key') {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${timestamp}${nonce}${encryptKey}${body}`));
  return bytesToHex(new Uint8Array(digest));
}

export async function encryptPayload(payload, encryptKey = 'encrypt-key') {
  const keyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(encryptKey)));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  const iv = keyBytes.slice(0, 16);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, encoder.encode(JSON.stringify(payload)));
  return bytesToBase64(new Uint8Array(cipher));
}

export async function readJson(response) {
  assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
  return response.json();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}
