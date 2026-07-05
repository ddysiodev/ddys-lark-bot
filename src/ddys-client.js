import { buildCacheKey, normalizeQuery, sharedSearchCache } from './cache-store.js';
import { createTimeoutSignal } from './response.js';

export async function searchDdys(query, config, runtime = {}) {
  const normalized = normalizeQuery(query);
  if (normalized.length < config.minQueryLength) return [];
  return fetchDdysList('search', normalized, config, runtime, config.maxResults);
}

export async function getLatest(config, runtime = {}) {
  return fetchDdysList('latest', '', config, runtime, config.maxResults);
}

export async function getHot(config, runtime = {}) {
  return fetchDdysList('hot', '', config, runtime, config.maxResults);
}

export async function fetchDdysList(kind, query, config, runtime = {}, limit = config.maxResults) {
  const cache = runtime.searchCache || sharedSearchCache;
  const key = buildCacheKey(kind, query, config, limit);
  const cached = config.searchCacheTtl > 0 ? cache.get(key) : undefined;
  if (cached) return cached;

  const fetchImpl = runtime.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

  const url = buildDdysUrl(kind, query, config, limit);
  const timeout = createTimeoutSignal(config.requestTimeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': config.userAgent },
      signal: timeout.signal
    });
  } finally {
    timeout.cancel();
  }
  if (!response.ok) throw new Error(`DDYS ${kind} failed with HTTP ${response.status}.`);

  const payload = await response.json();
  const results = normalizeItems(payload, config).slice(0, limit);
  if (config.searchCacheTtl > 0) cache.set(key, results, config.searchCacheTtl);
  return results;
}

export function buildDdysUrl(kind, query, config, limit = config.maxResults) {
  const route = kind === 'search' ? 'search' : kind;
  const url = new URL(`${config.apiBase}/${route}`);
  if (kind === 'search') url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  return url.toString();
}

export function normalizeItems(payload, config) {
  return extractItems(payload)
    .map((item, index) => normalizeItem(item, index, config))
    .filter((item) => item.title);
}

export function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const candidate of [
    payload.items,
    payload.results,
    payload.list,
    payload.data,
    payload.data?.items,
    payload.data?.results,
    payload.data?.list,
    payload.data?.records,
    payload.result?.items,
    payload.result?.results,
    payload.result?.list
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function normalizeItem(item, index, config) {
  const source = item && typeof item === 'object' ? item : {};
  const id = readFirst(source, ['id', 'movie_id', 'movieId', 'vod_id', 'slug', 'uuid']) || String(index + 1);
  const title = cleanText(readFirst(source, ['title', 'name', 'movie_title', 'vod_name', 'cn_name', 'zh_title']));
  const year = cleanText(readFirst(source, ['year', 'release_year', 'date', 'pubdate']));
  const region = cleanText(readFirst(source, ['region', 'area', 'country']));
  const type = cleanText(readFirst(source, ['type', 'category', 'kind', 'module']));
  const description = cleanText(readFirst(source, ['description', 'intro', 'summary', 'content', 'plot', 'overview']));
  const poster = absoluteUrl(readFirst(source, ['poster', 'cover', 'image', 'thumbnail', 'pic', 'vod_pic']), config);
  const url = absoluteUrl(readFirst(source, ['url', 'link', 'detail_url', 'detailUrl', 'share_url', 'shareUrl']), config) || `${config.publicBase}/movies/${encodeURIComponent(String(id))}`;
  return { id: String(id), title, year, region, type, description, poster, url, raw: source };
}

function readFirst(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function absoluteUrl(value, config) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).toString();
  } catch {
    if (raw.startsWith('/')) return new URL(raw, `${config.publicBase}/`).toString();
    return '';
  }
}

function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
