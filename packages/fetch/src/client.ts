// Thin HTTP client for api.vedur.is with bounded retry/backoff.
// Native fetch only — no third-party HTTP dependency (2-3 stations nightly is trivial load).

/** Base URL for the Veðurstofa Íslands weather API (CC BY 4.0, no auth). */
export const BASE_URL = "https://api.vedur.is/weather";

/**
 * A non-ok API response that survived retries (or is deterministic and unretriable).
 * Carries `.status` so the backfill loop can branch on the measured error taxonomy:
 *   - 413 "Too many parameters" (size ceiling)  -> caller halves the span (NOT retried here).
 *   - 502 Bad Gateway (flaky ~20k-row zone)      -> retried with backoff, then surfaces.
 *   - 503 Throttle (burst concurrency)           -> retried with backoff, then surfaces.
 * 404/422 keep their existing body-inspection semantics and never become an ApiHttpError.
 */
export class ApiHttpError extends Error {
  readonly status: number;
  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

/**
 * Fetch with bounded exponential backoff.
 * - Returns immediately on `r.ok`.
 * - Returns (does NOT retry) deterministic 404/422 so callers can inspect the body.
 * - Throws `ApiHttpError(413)` immediately WITHOUT backoff: 413 is deterministic for a
 *   given URL — retrying the identical request wastes time; the caller halves the span.
 * - Backs off `500 * 2 ** i` ms on 5xx (incl. 502/503) / network errors, up to `tries`
 *   attempts, then throws `ApiHttpError(status)` (or a generic Error on network failure).
 */
export async function fetchWithRetry(url: string, tries = 3): Promise<Response> {
  let lastErr: unknown;
  let lastStatus: number | null = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (r.ok) return r;
      // Deterministic client errors — retrying will not change the outcome.
      if (r.status === 404 || r.status === 422) return r;
      // 413 is a deterministic size rejection: do not burn retries on the same URL —
      // surface it immediately so the caller can halve the requested span instead.
      if (r.status === 413) {
        throw new ApiHttpError(413, `HTTP 413 for ${url}`);
      }
      // 5xx (incl. 502/503) and anything else: fall through to bounded backoff.
      lastStatus = r.status;
      lastErr = new ApiHttpError(r.status, `HTTP ${r.status} for ${url}`);
    } catch (err) {
      // A 413 must escape the retry loop unchanged (do not degrade to backoff).
      if (err instanceof ApiHttpError && err.status === 413) throw err;
      // Network error — retry with backoff.
      lastErr = err;
    }
    // Do not sleep after the final attempt.
    if (i < tries - 1) {
      await new Promise((res) => setTimeout(res, 500 * 2 ** i));
    }
  }
  // Retries exhausted. Surface a status-carrying error when we had an HTTP status
  // (502/503/other 5xx) so the loop can distinguish it from a network failure.
  if (lastStatus !== null) {
    throw new ApiHttpError(
      lastStatus,
      `fetch failed after ${tries} tries: ${url} (HTTP ${lastStatus})`,
    );
  }
  throw new Error(
    `fetch failed after ${tries} tries: ${url}` +
      (lastErr instanceof Error ? ` (${lastErr.message})` : ""),
  );
}
