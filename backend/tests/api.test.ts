import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/db/knex';
import { migrateLatest } from '../src/db/migrate';
import { emailQueue } from '../src/queues/email.queue';
import { redis } from '../src/redis/connection';
import { authService, SESSION_COOKIE } from '../src/services/auth.service';
import { createSender, createUser, deleteUser, infraAvailable } from './helpers';

const up = await infraAvailable();

describe.skipIf(!up)('HTTP API', () => {
  const app = createApp();
  const created: string[] = [];
  afterAll(async () => {
    for (const u of created) await deleteUser(u);
    await emailQueue.obliterate({ force: true });
    await emailQueue.close();
    await db.destroy();
    redis.disconnect();
  });

  it('GET /health reports dependencies', async () => {
    await migrateLatest();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.checks).toEqual({ db: true, redis: true });
  });

  it('serves OpenAPI JSON and Swagger UI', async () => {
    const json = await request(app).get('/docs.json');
    expect(json.body.paths['/api/campaigns']).toBeDefined();
    expect((await request(app).get('/docs/').redirects(1)).status).toBe(200);
  });

  it('protects Bull Board with basic auth', async () => {
    expect((await request(app).get('/admin/queues')).status).toBe(401);
    const ok = await request(app).get('/admin/queues/').auth('admin', process.env.BULL_BOARD_PASSWORD as string);
    expect(ok.status).toBe(200);
  });

  it('rejects unauthenticated API calls', async () => {
    expect((await request(app).get('/api/emails/scheduled')).status).toBe(401);
    expect((await request(app).post('/api/campaigns').send({})).status).toBe(401);
  });

  it('validates the schedule payload', async () => {
    const user = await createUser();
    created.push(user.id);
    const cookie = `${SESSION_COOKIE}=${authService.createSession(user.id)}`;
    const res = await request(app).post('/api/campaigns').set('Cookie', cookie).send({ subject: '', emails: ['bad'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('schedules a campaign and lists it under Scheduled, with correct pagination', async () => {
    const user = await createUser();
    created.push(user.id);
    const sender = await createSender(user.id);
    const cookie = `${SESSION_COOKIE}=${authService.createSession(user.id)}`;
    const emails = Array.from({ length: 5 }, (_, i) => `api${i}@example.com`);
    const sched = await request(app)
      .post('/api/campaigns')
      .set('Cookie', cookie)
      .send({ subject: 'Hi', body: 'Body', emails, startTime: new Date(Date.now() + 3_600_000).toISOString(), delaySeconds: 10, hourlyLimit: 50, senderIds: [sender.id] });
    expect(sched.status).toBe(201);
    expect(sched.body.total).toBe(5);

    const list = await request(app).get('/api/emails/scheduled?page=1&pageSize=2').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(5);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items[0]).toMatchObject({ to: 'api0@example.com', subject: 'Hi', status: 'scheduled' });

    const sentList = await request(app).get('/api/emails/sent').set('Cookie', cookie);
    expect(sentList.body.total).toBe(0);
  });

  it("cannot schedule with another user's sender", async () => {
    const a = await createUser();
    const b = await createUser();
    created.push(a.id, b.id);
    const sender = await createSender(a.id);
    const cookie = `${SESSION_COOKIE}=${authService.createSession(b.id)}`;
    const res = await request(app).post('/api/campaigns').set('Cookie', cookie).send({
      subject: 'x', body: 'y', emails: ['z@example.com'], startTime: new Date().toISOString(), delaySeconds: 1, hourlyLimit: 1, senderIds: [sender.id],
    });
    expect(res.status).toBe(400);
  });
});
