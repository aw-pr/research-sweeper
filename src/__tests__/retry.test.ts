import { describe, it, expect, vi } from "vitest";
import { withTransientRetry } from "../retry";

describe("withTransientRetry", () => {
  it("returns the result immediately when fn succeeds on the first try", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withTransientRetry(fn, {
      label: "test",
      isTransient: () => true,
      delaysMs: [10, 20, 30],
      sleep,
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a transient error using the exact delaysMs schedule, then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withTransientRetry(fn, {
      label: "test",
      isTransient: () => true,
      delaysMs: [10, 20, 30],
      sleep,
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 20);
  });

  it("throws the last error once delaysMs is exhausted", async () => {
    const err = new Error("always fails");
    const fn = vi.fn().mockRejectedValue(err);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      withTransientRetry(fn, {
        label: "test",
        isTransient: () => true,
        delaysMs: [10, 20],
        sleep,
      })
    ).rejects.toThrow("always fails");

    // Initial attempt + 2 retries = 3 calls total.
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient error", async () => {
    const err = new Error("permanent failure");
    const fn = vi.fn().mockRejectedValue(err);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      withTransientRetry(fn, {
        label: "test",
        isTransient: () => false,
        delaysMs: [10, 20, 30],
        sleep,
      })
    ).rejects.toThrow("permanent failure");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("honors a retry-after hint over the scheduled delay", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("rate limited")).mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await withTransientRetry(fn, {
      label: "test",
      isTransient: () => true,
      delaysMs: [10, 20],
      getRetryAfterMs: () => 5000,
      sleep,
    });

    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it("falls back to the scheduled delay when the retry-after hint is absent or non-positive", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await withTransientRetry(fn, {
      label: "test",
      isTransient: () => true,
      delaysMs: [42],
      getRetryAfterMs: () => 0,
      sleep,
    });

    expect(sleep).toHaveBeenCalledWith(42);
  });

  it("computes an exponential (x3) schedule from maxAttempts/baseDelayMs when delaysMs is omitted", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("1"))
      .mockRejectedValueOnce(new Error("2"))
      .mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await withTransientRetry(fn, {
      label: "test",
      isTransient: () => true,
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep,
    });

    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 300);
  });

  it("calls the default console.warn log line matching the original gemini.ts format", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await withTransientRetry(fn, {
      label: "MyLane",
      isTransient: () => true,
      delaysMs: [2000],
      getStatus: () => 503,
      sleep,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "  [MyLane] Transient error (503); retrying in 2s (attempt 1/1)"
    );
    warnSpy.mockRestore();
  });

  it("uses a custom onRetry callback instead of the default console.warn", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await withTransientRetry(fn, {
      label: "MyLane",
      isTransient: () => true,
      delaysMs: [10],
      onRetry,
      sleep,
    });

    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ label: "MyLane", attempt: 0, maxAttempts: 1, waitMs: 10 })
    );
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
