// Thin HTTP client for api.vedur.is with bounded retry/backoff.
// Native fetch only — no third-party HTTP dependency (2-3 stations nightly is trivial load).

/** Base URL for the Veðurstofa Íslands weather API (CC BY 4.0, no auth). */
export const BASE_URL = "https://api.vedur.is/weather";

/**
 * Fetch with bounded exponential backoff.
 * - Returns immediately on `r.ok`.
 * - Returns (does NOT retry) deterministic 404/422 so callers can inspect the body.
 * - Backs off `500 * 2 ** i` ms on 5xx / network errors, up to `tries` attempts.
 * - Throws after `tries` exhausted.
 */
export async function fetchWithRetry(url: string, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (r.ok) return r;
      // Deterministic client errors — retrying will not change the outcome.
      if (r.status === 404 || r.status === 422) return r;
      // 5xx and anything else: fall through to backoff.
      lastErr = new Error(`HTTP ${r.status} for ${url}`);
    } catch (err) {
      // Network error — retry with backoff.
      lastErr = err;
    }
    // Do not sleep after the final attempt.
    if (i < tries - 1) {
      await new Promise((res) => setTimeout(res, 500 * 2 ** i));
    }
  }
  throw new Error(
    `fetch failed after ${tries} tries: ${url}` +
      (lastErr instanceof Error ? ` (${lastErr.message})` : ""),
  );
}
