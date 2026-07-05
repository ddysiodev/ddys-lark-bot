export interface DdysLarkConfigInput {
  apiBase?: string;
  publicBase?: string;
  larkApiBase?: string;
  eventsPath?: string;
  appId?: string;
  appSecret?: string;
  tenantAccessToken?: string;
  verificationToken?: string;
  encryptKey?: string;
  allowedOpenIds?: string;
  allowedUserIds?: string;
  allowedChatIds?: string;
  allowedTenantKeys?: string;
  adminOpenIds?: string;
  adminUserIds?: string;
  maxResults?: number | string;
  minQueryLength?: number | string;
  requestTimeoutMs?: number | string;
  searchCacheTtl?: number | string;
  eventDedupeTtl?: number | string;
  signatureToleranceSeconds?: number | string;
  replyMessages?: boolean | string;
  deferReplies?: boolean | string;
  useCardMessages?: boolean | string;
  enableDiagnostics?: boolean | string;
  userAgent?: string;
  debug?: boolean | string;
}

export interface DdysLarkConfig {
  apiBase: string;
  publicBase: string;
  larkApiBase: string;
  eventsPath: string;
  appId: string;
  appSecret: string;
  tenantAccessToken: string;
  verificationToken: string;
  encryptKey: string;
  allowedOpenIds: Set<string>;
  allowedUserIds: Set<string>;
  allowedChatIds: Set<string>;
  allowedTenantKeys: Set<string>;
  adminOpenIds: Set<string>;
  adminUserIds: Set<string>;
  maxResults: number;
  minQueryLength: number;
  requestTimeoutMs: number;
  searchCacheTtl: number;
  eventDedupeTtl: number;
  signatureToleranceSeconds: number;
  replyMessages: boolean;
  deferReplies: boolean;
  useCardMessages: boolean;
  enableDiagnostics: boolean;
  userAgent: string;
  debug: boolean;
  version?: string;
}

export interface DdysLarkRuntime {
  fetch?: typeof fetch;
  searchCache?: SearchCache;
  eventDeduper?: InteractionDeduper;
  tenantTokenCache?: TenantTokenCache;
  now?: () => number;
}

export interface DdysLarkOptions {
  config?: DdysLarkConfigInput;
  runtime?: DdysLarkRuntime;
  fetch?: typeof fetch;
  searchCache?: SearchCache;
  eventDeduper?: InteractionDeduper;
  tenantTokenCache?: TenantTokenCache;
  now?: () => number;
}

export interface LarkBot {
  fetch(request: Request, env?: Record<string, unknown>, context?: unknown): Promise<Response>;
}

export interface SearchResult {
  id: string;
  title: string;
  year: string;
  region: string;
  type: string;
  description: string;
  poster: string;
  url: string;
  raw: Record<string, unknown>;
}

export interface TenantTokenCache {
  key: string;
  token: string;
  expiresAt: number;
}

export class ConfigError extends Error {}
export class LarkSecurityError extends Error {
  status: number;
}
export class TimedMap {
  constructor(now?: () => number);
  get(key: unknown): unknown;
  set(key: unknown, value: unknown, ttlSeconds: number): boolean;
  has(key: unknown): boolean;
  delete(key: unknown): boolean;
  clear(): number;
  readonly size: number;
}
export class SearchCache extends TimedMap {}
export class InteractionDeduper extends TimedMap {
  mark(id: unknown, ttlSeconds: number): boolean;
}

export const VERSION: string;
export const DEFAULTS: Required<DdysLarkConfigInput>;
export const LARK_ENDPOINTS: Record<string, string>;
export const sharedSearchCache: SearchCache;
export const sharedInteractionDeduper: InteractionDeduper;
export const sharedTenantTokenCache: TenantTokenCache;
export const LarkEventType: Record<string, string>;
export const LarkMessageType: Record<string, string>;

export function getConfig(env?: Record<string, unknown>, overrides?: DdysLarkConfigInput): DdysLarkConfig;
export function parseBoolean(value: unknown, name?: string): boolean;
export function parseIdSet(value: unknown, name?: string): Set<string>;
export function normalizeOptionalToken(value: unknown, name?: string): string;
export function normalizeEventsPath(value: string): string;

export function createSearchCache(): SearchCache;
export function createInteractionDeduper(): InteractionDeduper;
export function normalizeQuery(value: unknown): string;
export function buildCacheKey(kind: string, query: string, config: DdysLarkConfig, limit: number): string;

export function createDdysLarkBot(options?: DdysLarkOptions): LarkBot;
export function createLarkEventHandler(options?: DdysLarkOptions): (request: Request, env?: Record<string, unknown>, context?: unknown) => Promise<Response>;
export function handleLarkEvent(request: Request, env?: Record<string, unknown>, context?: unknown, options?: DdysLarkOptions): Promise<Response>;
export const handleRequest: typeof handleLarkEvent;
declare const defaultBot: LarkBot;
export default defaultBot;

export function handleLarkEventPayload(payload: Record<string, unknown>, config: DdysLarkConfig, runtime?: DdysLarkRuntime, context?: unknown): Promise<Record<string, unknown>>;
export function handleLarkCommand(command: Record<string, unknown>, payload: Record<string, unknown>, config: DdysLarkConfig, runtime?: DdysLarkRuntime): Promise<Record<string, unknown>>;
export function deliverLarkReply(result: Record<string, unknown>, config: DdysLarkConfig, runtime?: DdysLarkRuntime): Promise<unknown>;

export function verifyLarkRequest(headers: Headers, rawBody: string, config: DdysLarkConfig, now?: () => number): Promise<{ ok: true; skipped?: boolean } | { ok: false; status: number; message: string }>;
export function decodeLarkEventBody(rawBody: string, config: DdysLarkConfig): Promise<Record<string, unknown>>;
export function decryptLarkEncrypt(encrypted: string, encryptKey: string): Promise<string>;
export function verifyVerificationToken(payload: Record<string, unknown>, config: DdysLarkConfig): { ok: true } | { ok: false; status: number; message: string };
export function getVerificationToken(payload: Record<string, unknown>): string;
export function isUrlVerification(payload: Record<string, unknown>): boolean;
export function getUrlVerificationChallenge(payload: Record<string, unknown>): string;
export function getLarkEventId(payload: Record<string, unknown>): string;
export function getLarkEventType(payload: Record<string, unknown>): string;
export function isLarkMessageEvent(payload: Record<string, unknown>): boolean;
export function getLarkSenderIds(payload: Record<string, unknown>): { openId: string; userId: string; unionId: string };
export function getLarkMessage(payload: Record<string, unknown>): Record<string, unknown>;
export function getLarkChatId(payload: Record<string, unknown>): string;
export function getLarkTenantKey(payload: Record<string, unknown>): string;
export function isActorAllowed(payload: Record<string, unknown>, config: DdysLarkConfig): boolean;
export function isAdmin(payload: Record<string, unknown>, config: DdysLarkConfig): boolean;

export function searchDdys(query: string, config: DdysLarkConfig, runtime?: DdysLarkRuntime): Promise<SearchResult[]>;
export function getLatest(config: DdysLarkConfig, runtime?: DdysLarkRuntime): Promise<SearchResult[]>;
export function getHot(config: DdysLarkConfig, runtime?: DdysLarkRuntime): Promise<SearchResult[]>;
export function fetchDdysList(kind: string, query: string, config: DdysLarkConfig, runtime?: DdysLarkRuntime, limit?: number): Promise<SearchResult[]>;
export function buildDdysUrl(kind: string, query: string, config: DdysLarkConfig, limit?: number): string;
export function normalizeItems(payload: unknown, config: DdysLarkConfig): SearchResult[];
export function extractItems(payload: unknown): unknown[];
export function normalizeItem(item: unknown, index: number, config: DdysLarkConfig): SearchResult;

export function callLarkApi(pathname: string, payload: unknown, config: DdysLarkConfig, runtime?: DdysLarkRuntime, method?: string): Promise<unknown>;
export function getTenantAccessToken(config: DdysLarkConfig, runtime?: DdysLarkRuntime): Promise<string>;
export function replyMessage(messageId: string, payload: Record<string, unknown>, config: DdysLarkConfig, runtime?: DdysLarkRuntime): Promise<unknown>;
export function sendMessage(receiveIdType: string, receiveId: string, payload: Record<string, unknown>, config: DdysLarkConfig, runtime?: DdysLarkRuntime): Promise<unknown>;
export function updateMessage(messageId: string, payload: Record<string, unknown>, config: DdysLarkConfig, runtime?: DdysLarkRuntime): Promise<unknown>;

export function ackResponse(message?: string): Record<string, unknown>;
export function textMessage(content: string): Record<string, unknown>;
export function cardMessage(card: Record<string, unknown>): Record<string, unknown>;
export function renderHelp(config: DdysLarkConfig): string;
export function renderDiagnostics(config: DdysLarkConfig, runtime?: DdysLarkRuntime): string;
export function renderResultMessage(kind: string, query: string, results: SearchResult[], config: DdysLarkConfig): Record<string, unknown>;
export function resultsToCard(title: string, results: SearchResult[], config: DdysLarkConfig): Record<string, unknown>;
export function resultsToTextLines(results: SearchResult[], config: DdysLarkConfig): string[];
export function resultButtons(results: SearchResult[]): unknown[];
export function parseLarkCommand(text: string, message?: Record<string, unknown>): { name: string; query: string; raw: string };
export function extractTextFromMessage(message: Record<string, unknown>): string;
export function extractTextFromPostContent(content: Record<string, unknown>): string;
