/**
 * In-Process Rate-Limiter (Fixed-Window)
 * ======================================
 * Schlanker Schutz gegen Brute-Force/Abuse ohne externe Infrastruktur.
 * Schlüssel = Identität (User/API-Key) oder IP + Route-Bucket.
 */

interface WindowState {
  count: number;
  resetAt: number;
}

const globalForRL = global as unknown as { __forensRL?: Map<string, WindowState> };
const store = globalForRL.__forensRL || new Map<string, WindowState>();
if (process.env.NODE_ENV !== "production") globalForRL.__forensRL = store;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfterSec: number;
}

export function checkRateLimit(key: string, limit = 60, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  let st = store.get(key);
  if (!st || now >= st.resetAt) {
    st = { count: 0, resetAt: now + windowMs };
    store.set(key, st);
  }
  st.count++;
  const allowed = st.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - st.count),
    limit,
    resetAt: st.resetAt,
    retryAfterSec: Math.ceil((st.resetAt - now) / 1000),
  };
}

/** Periodische Bereinigung abgelaufener Fenster. */
export function purgeRateLimit(): void {
  const now = Date.now();
  for (const [k, v] of store) if (now >= v.resetAt) store.delete(k);
}
