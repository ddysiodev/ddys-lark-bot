import { DEFAULTS, VERSION, getConfig } from './config.js';
import { sharedInteractionDeduper as sharedEventDeduper, sharedSearchCache } from './cache-store.js';
import { getHot, getLatest, searchDdys } from './ddys-client.js';
import { replyMessage } from './lark-api.js';
import { ackResponse, extractTextFromMessage, parseLarkCommand, renderDiagnostics, renderHelp, renderResultMessage, textMessage } from './format.js';
import { json, jsonForMethod, text } from './response.js';
import {
  LarkSecurityError,
  decodeLarkEventBody,
  getLarkEventId,
  getLarkEventType,
  getLarkMessage,
  getUrlVerificationChallenge,
  isActorAllowed,
  isAdmin,
  isUrlVerification,
  verifyLarkRequest,
  verifyVerificationToken
} from './security.js';

export { DEFAULTS, VERSION, ConfigError, getConfig, parseBoolean, parseIdSet, normalizeOptionalToken, normalizeEventsPath } from './config.js';
export { TimedMap, SearchCache, InteractionDeduper, createSearchCache, createInteractionDeduper, sharedSearchCache, sharedInteractionDeduper, normalizeQuery, buildCacheKey } from './cache-store.js';
export { searchDdys, getLatest, getHot, fetchDdysList, buildDdysUrl, normalizeItems, extractItems, normalizeItem } from './ddys-client.js';
export { LARK_ENDPOINTS, callLarkApi, getTenantAccessToken, replyMessage, sendMessage, sharedTenantTokenCache, updateMessage } from './lark-api.js';
export { LarkSecurityError, decodeLarkEventBody, decryptLarkEncrypt, getLarkChatId, getLarkEventId, getLarkEventType, getLarkMessage, getLarkSenderIds, getLarkTenantKey, getUrlVerificationChallenge, getVerificationToken, isActorAllowed, isAdmin, isUrlVerification, verifyLarkRequest, verifyVerificationToken } from './security.js';
export { LarkEventType, LarkMessageType, ackResponse, cardMessage, extractTextFromMessage, parseLarkCommand, renderDiagnostics, renderHelp, renderResultMessage, resultButtons, resultsToCard, resultsToTextLines, textMessage } from './format.js';

export function createDdysLarkBot(options = {}) {
  return {
    fetch(request, env = {}, context = {}) {
      return handleLarkEvent(request, env, context, options);
    }
  };
}

export function createLarkEventHandler(options = {}) {
  return (request, env = {}, context = {}) => handleLarkEvent(request, env, context, options);
}

export async function handleLarkEvent(request, env = {}, context = {}, options = {}) {
  const config = { ...getConfig(resolveEnv(env), options.config), version: VERSION };
  const runtime = {
    fetch: options.runtime?.fetch || options.fetch,
    searchCache: options.runtime?.searchCache || options.searchCache || sharedSearchCache,
    eventDeduper: options.runtime?.eventDeduper || options.eventDeduper || sharedEventDeduper,
    tenantTokenCache: options.runtime?.tenantTokenCache || options.tenantTokenCache,
    now: options.runtime?.now || options.now || (() => Date.now())
  };
  const url = new URL(request.url);

  if (url.pathname === `${config.eventsPath}/health` || url.pathname === '/lark/health') {
    return request.method === 'GET' || request.method === 'HEAD'
      ? jsonForMethod(request.method, { ok: true, service: 'ddys-lark-bot', version: VERSION })
      : methodNotAllowed('GET, HEAD');
  }

  if (url.pathname === `${config.eventsPath}/diagnostics` || url.pathname === '/lark/diagnostics') {
    if (!config.enableDiagnostics) return text('Not found', { status: 404 });
    if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD');
    return jsonForMethod(request.method, {
      ok: true,
      version: VERSION,
      eventsPath: config.eventsPath,
      apiBase: config.apiBase,
      larkApiBase: config.larkApiBase,
      replyMessages: config.replyMessages,
      deferReplies: config.deferReplies,
      useCardMessages: config.useCardMessages,
      searchCacheItems: runtime.searchCache?.size ?? 0,
      eventDedupeItems: runtime.eventDeduper?.size ?? 0
    });
  }

  if (url.pathname !== config.eventsPath) {
    return text(`DDYS Lark events are mounted at ${config.eventsPath}.`, { status: 404 });
  }
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const rawBody = await request.text();
  const signature = await verifyLarkRequest(request.headers, rawBody, config, runtime.now);
  if (!signature.ok) return text(signature.message, { status: signature.status });

  let payload;
  try {
    payload = await decodeLarkEventBody(rawBody, config);
  } catch (error) {
    if (error instanceof LarkSecurityError) return text(error.message, { status: error.status });
    return text('Invalid Lark callback payload.', { status: 400 });
  }

  const token = verifyVerificationToken(payload, config);
  if (!token.ok) return text(token.message, { status: token.status });

  if (isUrlVerification(payload)) {
    const challenge = getUrlVerificationChallenge(payload);
    return json({ challenge });
  }

  if (isDuplicateEvent(payload, config, runtime)) {
    return json(ackResponse('duplicate'));
  }

  try {
    const resultPromise = handleLarkEventPayload(payload, config, runtime, context);
    if (shouldDeferReply(config, context)) {
      markEvent(payload, config, runtime);
      context.waitUntil(resultPromise
        .then((result) => deliverLarkReply(result, config, runtime))
        .catch(() => null));
      return json(ackResponse());
    }

    const result = await resultPromise;
    markEvent(payload, config, runtime);
    await deliverLarkReply(result, config, runtime);
    return json(ackResponse());
  } catch (error) {
    const message = config.debug ? `DDYS Lark bot failed: ${error?.message || 'unknown error'}` : 'DDYS Lark bot is temporarily unavailable.';
    return json(ackResponse(message));
  }
}

export const handleRequest = handleLarkEvent;

export default createDdysLarkBot();

export async function handleLarkEventPayload(payload, config, runtime = {}) {
  if (!payload || typeof payload !== 'object') return { type: 'ack', data: ackResponse('unsupported') };
  if (isUrlVerification(payload)) return { type: 'challenge', data: { challenge: getUrlVerificationChallenge(payload) } };
  if (getLarkEventType(payload) !== 'im.message.receive_v1') return { type: 'ack', data: ackResponse('ignored') };
  if (!isActorAllowed(payload, config)) {
    return {
      type: 'reply',
      messageId: getLarkMessage(payload).message_id,
      data: textMessage('这个 DDYS 飞书机器人没有对当前用户、会话或租户开放。')
    };
  }

  const message = getLarkMessage(payload);
  const command = parseLarkCommand(extractTextFromMessage(message), message);
  if (!command.name) return { type: 'ack', data: ackResponse('ignored') };
  const data = await handleLarkCommand(command, payload, config, runtime);
  return { type: 'reply', messageId: message.message_id, data };
}

export async function handleLarkCommand(command, payload, config, runtime = {}) {
  const name = String(command?.name || '').toLowerCase();
  if (name === 'help') return textMessage(renderHelp(config));
  if (name === 'search') return commandSearch(command, config, runtime);
  if (name === 'latest') return commandList('latest', '', config, runtime);
  if (name === 'hot') return commandList('hot', '', config, runtime);
  if (name === 'diag') {
    if (!isAdmin(payload, config)) return textMessage('这个管理员命令没有对当前飞书用户开放。');
    return textMessage(renderDiagnostics(config, runtime));
  }
  if (name === 'clearcache') {
    if (!isAdmin(payload, config)) return textMessage('这个管理员命令没有对当前飞书用户开放。');
    const search = runtime.searchCache?.clear?.() ?? 0;
    const dedupe = runtime.eventDeduper?.clear?.() ?? 0;
    return textMessage(`已清理 ${search} 条搜索缓存和 ${dedupe} 条事件去重记录。`);
  }
  return textMessage(renderHelp(config));
}

export async function deliverLarkReply(result, config, runtime = {}) {
  if (!config.replyMessages || result?.type !== 'reply' || !result.messageId || !result.data) return null;
  return replyMessage(result.messageId, result.data, config, runtime);
}

async function commandSearch(command, config, runtime) {
  const query = String(command?.query || '').trim();
  if (query.length < config.minQueryLength) {
    return textMessage(`搜索关键词至少需要 ${config.minQueryLength} 个字符。`);
  }
  try {
    const results = await searchDdys(query, config, runtime);
    return renderResultMessage('search', query, results, config);
  } catch (error) {
    return textMessage(config.debug ? `DDYS 搜索失败：${error?.message}` : 'DDYS 搜索服务暂时不可用。');
  }
}

async function commandList(kind, query, config, runtime) {
  try {
    const results = kind === 'latest' ? await getLatest(config, runtime) : await getHot(config, runtime);
    return renderResultMessage(kind, query, results, config);
  } catch (error) {
    return textMessage(config.debug ? `DDYS ${kind} failed: ${error?.message}` : `DDYS ${kind} 暂时不可用。`);
  }
}

function isDuplicateEvent(payload, config, runtime) {
  if (!config.eventDedupeTtl || config.eventDedupeTtl <= 0) return false;
  const eventId = getLarkEventId(payload);
  if (!eventId) return false;
  return runtime.eventDeduper?.has?.(eventId) === true;
}

function markEvent(payload, config, runtime) {
  if (!config.eventDedupeTtl || config.eventDedupeTtl <= 0) return;
  const eventId = getLarkEventId(payload);
  if (!eventId) return;
  runtime.eventDeduper?.mark?.(eventId, config.eventDedupeTtl);
}

function shouldDeferReply(config, context) {
  return config.deferReplies && typeof context?.waitUntil === 'function';
}

function methodNotAllowed(allow) {
  return text('Method not allowed', { status: 405, headers: { allow } });
}

function resolveEnv(env) {
  if (env && Object.keys(env).length > 0) return env;
  return globalThis.process?.env || {};
}
