/**
 * Spaces calls at least `intervalMs` apart, in call order, even when they
 * are started concurrently.
 */
export class RateLimiter {
  private next = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {}

  async wait(): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, this.next);
    this.next = slot + this.intervalMs;
    if (slot > now) await this.sleep(slot - now);
  }
}
