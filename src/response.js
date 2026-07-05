export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function text(body, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('content-type')) headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response(body, { ...init, headers });
}

export function jsonForMethod(method, data, init = {}) {
  if (method !== 'HEAD') return json(data, init);
  const headers = new Headers(init.headers || {});
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(null, { ...init, headers });
}

export function createTimeoutSignal(timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0 || typeof AbortController === 'undefined') return { signal: undefined, cancel: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel() {
      clearTimeout(timer);
    }
  };
}

export function hexToBytes(value) {
  const hex = String(value || '').trim();
  if (!/^[a-fA-F0-9]*$/.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
