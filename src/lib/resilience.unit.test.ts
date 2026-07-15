import { describe, expect, it } from "vitest";
import {
  backoffDelayMs,
  isRetryableHttpStatus,
  isRetryableNetworkError,
  RetryableHttpError,
  retryAsync,
} from "./resilience.js";

const noSleep = (): Promise<void> => Promise.resolve();

describe("isRetryableHttpStatus", () => {
  it("treats 429 and 5xx as retryable and 4xx (except 429) as not", () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(500)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(400)).toBe(false);
    expect(isRetryableHttpStatus(404)).toBe(false);
    expect(isRetryableHttpStatus(200)).toBe(false);
  });
});

describe("isRetryableNetworkError", () => {
  it("classifies timeout, abort, and dropped-connection errors as retryable", () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isRetryableNetworkError(timeout)).toBe(true);
    expect(isRetryableNetworkError(abort)).toBe(true);
    expect(isRetryableNetworkError(new TypeError("fetch failed"))).toBe(true);
    expect(isRetryableNetworkError(new RetryableHttpError(503))).toBe(true);
    expect(isRetryableNetworkError(new Error("bad request"))).toBe(false);
  });
});

describe("backoffDelayMs", () => {
  it("is bounded by the cap and scales with the exponent under full jitter", () => {
    const opts = { baseDelayMs: 200, maxDelayMs: 2_000 };
    // random() = 1 yields the full window; random() = 0 yields zero.
    expect(backoffDelayMs(0, opts, () => 1)).toBe(200);
    expect(backoffDelayMs(1, opts, () => 1)).toBe(400);
    expect(backoffDelayMs(4, opts, () => 1)).toBe(2_000); // 200*2^4=3200 capped at 2000
    expect(backoffDelayMs(0, opts, () => 0)).toBe(0);
  });
});

const retryOpts = {
  retries: 3,
  baseDelayMs: 1,
  maxDelayMs: 1,
  isRetryable: isRetryableNetworkError,
  sleep: noSleep,
};

describe("retryAsync", () => {
  it("retries a retryable failure then returns the success value", async () => {
    let calls = 0;
    const result = await retryAsync(() => {
      calls += 1;
      return calls < 2 ? Promise.reject(new RetryableHttpError(429)) : Promise.resolve("ok");
    }, retryOpts);
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("exhausts the retry budget and rethrows the last error", async () => {
    let calls = 0;
    await expect(
      retryAsync(() => {
        calls += 1;
        return Promise.reject(new RetryableHttpError(503));
      }, retryOpts),
    ).rejects.toBeInstanceOf(RetryableHttpError);
    expect(calls).toBe(4); // first attempt + 3 retries
  });

  it("does not retry a non-retryable error", async () => {
    let calls = 0;
    await expect(
      retryAsync(() => {
        calls += 1;
        return Promise.reject(new Error("bad request"));
      }, retryOpts),
    ).rejects.toThrow("bad request");
    expect(calls).toBe(1);
  });
});
