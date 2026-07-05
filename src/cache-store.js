export class TimedMap {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.items = new Map();
  }

  get(key) {
    const item = this.items.get(String(key));
    if (!item) return undefined;
    if (item.expiresAt <= this.now()) {
      this.items.delete(String(key));
      return undefined;
    }
    return clone(item.value);
  }

  set(key, value, ttlSeconds) {
    if (!ttlSeconds || ttlSeconds <= 0) return false;
    this.items.set(String(key), { value: clone(value), expiresAt: this.now() + ttlSeconds * 1000 });
    return true;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.items.delete(String(key));
  }

  clear() {
    const size = this.items.size;
    this.items.clear();
    return size;
  }

  get size() {
    return this.items.size;
  }
}

export class SearchCache extends TimedMap {}
export class InteractionDeduper extends TimedMap {
  mark(id, ttlSeconds) {
    return this.set(id, true, ttlSeconds);
  }
}

export const sharedSearchCache = new SearchCache();
export const sharedInteractionDeduper = new InteractionDeduper();

export function createSearchCache() {
  return new SearchCache();
}

export function createInteractionDeduper() {
  return new InteractionDeduper();
}

export function normalizeQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function buildCacheKey(kind, query, config, limit) {
  return `${config.apiBase}|${kind}|${normalizeQuery(query)}|${limit}`;
}

function clone(value) {
  if (Array.isArray(value)) return value.map((item) => ({ ...item }));
  if (value && typeof value === 'object') return { ...value };
  return value;
}
