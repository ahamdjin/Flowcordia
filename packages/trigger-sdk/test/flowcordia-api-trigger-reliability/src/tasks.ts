import { task } from "@trigger.dev/sdk/v3";

const boundedNonce = /^[a-z0-9-]{8,80}$/;

export const flowcordiaApiIdempotency = task({
  id: "flowcordia-api-idempotency",
  retry: { maxAttempts: 1 },
  maxDuration: 60,
  run: async (payload: { nonce: string }) => {
    if (!payload || !boundedNonce.test(payload.nonce)) {
      throw new Error("The API reliability nonce is invalid.");
    }
    return { accepted: true, nonceLength: payload.nonce.length };
  },
});

export const flowcordiaApiQueueTtl = task({
  id: "flowcordia-api-queue-ttl",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 180,
  run: async (payload: { nonce: string; holdMilliseconds: number }) => {
    if (!payload || !boundedNonce.test(payload.nonce)) {
      throw new Error("The API reliability queue nonce is invalid.");
    }
    if (
      !Number.isSafeInteger(payload.holdMilliseconds) ||
      payload.holdMilliseconds < 0 ||
      payload.holdMilliseconds > 90_000
    ) {
      throw new Error("The API reliability hold is invalid.");
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, payload.holdMilliseconds));
    return { accepted: true, nonceLength: payload.nonce.length };
  },
});

export const flowcordiaApiFailureRelease = task({
  id: "flowcordia-api-failure-release",
  retry: { maxAttempts: 1 },
  maxDuration: 60,
  run: async (payload: { nonce: string }) => {
    if (!payload || !boundedNonce.test(payload.nonce)) {
      throw new Error("The API reliability failure nonce is invalid.");
    }
    throw new Error("Intentional API reliability failure.");
  },
});
