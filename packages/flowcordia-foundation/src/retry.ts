import pRetry, { AbortError } from "p-retry";

export interface RetryLoopOptions<ErrorType extends Error = Error> {
  maxAttempts: number;
  delayFor: (error: ErrorType, attempt: number) => number | undefined;
  sleep?: (milliseconds: number) => Promise<void>;
  jitter?: (delay: number, error: ErrorType, attempt: number) => number;
  signal?: AbortSignal;
}

class RetriableFailure<ErrorType extends Error> extends Error {
  readonly originalError: ErrorType;

  constructor(error: ErrorType) {
    super(error.message, { cause: error });
    this.name = "RetriableFailure";
    this.originalError = error;
  }
}

function boundedAttempts(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new TypeError("Retry attempts must be an integer between 1 and 100.");
  }
  return value;
}

export function exponentialBackoff(input: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentCap?: number;
}): number {
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new TypeError("Retry attempt must be a positive integer.");
  }
  const exponent = Math.min(input.attempt - 1, input.exponentCap ?? 20);
  return Math.min(input.maxDelayMs, input.baseDelayMs * 2 ** exponent);
}

export function halfToFullJitter(delay: number, random: () => number = Math.random): number {
  const sample = Math.max(0, Math.min(1, random()));
  return Math.floor(delay * (0.5 + sample * 0.5));
}

export function zeroToFullJitter(delay: number, random: () => number = Math.random): number {
  return Math.floor(delay * Math.max(0, Math.min(1, random())));
}

export async function retryOperation<Value, ErrorType extends Error = Error>(
  operation: (attempt: number) => Promise<Value>,
  options: RetryLoopOptions<ErrorType>
): Promise<Value> {
  const maxAttempts = boundedAttempts(options.maxAttempts);
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  try {
    return await pRetry(
      async (attempt) => {
        options.signal?.throwIfAborted();
        try {
          return await operation(attempt);
        } catch (error) {
          const typedError =
            error instanceof Error ? (error as ErrorType) : (new Error(String(error)) as ErrorType);
          if (attempt >= maxAttempts) throw typedError;
          const delay = options.delayFor(typedError, attempt);
          if (delay === undefined) throw new AbortError(typedError);
          const jittered = options.jitter ? options.jitter(delay, typedError, attempt) : delay;
          if (!Number.isSafeInteger(jittered) || jittered < 0) {
            throw new AbortError(new TypeError("Retry delay must be a non-negative safe integer."));
          }
          await sleep(jittered);
          throw new RetriableFailure(typedError);
        }
      },
      {
        retries: maxAttempts - 1,
        minTimeout: 0,
        maxTimeout: 0,
        factor: 1,
        randomize: false,
        signal: options.signal,
      }
    );
  } catch (error) {
    if (error instanceof AbortError) throw error.originalError;
    if (error instanceof RetriableFailure) throw error.originalError;
    throw error;
  }
}
