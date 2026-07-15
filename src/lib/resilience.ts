// Reliability primitive: bounded exponential backoff with full jitter for outbound
// network calls. One owner, one home. Wired into every provider that reaches an
// external endpoint (embeddings today; any future HTTP provider next). The retry loop
// and its delay math are injectable (sleep, random) so tests are deterministic and do
// not touch real timers. Falsifier for H-2: a simulated 429 crashes the call.

export class RetryableHttpError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `retryable HTTP status ${String(status)}`);
    this.name = "RetryableHttpError";
    this.status = status;
  }
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export function isRetryableNetworkError(error: unknown): boolean {
  // A timed-out fetch (AbortSignal.timeout) rejects with a TimeoutError; a caller abort
  // rejects with AbortError.
  if (error instanceof RetryableHttpError) {
    return true;
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return true;
  }
  // undici raises a TypeError for genuine transport failures ("fetch failed") and attaches a
  // `cause`. A malformed URL or bad header is also a TypeError but carries no cause; that is a
  // deterministic misconfiguration and must surface immediately rather than be retried.
  return error instanceof TypeError && (error as { readonly cause?: unknown }).cause !== undefined;
}

export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type RetryOptions = {
  // Number of retries AFTER the first attempt. `retries: 3` means up to 4 total attempts.
  readonly retries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly isRetryable: (error: unknown) => boolean;
  readonly sleep?: Sleep;
  readonly random?: () => number;
};

// Full-jitter backoff (AWS Architecture Blog): delay is uniform in [0, min(base*2^attempt, max)].
export function backoffDelayMs(
  attempt: number,
  options: { readonly baseDelayMs: number; readonly maxDelayMs: number },
  random: () => number = Math.random,
): number {
  const exponential = options.baseDelayMs * 2 ** attempt;
  const capped = Math.min(exponential, options.maxDelayMs);
  return Math.round(random() * capped);
}

export async function retryAsync<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep = options.sleep ?? realSleep;
  const random = options.random ?? Math.random;
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= options.retries || !options.isRetryable(error)) {
        throw error;
      }
      await sleep(backoffDelayMs(attempt, options, random));
    }
  }
  throw lastError;
}
