// Lightweight SWR-style cache for POS billing.
// - In-memory map for instant repeat reads within a session.
// - sessionStorage persistence so switching routes and coming back to POS is instant.
// - Background refresh keeps data fresh without blocking the UI.

type Loader<T> = () => Promise<T>;

const mem = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

function readSession<T>(key: string): T | undefined {
  if (typeof sessionStorage === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeSession<T>(key: string, value: T) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / serialization ignored */
  }
}

export function getCached<T>(key: string): T | undefined {
  if (mem.has(key)) return mem.get(key) as T;
  const v = readSession<T>(key);
  if (v !== undefined) mem.set(key, v);
  return v;
}

export async function refresh<T>(key: string, loader: Loader<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = (async () => {
    try {
      const data = await loader();
      mem.set(key, data);
      writeSession(key, data);
      return data;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function invalidate(prefix?: string) {
  if (!prefix) {
    mem.clear();
    if (typeof sessionStorage !== "undefined") {
      try { sessionStorage.clear(); } catch { /* ignore */ }
    }
    return;
  }
  for (const k of Array.from(mem.keys())) if (k.startsWith(prefix)) mem.delete(k);
  if (typeof sessionStorage !== "undefined") {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(prefix)) sessionStorage.removeItem(k);
      }
    } catch { /* ignore */ }
  }
}