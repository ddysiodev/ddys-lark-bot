import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDdysLarkBot,
  createInteractionDeduper,
  createSearchCache,
  decodeLarkEventBody,
  getConfig,
  getTenantAccessToken,
  handleLarkCommand,
  handleLarkEvent,
  handleLarkEventPayload,
  extractTextFromMessage,
  isLarkMessageEvent,
  normalizeItems,
  parseLarkCommand,
  replyMessage,
  resultsToCard,
  searchDdys,
  sendMessage,
  updateMessage,
  verifyLarkRequest
} from '../src/index.js';
import { baseConfig, createLegacyMessageEvent, createMessageEvent, createPostMessageEvent, createRecordingFetch, createUrlVerification, encryptPayload, readJson, signedRequest } from './helpers.mjs';

test('webhook verifies Lark signature and handles URL verification', async () => {
  const request = await signedRequest('https://example.com/lark/events', createUrlVerification('hello'));
  const response = await handleLarkEvent(request, baseConfig(), {}, { now: () => 2000000000 * 1000 });
  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), { challenge: 'hello' });

  const bad = await handleLarkEvent(await signedRequest('https://example.com/lark/events', createUrlVerification('bad'), { signature: '0'.repeat(64) }), baseConfig());
  assert.equal(bad.status, 401);
});

test('webhook decrypts encrypted callbacks before token and challenge handling', async () => {
  const request = await signedRequest('https://example.com/lark/events', createUrlVerification('encrypted-ok'), { encrypt: true });
  const response = await handleLarkEvent(request, baseConfig(), {}, { now: () => 2000000000 * 1000 });
  assert.deepEqual(await readJson(response), { challenge: 'encrypted-ok' });

  const encrypted = await encryptPayload(createUrlVerification('decoded'));
  const decoded = await decodeLarkEventBody(JSON.stringify({ encrypt: encrypted }), getConfig(baseConfig()));
  assert.equal(decoded.event.challenge, 'decoded');
});

test('webhook guards path, method, timestamp tolerance, JSON, and verification token', async () => {
  const wrongPath = await handleLarkEvent(new Request('https://example.com/wrong', { method: 'POST' }), baseConfig());
  assert.equal(wrongPath.status, 404);
  const wrongMethod = await handleLarkEvent(new Request('https://example.com/lark/events'), baseConfig());
  assert.equal(wrongMethod.status, 405);

  const expired = await handleLarkEvent(
    await signedRequest('https://example.com/lark/events', createUrlVerification('old'), { timestamp: '1000' }),
    baseConfig({ DDYS_LARK_SIGNATURE_TOLERANCE_SECONDS: '10' }),
    {},
    { now: () => 2000000000 * 1000 }
  );
  assert.equal(expired.status, 401);

  const invalidJsonBody = '{';
  const invalidJson = await handleLarkEvent(new Request('https://example.com/lark/events', {
    method: 'POST',
    headers: {
      'x-lark-request-timestamp': '2000000000',
      'x-lark-request-nonce': 'nonce-value',
      'x-lark-signature': await import('./helpers.mjs').then((m) => m.signLarkBody(invalidJsonBody))
    },
    body: invalidJsonBody
  }), baseConfig());
  assert.equal(invalidJson.status, 400);

  const invalidToken = createUrlVerification('nope');
  invalidToken.header.token = 'wrong';
  invalidToken.event.token = 'wrong';
  const tokenResponse = await handleLarkEvent(await signedRequest('https://example.com/lark/events', invalidToken), baseConfig());
  assert.equal(tokenResponse.status, 401);
});

test('createDdysLarkBot exposes a Worker-compatible fetch handler and dedupes events', async () => {
  const { fetchImpl, calls } = createRecordingFetch();
  const eventDeduper = createInteractionDeduper();
  const bot = createDdysLarkBot({ runtime: { fetch: fetchImpl, eventDeduper } });
  const event = createMessageEvent('/ddys search matrix');

  const first = await bot.fetch(await signedRequest('https://example.com/lark/events', event), baseConfig(), {});
  const second = await bot.fetch(await signedRequest('https://example.com/lark/events', event), baseConfig(), {});

  assert.deepEqual(await readJson(first), { code: 0, msg: 'ok' });
  assert.deepEqual(await readJson(second), { code: 0, msg: 'duplicate' });
  assert.equal(calls.some((call) => call.url === 'https://api.example.test/v1/search?q=matrix&limit=5'), true);
  const replyCalls = calls.filter((call) => call.url.endsWith('/im/v1/messages/om_1/reply'));
  assert.equal(replyCalls.length, 1);
  assert.equal(replyCalls[0].body.msg_type, 'interactive');
});

test('search/latest/hot commands render Lark cards and text fallback', async () => {
  const { fetchImpl } = createRecordingFetch();
  const config = getConfig(baseConfig({ DDYS_LARK_SEARCH_CACHE_TTL: '0' }));

  const search = await handleLarkEventPayload(createMessageEvent('/ddys search matrix'), config, { fetch: fetchImpl });
  const latest = await handleLarkEventPayload(createMessageEvent('/ddys latest', { eventId: 'ev_2' }), config, { fetch: fetchImpl });
  const hot = await handleLarkEventPayload(createMessageEvent('/ddys 热门', { eventId: 'ev_3' }), config, { fetch: fetchImpl });

  assert.equal(search.type, 'reply');
  assert.equal(search.data.msg_type, 'interactive');
  assert.equal(JSON.parse(search.data.content).header.title.content, 'DDYS 搜索：matrix');
  assert.equal(JSON.parse(latest.data.content).header.title.content, 'DDYS 最新更新');
  assert.equal(JSON.parse(hot.data.content).header.title.content, 'DDYS 热门内容');

  const textConfig = getConfig(baseConfig({ DDYS_LARK_USE_CARD_MESSAGES: 'false' }));
  const text = await handleLarkEventPayload(createMessageEvent('/ddys search matrix'), textConfig, { fetch: fetchImpl });
  assert.equal(text.data.msg_type, 'text');
  assert.equal(JSON.parse(text.data.content).text.includes('DDYS 搜索：matrix'), true);
});

test('search commands can defer replies through waitUntil', async () => {
  const { fetchImpl, calls } = createRecordingFetch();
  const waitUntilPromises = [];
  const bot = createDdysLarkBot({ runtime: { fetch: fetchImpl, eventDeduper: createInteractionDeduper() } });
  const response = await bot.fetch(
    await signedRequest('https://example.com/lark/events', createMessageEvent('/ddys search matrix')),
    baseConfig({ DDYS_LARK_DEFER_REPLIES: 'true' }),
    { waitUntil: (promise) => waitUntilPromises.push(promise) }
  );

  assert.deepEqual(await readJson(response), { code: 0, msg: 'ok' });
  assert.equal(waitUntilPromises.length, 1);
  await Promise.all(waitUntilPromises);
  const reply = calls.find((call) => call.url.endsWith('/im/v1/messages/om_1/reply'));
  assert.equal(reply.body.msg_type, 'interactive');
});

test('private chats support bare search while group chats ignore unprefixed messages', async () => {
  const { fetchImpl } = createRecordingFetch();
  const config = getConfig(baseConfig());
  const group = await handleLarkEventPayload(createMessageEvent('matrix'), config, { fetch: fetchImpl });
  const p2p = await handleLarkEventPayload(createMessageEvent('matrix', { chatType: 'p2p', eventId: 'ev_p2p' }), config, { fetch: fetchImpl });

  assert.equal(group.type, 'ack');
  assert.equal(p2p.type, 'reply');
  assert.equal(JSON.parse(p2p.data.content).header.title.content, 'DDYS 搜索：matrix');
  assert.deepEqual(parseLarkCommand('/ddys 清缓存'), { name: 'clearcache', query: '', raw: '/ddys 清缓存' });
});

test('legacy event_callback message payloads are normalized and handled', async () => {
  const { fetchImpl } = createRecordingFetch();
  const config = getConfig(baseConfig());
  const payload = createLegacyMessageEvent('/ddys search matrix');
  const result = await handleLarkEventPayload(payload, config, { fetch: fetchImpl });
  assert.equal(isLarkMessageEvent(payload), true);
  assert.equal(result.messageId, 'om_legacy');
  assert.equal(result.data.msg_type, 'interactive');
  assert.equal(JSON.parse(result.data.content).header.title.content, 'DDYS 搜索：matrix');
});

test('legacy event_callback object content is handled without losing text fallback', async () => {
  const { fetchImpl } = createRecordingFetch();
  const config = getConfig(baseConfig());
  const payload = createLegacyMessageEvent('/ddys search matrix', {
    messageId: 'om_legacy_object',
    content: { text: '/ddys search matrix' }
  });
  const result = await handleLarkEventPayload(payload, config, { fetch: fetchImpl });
  assert.equal(result.messageId, 'om_legacy_object');
  assert.equal(JSON.parse(result.data.content).header.title.content, 'DDYS 搜索：matrix');
  assert.equal(extractTextFromMessage({ message_type: 'text', content: { text: '/ddys help' } }), '/ddys help');
});

test('post rich-text message content can carry DDYS commands', async () => {
  const { fetchImpl } = createRecordingFetch();
  const config = getConfig(baseConfig());
  const result = await handleLarkEventPayload(createPostMessageEvent('/ddys search matrix'), config, { fetch: fetchImpl });
  assert.equal(result.type, 'reply');
  assert.equal(JSON.parse(result.data.content).header.title.content, 'DDYS 搜索：matrix');
});

test('allowlists block unauthorized users, chats, and tenants', async () => {
  const config = getConfig(baseConfig({
    DDYS_LARK_ALLOWED_OPEN_IDS: 'ou_other',
    DDYS_LARK_ALLOWED_CHAT_IDS: 'oc_other',
    DDYS_LARK_ALLOWED_TENANT_KEYS: 'tenant-other'
  }));
  const result = await handleLarkEventPayload(createMessageEvent('/ddys help'), config, {});
  assert.equal(result.type, 'reply');
  assert.equal(JSON.parse(result.data.content).text.includes('没有对当前用户'), true);
});

test('admin commands require configured admins and can clear cache', async () => {
  const cache = createSearchCache();
  const deduper = createInteractionDeduper();
  cache.set('x', [{ id: '1', title: 'Cached' }], 60);
  deduper.mark('ev_1', 60);

  const nonAdmin = getConfig(baseConfig());
  const admin = getConfig(baseConfig({ DDYS_LARK_ADMIN_OPEN_IDS: 'ou_admin' }));
  const payload = createMessageEvent('/ddys clearcache');
  assert.equal(JSON.parse((await handleLarkCommand({ name: 'clearcache' }, payload, nonAdmin, { searchCache: cache, eventDeduper: deduper })).content).text.includes('没有对当前飞书用户开放'), true);
  const cleared = await handleLarkCommand({ name: 'clearcache' }, payload, admin, { searchCache: cache, eventDeduper: deduper });
  assert.equal(JSON.parse(cleared.content).text.includes('已清理 1 条搜索缓存和 1 条事件去重记录'), true);
});

test('health and diagnostics endpoints are sanitized and HEAD has no body', async () => {
  const env = baseConfig({ DDYS_LARK_ADMIN_OPEN_IDS: 'ou_admin' });
  const health = await handleLarkEvent(new Request('https://example.com/lark/health'), env);
  const diagnostics = await handleLarkEvent(new Request('https://example.com/lark/diagnostics'), env);
  const head = await handleLarkEvent(new Request('https://example.com/lark/health', { method: 'HEAD' }), env);
  const disabled = await handleLarkEvent(new Request('https://example.com/lark/diagnostics'), baseConfig({ DDYS_LARK_ENABLE_DIAGNOSTICS: 'false' }));
  assert.equal((await readJson(health)).service, 'ddys-lark-bot');
  const diag = await readJson(diagnostics);
  assert.equal(JSON.stringify(diag).includes('app-secret'), false);
  assert.equal(disabled.status, 404);
  assert.equal(await head.text(), '');
});

test('configuration rejects risky values and enforces Lark limits', async () => {
  assert.throws(() => getConfig(baseConfig({ DDYS_LARK_MAX_RESULTS: '11' })), /less than or equal to 10/);
  assert.throws(() => getConfig(baseConfig({ DDYS_LARK_MIN_QUERY_LENGTH: '0' })), /greater than zero/);
  assert.throws(() => getConfig(baseConfig({ DDYS_LARK_ALLOWED_OPEN_IDS: 'ou_x bad' })), /invalid identifier/);
  assert.throws(() => getConfig(baseConfig({ DDYS_LARK_EVENTS_PATH: 'lark' })), /start with/);
  assert.equal(getConfig({ FEISHU_APP_ID: 'cli_alias', FEISHU_VERIFICATION_TOKEN: 'token' }).appId, 'cli_alias');
});

test('search cache isolates endpoint kind and API base', async () => {
  const { fetchImpl, calls } = createRecordingFetch();
  const cache = createSearchCache();
  const first = getConfig(baseConfig({ DDYS_LARK_SEARCH_CACHE_TTL: '60' }));
  const second = getConfig(baseConfig({ DDYS_API_BASE: 'https://api-two.example.test/v1', DDYS_LARK_SEARCH_CACHE_TTL: '60' }));
  await searchDdys('matrix', first, { fetch: fetchImpl, searchCache: cache });
  await searchDdys('matrix', first, { fetch: fetchImpl, searchCache: cache });
  await searchDdys('matrix', second, { fetch: fetchImpl, searchCache: cache });
  assert.equal(calls.filter((call) => call.url.includes('/search?')).length, 2);
});

test('Lark API helpers fetch tenant token and call message endpoints', async () => {
  const { fetchImpl, calls } = createRecordingFetch();
  const config = getConfig(baseConfig({ DDYS_LARK_TENANT_ACCESS_TOKEN: '' }));
  const tokenCache = { key: '', token: '', expiresAt: 0 };
  const runtime = { fetch: fetchImpl, tenantTokenCache: tokenCache, now: () => 1000 };

  assert.equal(await getTenantAccessToken(config, runtime), 'tenant-token');
  assert.equal(await getTenantAccessToken(config, runtime), 'tenant-token');
  await replyMessage('om_1', { msg_type: 'text', content: '{"text":"done"}' }, config, runtime);
  await sendMessage('open_id', 'ou_admin', { msg_type: 'text', content: '{"text":"hi"}' }, config, runtime);
  await updateMessage('om_1', { msg_type: 'text', content: '{"text":"updated"}' }, config, runtime);

  assert.equal(calls.filter((call) => call.url.endsWith('/auth/v3/tenant_access_token/internal')).length, 1);
  assert.equal(calls.some((call) => call.url.endsWith('/im/v1/messages/om_1/reply') && call.init.method === 'POST'), true);
  assert.equal(calls.some((call) => call.url.includes('/im/v1/messages?receive_id_type=open_id')), true);
  assert.equal(calls.some((call) => call.url.endsWith('/im/v1/messages/om_1') && call.init.method === 'PATCH'), true);
});

test('normalizers and card helpers clamp Lark payloads', async () => {
  const config = getConfig(baseConfig());
  const results = normalizeItems({
    result: {
      list: [{ vod_id: 88, vod_name: 'Relative Poster', vod_pic: '/x.jpg', detailUrl: '/movie/88', content: '<p>Hello world</p>' }]
    }
  }, config);
  assert.equal(results[0].poster, 'https://ddys.example.test/x.jpg');
  assert.equal(results[0].description, 'Hello world');

  const card = resultsToCard('Title', Array.from({ length: 12 }, (_, index) => ({ ...results[0], id: String(index), title: `Movie ${index}` })), config);
  assert.equal(card.elements.filter((element) => element.tag === 'div').length, 5);
  assert.equal(card.elements.at(-1).actions.length, 5);
});

test('missing encrypt key skips signature but token validation still protects callbacks', async () => {
  const body = JSON.stringify(createUrlVerification('skip-signature'));
  const result = await verifyLarkRequest(new Headers(), body, getConfig(baseConfig({ DDYS_LARK_ENCRYPT_KEY: '' })));
  assert.equal(result.ok, true);

  const response = await handleLarkEvent(new Request('https://example.com/lark/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body
  }), baseConfig({ DDYS_LARK_ENCRYPT_KEY: '' }));
  assert.deepEqual(await readJson(response), { challenge: 'skip-signature' });
});
