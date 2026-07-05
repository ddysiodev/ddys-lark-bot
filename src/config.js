export const VERSION = '0.1.1';

export const DEFAULTS = {
  apiBase: 'https://ddys.io/api/v1',
  publicBase: 'https://ddys.io',
  larkApiBase: 'https://open.feishu.cn/open-apis',
  eventsPath: '/lark/events',
  appId: '',
  appSecret: '',
  tenantAccessToken: '',
  verificationToken: '',
  encryptKey: '',
  allowedOpenIds: '',
  allowedUserIds: '',
  allowedChatIds: '',
  allowedTenantKeys: '',
  adminOpenIds: '',
  adminUserIds: '',
  maxResults: 5,
  minQueryLength: 2,
  requestTimeoutMs: 12000,
  searchCacheTtl: 300,
  eventDedupeTtl: 900,
  signatureToleranceSeconds: 300,
  replyMessages: true,
  deferReplies: true,
  useCardMessages: true,
  enableDiagnostics: true,
  userAgent: `ddys-lark-bot/${VERSION}`,
  debug: false
};

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function getConfig(env = {}, overrides = {}) {
  const input = { ...readConfigFromEnv(env), ...dropUndefined(overrides) };
  return {
    apiBase: normalizeBaseUrl(readValue(input.apiBase, DEFAULTS.apiBase), 'DDYS_API_BASE'),
    publicBase: normalizeBaseUrl(readValue(input.publicBase, DEFAULTS.publicBase), 'DDYS_PUBLIC_BASE'),
    larkApiBase: normalizeBaseUrl(readValue(input.larkApiBase, DEFAULTS.larkApiBase), 'DDYS_LARK_API_BASE'),
    eventsPath: normalizeEventsPath(readValue(input.eventsPath, DEFAULTS.eventsPath)),
    appId: normalizeOptionalToken(readValue(input.appId, DEFAULTS.appId), 'DDYS_LARK_APP_ID'),
    appSecret: String(readValue(input.appSecret, DEFAULTS.appSecret)).trim(),
    tenantAccessToken: String(readValue(input.tenantAccessToken, DEFAULTS.tenantAccessToken)).trim(),
    verificationToken: String(readValue(input.verificationToken, DEFAULTS.verificationToken)).trim(),
    encryptKey: String(readValue(input.encryptKey, DEFAULTS.encryptKey)).trim(),
    allowedOpenIds: parseIdSet(readValue(input.allowedOpenIds, DEFAULTS.allowedOpenIds), 'DDYS_LARK_ALLOWED_OPEN_IDS'),
    allowedUserIds: parseIdSet(readValue(input.allowedUserIds, DEFAULTS.allowedUserIds), 'DDYS_LARK_ALLOWED_USER_IDS'),
    allowedChatIds: parseIdSet(readValue(input.allowedChatIds, DEFAULTS.allowedChatIds), 'DDYS_LARK_ALLOWED_CHAT_IDS'),
    allowedTenantKeys: parseIdSet(readValue(input.allowedTenantKeys, DEFAULTS.allowedTenantKeys), 'DDYS_LARK_ALLOWED_TENANT_KEYS'),
    adminOpenIds: parseIdSet(readValue(input.adminOpenIds, DEFAULTS.adminOpenIds), 'DDYS_LARK_ADMIN_OPEN_IDS'),
    adminUserIds: parseIdSet(readValue(input.adminUserIds, DEFAULTS.adminUserIds), 'DDYS_LARK_ADMIN_USER_IDS'),
    maxResults: parsePositiveInteger(readValue(input.maxResults, DEFAULTS.maxResults), 'DDYS_LARK_MAX_RESULTS', 10),
    minQueryLength: parsePositiveInteger(readValue(input.minQueryLength, DEFAULTS.minQueryLength), 'DDYS_LARK_MIN_QUERY_LENGTH', 64),
    requestTimeoutMs: parseNonNegativeInteger(readValue(input.requestTimeoutMs, DEFAULTS.requestTimeoutMs), 'DDYS_LARK_REQUEST_TIMEOUT_MS'),
    searchCacheTtl: parseNonNegativeInteger(readValue(input.searchCacheTtl, DEFAULTS.searchCacheTtl), 'DDYS_LARK_SEARCH_CACHE_TTL'),
    eventDedupeTtl: parseNonNegativeInteger(readValue(input.eventDedupeTtl, DEFAULTS.eventDedupeTtl), 'DDYS_LARK_EVENT_DEDUPE_TTL'),
    signatureToleranceSeconds: parseNonNegativeInteger(readValue(input.signatureToleranceSeconds, DEFAULTS.signatureToleranceSeconds), 'DDYS_LARK_SIGNATURE_TOLERANCE_SECONDS'),
    replyMessages: parseBoolean(readValue(input.replyMessages, DEFAULTS.replyMessages), 'DDYS_LARK_REPLY_MESSAGES'),
    deferReplies: parseBoolean(readValue(input.deferReplies, DEFAULTS.deferReplies), 'DDYS_LARK_DEFER_REPLIES'),
    useCardMessages: parseBoolean(readValue(input.useCardMessages, DEFAULTS.useCardMessages), 'DDYS_LARK_USE_CARD_MESSAGES'),
    enableDiagnostics: parseBoolean(readValue(input.enableDiagnostics, DEFAULTS.enableDiagnostics), 'DDYS_LARK_ENABLE_DIAGNOSTICS'),
    userAgent: String(readValue(input.userAgent, DEFAULTS.userAgent)).trim() || DEFAULTS.userAgent,
    debug: parseBoolean(readValue(input.debug, DEFAULTS.debug), 'DDYS_DEBUG')
  };
}

export function readConfigFromEnv(env = {}) {
  return {
    apiBase: readEnv(env, 'DDYS_API_BASE', readEnv(env, 'API_BASE_URL')),
    publicBase: readEnv(env, 'DDYS_PUBLIC_BASE', readEnv(env, 'PUBLIC_BASE_URL')),
    larkApiBase: readEnv(env, 'DDYS_LARK_API_BASE', readEnv(env, 'LARK_API_BASE', readEnv(env, 'FEISHU_API_BASE'))),
    eventsPath: readEnv(env, 'DDYS_LARK_EVENTS_PATH', readEnv(env, 'LARK_EVENTS_PATH', readEnv(env, 'FEISHU_EVENTS_PATH'))),
    appId: readEnv(env, 'DDYS_LARK_APP_ID', readEnv(env, 'LARK_APP_ID', readEnv(env, 'FEISHU_APP_ID'))),
    appSecret: readEnv(env, 'DDYS_LARK_APP_SECRET', readEnv(env, 'LARK_APP_SECRET', readEnv(env, 'FEISHU_APP_SECRET'))),
    tenantAccessToken: readEnv(env, 'DDYS_LARK_TENANT_ACCESS_TOKEN', readEnv(env, 'LARK_TENANT_ACCESS_TOKEN', readEnv(env, 'FEISHU_TENANT_ACCESS_TOKEN'))),
    verificationToken: readEnv(env, 'DDYS_LARK_VERIFICATION_TOKEN', readEnv(env, 'LARK_VERIFICATION_TOKEN', readEnv(env, 'FEISHU_VERIFICATION_TOKEN'))),
    encryptKey: readEnv(env, 'DDYS_LARK_ENCRYPT_KEY', readEnv(env, 'LARK_ENCRYPT_KEY', readEnv(env, 'FEISHU_ENCRYPT_KEY'))),
    allowedOpenIds: readEnv(env, 'DDYS_LARK_ALLOWED_OPEN_IDS', readEnv(env, 'LARK_ALLOWED_OPEN_IDS', readEnv(env, 'FEISHU_ALLOWED_OPEN_IDS'))),
    allowedUserIds: readEnv(env, 'DDYS_LARK_ALLOWED_USER_IDS', readEnv(env, 'LARK_ALLOWED_USER_IDS', readEnv(env, 'FEISHU_ALLOWED_USER_IDS'))),
    allowedChatIds: readEnv(env, 'DDYS_LARK_ALLOWED_CHAT_IDS', readEnv(env, 'LARK_ALLOWED_CHAT_IDS', readEnv(env, 'FEISHU_ALLOWED_CHAT_IDS'))),
    allowedTenantKeys: readEnv(env, 'DDYS_LARK_ALLOWED_TENANT_KEYS', readEnv(env, 'LARK_ALLOWED_TENANT_KEYS', readEnv(env, 'FEISHU_ALLOWED_TENANT_KEYS'))),
    adminOpenIds: readEnv(env, 'DDYS_LARK_ADMIN_OPEN_IDS', readEnv(env, 'LARK_ADMIN_OPEN_IDS', readEnv(env, 'FEISHU_ADMIN_OPEN_IDS'))),
    adminUserIds: readEnv(env, 'DDYS_LARK_ADMIN_USER_IDS', readEnv(env, 'LARK_ADMIN_USER_IDS', readEnv(env, 'FEISHU_ADMIN_USER_IDS'))),
    maxResults: readEnv(env, 'DDYS_LARK_MAX_RESULTS'),
    minQueryLength: readEnv(env, 'DDYS_LARK_MIN_QUERY_LENGTH'),
    requestTimeoutMs: readEnv(env, 'DDYS_LARK_REQUEST_TIMEOUT_MS', readEnv(env, 'UPSTREAM_TIMEOUT_MS')),
    searchCacheTtl: readEnv(env, 'DDYS_LARK_SEARCH_CACHE_TTL'),
    eventDedupeTtl: readEnv(env, 'DDYS_LARK_EVENT_DEDUPE_TTL'),
    signatureToleranceSeconds: readEnv(env, 'DDYS_LARK_SIGNATURE_TOLERANCE_SECONDS'),
    replyMessages: readEnv(env, 'DDYS_LARK_REPLY_MESSAGES'),
    deferReplies: readEnv(env, 'DDYS_LARK_DEFER_REPLIES'),
    useCardMessages: readEnv(env, 'DDYS_LARK_USE_CARD_MESSAGES'),
    enableDiagnostics: readEnv(env, 'DDYS_LARK_ENABLE_DIAGNOSTICS'),
    userAgent: readEnv(env, 'DDYS_USER_AGENT', readEnv(env, 'USER_AGENT')),
    debug: readEnv(env, 'DDYS_DEBUG', readEnv(env, 'DEBUG'))
  };
}

export function parseBoolean(value, name = 'boolean value') {
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new ConfigError(`${name} must be a boolean value.`);
}

export function parseIdSet(value, name = 'id list') {
  const raw = String(value || '').trim();
  const ids = new Set();
  if (!raw) return ids;
  for (const item of raw.split(',')) {
    const id = normalizeOptionalToken(item, name);
    if (id) ids.add(id);
  }
  return ids;
}

export function normalizeOptionalToken(value, name = 'Lark ID') {
  const id = String(value || '').trim();
  if (!id) return '';
  if (/[\s,]/.test(id) || id.length > 256) throw new ConfigError(`${name} contains an invalid identifier.`);
  return id;
}

export function normalizeEventsPath(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') throw new ConfigError('DDYS_LARK_EVENTS_PATH must be a non-root path such as /lark/events.');
  if (!raw.startsWith('/')) throw new ConfigError('DDYS_LARK_EVENTS_PATH must start with /.');
  if (raw.includes('?') || raw.includes('#') || raw.includes('\\')) throw new ConfigError('DDYS_LARK_EVENTS_PATH must be a clean path.');
  if (raw.includes('//') || /%2f|%5c/i.test(raw)) throw new ConfigError('DDYS_LARK_EVENTS_PATH must not contain duplicate or encoded slashes.');
  return raw.replace(/\/+$/, '');
}

function parsePositiveInteger(value, name, max) {
  const number = parseNonNegativeInteger(value, name);
  if (number <= 0) throw new ConfigError(`${name} must be greater than zero.`);
  if (number > max) throw new ConfigError(`${name} must be less than or equal to ${max}.`);
  return number;
}

function parseNonNegativeInteger(value, name) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw new ConfigError(`${name} must be a non-negative integer.`);
  const number = Number(text);
  if (!Number.isSafeInteger(number)) throw new ConfigError(`${name} must be a safe non-negative integer.`);
  return number;
}

function normalizeBaseUrl(value, name) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new ConfigError(`${name} must be a valid URL.`);
  }
  if (url.protocol !== 'https:') throw new ConfigError(`${name} must use https.`);
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function dropUndefined(value) {
  const output = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (item !== undefined) output[key] = item;
  }
  return output;
}

function readEnv(env, primary, fallback = undefined) {
  const value = env?.[primary];
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}

function readValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}
