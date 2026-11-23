import { describe, expect, it } from 'vitest';
import { RateLimiter } from '@drawnine/scryfall-client';

describe('RateLimiter', () => {
  it('spaces concurrent calls by the interval', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      100,
      () => clock,
      async (ms) => {
        sleeps.push(ms);
      },
    );
    await Promise.all([limiter.wait(), limiter.wait(), limiter.wait()]);
    expect(sleeps).toEqual([100, 200]);

    clock = 1000;
    await limiter.wait();
    expect(sleeps).toEqual([100, 200]);
  });
});
