import { Ratelimit } from "@upstash/ratelimit";
import { env } from "~/env.server";
import { createRedisRateLimitClient, RateLimiter } from "~/services/rateLimiter.server";
import { singleton } from "~/utils/singleton";

export class FirstOwnerRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("First-owner setup rate limit exceeded.");
    this.name = "FirstOwnerRateLimitError";
  }
}

function getRedisClient() {
  return createRedisRateLimitClient({
    port: env.RATE_LIMIT_REDIS_PORT,
    host: env.RATE_LIMIT_REDIS_HOST,
    username: env.RATE_LIMIT_REDIS_USERNAME,
    password: env.RATE_LIMIT_REDIS_PASSWORD,
    tlsDisabled: env.RATE_LIMIT_REDIS_TLS_DISABLED === "true",
    clusterMode: env.RATE_LIMIT_REDIS_CLUSTER_MODE_ENABLED === "1",
  });
}

const firstOwnerRateLimiter = singleton("flowcordiaFirstOwnerRateLimiter", () =>
  new RateLimiter({
    redisClient: getRedisClient(),
    keyPrefix: "flowcordia:first-owner:ip",
    limiter: Ratelimit.slidingWindow(10, "15 m"),
    logSuccess: false,
    logFailure: true,
  })
);

export async function checkFirstOwnerRateLimit(ip: string): Promise<void> {
  const result = await firstOwnerRateLimiter.limit(ip);
  if (!result.success) {
    throw new FirstOwnerRateLimitError(Math.max(0, new Date(result.reset).getTime() - Date.now()));
  }
}
