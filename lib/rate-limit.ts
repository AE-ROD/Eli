import { LRUCache } from "lru-cache"
import { NextRequest } from "next/server"

interface TokenBucket {
  tokens: number
  lastRefill: number
}

// 5 requests per IP per 10 minutes
const LIMIT = 5
const WINDOW_MS = 10 * 60 * 1000

const cache = new LRUCache<string, TokenBucket>({
  max: 5000,
  ttl: WINDOW_MS,
})

export function checkRateLimit(req: NextRequest): { allowed: boolean; retryAfter?: number } {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"

  const now = Date.now()
  const bucket = cache.get(ip)

  if (!bucket) {
    cache.set(ip, { tokens: LIMIT - 1, lastRefill: now })
    return { allowed: true }
  }

  const elapsed = now - bucket.lastRefill
  const refilled = Math.floor((elapsed / WINDOW_MS) * LIMIT)

  if (refilled > 0) {
    bucket.tokens = Math.min(LIMIT, bucket.tokens + refilled)
    bucket.lastRefill = now
  }

  if (bucket.tokens > 0) {
    bucket.tokens -= 1
    cache.set(ip, bucket)
    return { allowed: true }
  }

  // Seconds until the next token refills
  const msPerToken = WINDOW_MS / LIMIT
  const retryAfter = Math.ceil((msPerToken - elapsed % msPerToken) / 1000)
  return { allowed: false, retryAfter }
}
