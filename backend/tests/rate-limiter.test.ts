import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { redis } from '../src/redis/connection';
import { RateLimiter } from '../src/services/rate-limiter.service';
import { infraAvailable } from './helpers';

const up = await infraAvailable();

describe.skipIf(!up)('RateLimiter (real Redis)', () => {
  const limiter = new RateLimiter(redis);
  beforeAll(() => undefined);
  afterAll(async () => void (await redis.quit().catch(() => undefined)));

  it('admits exactly `limit` calls per window, even under parallel load', async () => {
    const sender = randomUUID();
    const results = await Promise.all(Array.from({ length: 50 }, () => limiter.admitHourly(sender, 10)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(results.filter((r) => !r.allowed)).toHaveLength(40);
    // rejected calls must not inflate the counter
    expect(Number(await redis.get(limiter.hourKey(sender, Date.now())))).toBe(10);
  });

  it('isolates senders from each other', async () => {
    const a = randomUUID();
    const b = randomUUID();
    await limiter.admitHourly(a, 1);
    expect((await limiter.admitHourly(a, 1)).allowed).toBe(false);
    expect((await limiter.admitHourly(b, 1)).allowed).toBe(true);
  });

  it('uses a fresh counter in the next hour window', async () => {
    const s = randomUUID();
    const now = Date.now();
    await limiter.admitHourly(s, 1, now);
    expect((await limiter.admitHourly(s, 1, now)).allowed).toBe(false);
    expect((await limiter.admitHourly(s, 1, now + 3_600_000)).allowed).toBe(true);
  });

  it('refund returns budget', async () => {
    const s = randomUUID();
    await limiter.admitHourly(s, 1);
    await limiter.refundHourly(s);
    expect((await limiter.admitHourly(s, 1)).allowed).toBe(true);
  });

  it('enforces minimum spacing with an atomic slot', async () => {
    const s = randomUUID();
    const first = await limiter.acquireSendSlot(s, 1500);
    const second = await limiter.acquireSendSlot(s, 1500);
    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(false);
    expect(second.waitMs).toBeGreaterThan(0);
    expect(second.waitMs).toBeLessThanOrEqual(1500);
  });

  it('notifies only once per (sender, window)', async () => {
    const s = randomUUID();
    expect(await limiter.markLimitNotified(s)).toBe(true);
    expect(await limiter.markLimitNotified(s)).toBe(false);
  });
});
