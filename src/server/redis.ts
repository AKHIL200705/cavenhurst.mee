import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

/**
 * Returns a reusable, server-side Upstash Redis client.
 * Uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from environment.
 * Lazily initialized and cached across server invocations.
 */
export function getRedis(): Redis | null {
  if (_redis) return _redis;

  const url = (process.env["UPSTASH_REDIS_REST_URL"] || "").replace(/^["']|["']$/g, "").trim();
  const token = (process.env["UPSTASH_REDIS_REST_TOKEN"] || "").replace(/^["']|["']$/g, "").trim();

  if (!url || !token) {
    return null;
  }

  try {
    _redis = new Redis({
      url,
      token,
      retry: {
        retries: 3,
        backoff: (retryCount) => Math.exp(retryCount) * 50,
      },
    });
    return _redis;
  } catch (err) {
    console.warn("[Upstash Redis Init Notice]:", err);
    return null;
  }
}
