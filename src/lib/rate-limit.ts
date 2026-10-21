// Simple in-memory rate limiter for sensitive operations
// (login/registration already guarded in /api/auth/*; payments & purchases here).
// Per-process sliding window — adequate for the single-node MVP deployment.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Throw an HttpError(429) when the caller exceeds `max` requests per windowMs. */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  message = "Too many requests — please try again later",
): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > max) {
    const retryIn = Math.ceil((bucket.resetAt - now) / 1000);
    const err = new Error(`${message} (${retryIn}s)`) as Error & { status?: number };
    err.status = 429;
    throw err;
  }

  // opportunistic cleanup
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }
}
