import { Ratelimit } from "@upstash/ratelimit";
import { env } from "~/env.server";
import { createRedisRateLimitClient, RateLimiter } from "~/services/rateLimiter.server";
import { singleton } from "~/utils/singleton";

export class PasswordRateLimitError extends Error {
  public readonly retryAfter: number;

  constructor(retryAfter: number) {
    super("Password login rate limit exceeded.");
    this.retryAfter = retryAfter;
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

const passwordEmailRateLimiter = singleton("passwordEmailRateLimiter", () =>
  new RateLimiter({
    redisClient: getRedisClient(),
    keyPrefix: "auth:password:email",
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    logSuccess: false,
    logFailure: true,
  })
);

const passwordIpRateLimiter = singleton("passwordIpRateLimiter", () =>
  new RateLimiter({
    redisClient: getRedisClient(),
    keyPrefix: "auth:password:ip",
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    logSuccess: false,
    logFailure: true,
  })
);

async function enforce(limiter: RateLimiter, identifier: string): Promise<void> {
  const result = await limiter.limit(identifier);
  if (!result.success) {
    throw new PasswordRateLimitError(new Date(result.reset).getTime() - Date.now());
  }
}

export async function checkPasswordEmailRateLimit(email: string): Promise<void> {
  await enforce(passwordEmailRateLimiter, email.trim().toLowerCase());
}

export async function checkPasswordIpRateLimit(ip: string): Promise<void> {
  await enforce(passwordIpRateLimiter, ip);
}
