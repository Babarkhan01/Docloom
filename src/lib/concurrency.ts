/**
 * Counting semaphore for the per-provider concurrency cap (free-tier
 * endpoints are not hammered). Plain promises, no timers/node APIs —
 * Workers-safe. FIFO: waiters are woken one at a time on release.
 */
export class Semaphore {
  private free: number;
  private waiters: (() => void)[] = [];

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`Semaphore limit must be an integer >= 1 (got ${limit})`);
    }
    this.free = limit;
  }

  get available(): number {
    return this.free;
  }

  get queued(): number {
    return this.waiters.length;
  }

  /** Run `fn` while holding one permit; the permit is always released. */
  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    // New callers queue behind woken-but-not-yet-running waiters (FIFO).
    if (this.free > 0 && this.waiters.length === 0) {
      this.free--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve)).then(() => {
      this.free--;
    });
  }

  private release(): void {
    this.free++;
    const next = this.waiters.shift();
    if (next) next(); // the woken waiter's continuation decrements `free`
  }
}
