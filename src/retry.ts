// Shared transient-error retry/backoff helper. Extracted from the Gemini
// adapter's original withRetry() so the same bounded-retry behavior can be
// reused by any provider adapter without duplicating the loop.

export interface RetryAttemptInfo {
  label: string;
  /** 0-indexed attempt number that just failed. */
  attempt: number;
  /** Total number of retry attempts available (i.e. delaysMs.length). */
  maxAttempts: number;
  waitMs: number;
  error: unknown;
}

export interface TransientRetryOptions {
  label: string;
  /** Return true if this error is worth retrying. */
  isTransient: (err: unknown) => boolean;
  /**
   * Explicit per-attempt delays in ms, e.g. [2000, 6000, 18000]. Takes
   * precedence over maxAttempts/baseDelayMs — pass this to reproduce an
   * exact, fixed retry schedule.
   */
  delaysMs?: number[];
  /** Number of retry attempts when delaysMs is not given. Default 3. */
  maxAttempts?: number;
  /** Base delay in ms for the computed schedule (x3 exponential). Default 2000. */
  baseDelayMs?: number;
  /** Add up to +/-25% jitter to each computed delay. Ignored when delaysMs is explicit. */
  jitter?: boolean;
  /**
   * Extract a retry-after hint (ms) from a transient error. When present and
   * positive, overrides the scheduled delay for that attempt.
   */
  getRetryAfterMs?: (err: unknown) => number | undefined;
  /** Extract a status code/string for the default log line. */
  getStatus?: (err: unknown) => number | string | undefined;
  /** Injectable sleep, primarily for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Called before each wait. Defaults to a console.warn matching the original gemini.ts format. */
  onRetry?: (info: RetryAttemptInfo) => void;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyJitter(ms: number): number {
  const spread = ms * 0.25;
  return Math.round(ms - spread + Math.random() * spread * 2);
}

function computeDelays(maxAttempts: number, baseDelayMs: number, jitter?: boolean): number[] {
  const delays: number[] = [];
  let delay = baseDelayMs;
  for (let i = 0; i < maxAttempts; i++) {
    delays.push(jitter ? applyJitter(delay) : delay);
    delay *= 3;
  }
  return delays;
}

/**
 * Runs `fn`, retrying on transient errors with bounded backoff. Throws the
 * last error once attempts are exhausted or the error isn't transient.
 */
export async function withTransientRetry<T>(fn: () => Promise<T>, opts: TransientRetryOptions): Promise<T> {
  const delaysMs = opts.delaysMs ?? computeDelays(opts.maxAttempts ?? 3, opts.baseDelayMs ?? 2000, opts.jitter);
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === delaysMs.length || !opts.isTransient(err)) break;

      const scheduled = delaysMs[attempt];
      const retryAfter = opts.getRetryAfterMs?.(err);
      const wait = retryAfter && retryAfter > 0 ? retryAfter : scheduled;

      if (opts.onRetry) {
        opts.onRetry({ label: opts.label, attempt, maxAttempts: delaysMs.length, waitMs: wait, error: err });
      } else {
        const status = opts.getStatus?.(err);
        console.warn(
          `  [${opts.label}] Transient error (${status ?? "?"}); retrying in ${wait / 1000}s (attempt ${attempt + 1}/${delaysMs.length})`
        );
      }

      await sleep(wait);
    }
  }

  throw lastErr;
}
