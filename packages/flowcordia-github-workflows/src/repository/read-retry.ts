import { GitHubTransportError } from "../transport/errors.js";

export interface ReadRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_READ_RETRY: ReadRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 1000,
};

export function normalizeReadRetryPolicy(
  policy: Partial<ReadRetryPolicy> | undefined
): ReadRetryPolicy {
  const normalized = { ...DEFAULT_READ_RETRY, ...policy };
  if (
    !Number.isSafeInteger(normalized.maxAttempts) ||
    normalized.maxAttempts < 1 ||
    normalized.maxAttempts > 5
  ) {
    throw new TypeError("Read retry attempts must be an integer between 1 and 5.");
  }
  if (
    !Number.isSafeInteger(normalized.baseDelayMs) ||
    normalized.baseDelayMs < 0 ||
    normalized.baseDelayMs > 30_000 ||
    !Number.isSafeInteger(normalized.maxDelayMs) ||
    normalized.maxDelayMs < normalized.baseDelayMs ||
    normalized.maxDelayMs > 30_000
  ) {
    throw new TypeError("Read retry delays must be safe integers between 0 and 30000ms.");
  }
  return normalized;
}

function retryDelay(
  error: GitHubTransportError,
  attempt: number,
  policy: ReadRetryPolicy
): number | undefined {
  if (error.code === "invalid_response") return undefined;

  if (error.code === "rate_limited") {
    return error.retryAfterMs !== undefined && error.retryAfterMs <= policy.maxDelayMs
      ? error.retryAfterMs
      : undefined;
  }

  const retryable =
    error.code === "network_error" ||
    error.status === 408 ||
    (error.status !== undefined && error.status >= 500);
  if (!retryable) return undefined;

  if (error.retryAfterMs !== undefined) {
    return error.retryAfterMs <= policy.maxDelayMs ? error.retryAfterMs : undefined;
  }

  return Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
}

export async function executeReadWithRetry<T>(
  operation: () => Promise<T>,
  policy: ReadRetryPolicy,
  sleep: (milliseconds: number) => Promise<void>,
  random: () => number = Math.random
): Promise<T> {
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof GitHubTransportError) || attempt === policy.maxAttempts) {
        throw error;
      }

      const delay = retryDelay(error, attempt, policy);
      if (delay === undefined) throw error;
      const jitteredDelay =
        error.retryAfterMs !== undefined
          ? delay
          : Math.floor(delay * Math.max(0, Math.min(1, random())));
      await sleep(jitteredDelay);
    }
  }

  throw new Error("Read retry loop ended unexpectedly.");
}
