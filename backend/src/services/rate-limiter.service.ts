import type { Redis } from 'ioredis';
import { HOUR_MS, hourWindow, nextHourWindowStart } from '../utils/time';

/**
 * Atomic fixed-window counter. Runs as a single Lua script so concurrent workers
 * on any number of instances can never over-admit:
 *   returns {1, count}  when admitted
 *   returns {0, count}  when the window is already full (counter is NOT incremented)
 */
const ADMIT_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
if c > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return {0, c - 1}
end
return {1, c}
`;

export interface AdmitResult {
  allowed: boolean;
  count: number;
  /** Epoch ms when the next window opens (only meaningful when !allowed). */
  nextWindowStart: number;
}

export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  hourKey(senderId: string, now: number): string {
    return `rl:hour:${senderId}:${hourWindow(now)}`;
  }

  /** Hourly cap per sender, keyed by (sender, hour window). */
  async admitHourly(senderId: string, limit: number, now = Date.now()): Promise<AdmitResult> {
    const key = this.hourKey(senderId, now);
    const [ok, count] = (await this.redis.eval(ADMIT_LUA, 1, key, String(limit), String(HOUR_MS * 2))) as [number, number];
    return { allowed: ok === 1, count, nextWindowStart: nextHourWindowStart(now) };
  }

  /**
   * Minimum spacing between sends of the same sender. SET NX PX is atomic: the first
   * caller wins the slot; others get the remaining TTL to know how long to wait.
   */
  async acquireSendSlot(senderId: string, minDelayMs: number): Promise<{ acquired: boolean; waitMs: number }> {
    if (minDelayMs <= 0) return { acquired: true, waitMs: 0 };
    const key = `rl:slot:${senderId}`;
    const res = await this.redis.set(key, '1', 'PX', minDelayMs, 'NX');
    if (res === 'OK') return { acquired: true, waitMs: 0 };
    const ttl = await this.redis.pttl(key);
    return { acquired: false, waitMs: Math.max(ttl, 1) };
  }

  /** Gives back one unit of the hourly budget (claim lost / send failed before delivery). */
  async refundHourly(senderId: string, now = Date.now()): Promise<void> {
    const key = this.hourKey(senderId, now);
    const v = await this.redis.decr(key);
    if (v < 0) await this.redis.set(key, '0', 'PX', HOUR_MS * 2);
  }

  releaseSendSlot(senderId: string): Promise<number> {
    return this.redis.del(`rl:slot:${senderId}`);
  }

  /** True only the first time it is called for (sender, window): used to notify once per hit. */
  async markLimitNotified(senderId: string, now = Date.now()): Promise<boolean> {
    const key = `rl:notified:${senderId}:${hourWindow(now)}`;
    const res = await this.redis.set(key, '1', 'PX', HOUR_MS * 2, 'NX');
    return res === 'OK';
  }
}
