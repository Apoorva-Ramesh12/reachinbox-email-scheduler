import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../src/utils/crypto';
import { extractEmails } from '../src/utils/leads';
import { HOUR_MS, hourWindow, nextHourWindowStart } from '../src/utils/time';
import { jobOptsFor, planSchedule } from '../src/services/scheduler.service';
import { scheduleSchema } from '../src/controllers/campaign.controller';

describe('time windows', () => {
  it('computes the start of the next UTC hour', () => {
    const t = Date.UTC(2026, 0, 1, 10, 42, 5);
    expect(nextHourWindowStart(t)).toBe(Date.UTC(2026, 0, 1, 11, 0, 0));
    expect(hourWindow(nextHourWindowStart(t))).toBe(hourWindow(t) + 1);
  });
  it('treats the exact boundary as the new window', () => {
    const b = Date.UTC(2026, 0, 1, 11, 0, 0);
    expect(nextHourWindowStart(b)).toBe(b + HOUR_MS);
  });
});

describe('extractEmails', () => {
  it('extracts, lowercases and de-duplicates from CSV and free text', () => {
    const text = 'name,email\nAnn,Ann@Example.com\nBob,bob@example.org; carol@x.io\nDup,ann@example.com\nbad,not-an-email';
    expect(extractEmails(text)).toEqual(['ann@example.com', 'bob@example.org', 'carol@x.io']);
  });
  it('returns empty for no matches', () => expect(extractEmails('hello world')).toEqual([]));
});

describe('crypto', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const a = encrypt('secret');
    expect(a).not.toBe(encrypt('secret'));
    expect(decrypt(a)).toBe('secret');
  });
  it('rejects tampered ciphertext', () => {
    const buf = Buffer.from(encrypt('secret'), 'base64');
    buf[buf.length - 1] = (buf[buf.length - 1] ?? 0) ^ 0xff;
    expect(() => decrypt(buf.toString('base64'))).toThrow();
  });
});

describe('planSchedule', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  it('spaces emails by the delay and assigns senders round-robin', () => {
    let n = 0;
    const plan = planSchedule(['a@x.io', 'b@x.io', 'c@x.io'], ['s1', 's2'], new Date(now + 60_000), 5, now, () => `id${n++}`);
    expect(plan.map((p) => p.senderId)).toEqual(['s1', 's2', 's1']);
    expect(plan.map((p) => p.scheduledAt.getTime() - now)).toEqual([60_000, 65_000, 70_000]);
    expect(plan.map((p) => p.seq)).toEqual([0, 1, 2]);
  });
  it('clamps a start time in the past to now', () => {
    const [p] = planSchedule(['a@x.io'], ['s1'], new Date(now - 999_999), 0, now);
    expect(p?.scheduledAt.getTime()).toBe(now);
  });
  it('computes non-negative BullMQ delays', () => {
    expect(jobOptsFor(new Date(now + 5000), now).delay).toBe(5000);
    expect(jobOptsFor(new Date(now - 5000), now).delay).toBe(0);
  });
});

describe('scheduleSchema', () => {
  const base = { subject: 'Hi', body: 'Body', emails: ['A@Example.com'], startTime: '2030-01-01T00:00:00Z', delaySeconds: 2, hourlyLimit: 10 };
  it('accepts a valid payload and normalises emails', () => {
    const r = scheduleSchema.parse(base);
    expect(r.emails).toEqual(['a@example.com']);
    expect(r.startTime).toBeInstanceOf(Date);
  });
  it.each([
    ['empty recipients', { emails: [] }],
    ['invalid email', { emails: ['nope'] }],
    ['negative delay', { delaySeconds: -1 }],
    ['zero hourly limit', { hourlyLimit: 0 }],
    ['blank subject', { subject: '  ' }],
    ['bad date', { startTime: 'tomorrow-ish' }],
  ])('rejects %s', (_n, patch) => {
    expect(scheduleSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});
