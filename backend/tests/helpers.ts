import { createServer, IncomingMessage, Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { db } from '../src/db/knex';
import { redis } from '../src/redis/connection';
import { userRepository } from '../src/repositories/user.repository';
import { senderRepository } from '../src/repositories/sender.repository';
import { encrypt } from '../src/utils/crypto';
import type { Sender, User } from '../src/types';

export async function infraAvailable(): Promise<boolean> {
  try {
    await db.raw('select 1');
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function createUser(): Promise<User> {
  const id = randomUUID().slice(0, 8);
  return userRepository.upsertFromGoogle({ googleId: `g-${id}`, email: `${id}@test.dev`, name: `Tester ${id}`, avatarUrl: null });
}

export async function createSender(userId: string): Promise<Sender> {
  const id = randomUUID().slice(0, 8);
  return senderRepository.create({
    user_id: userId,
    email: `sender-${id}@ethereal.email`,
    from_name: 'Sender',
    smtp_host: 'localhost',
    smtp_port: 1025,
    smtp_secure: false,
    smtp_user: 'u',
    smtp_pass_enc: encrypt('p'),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await db('users').where({ id: userId }).del();
}

export async function waitFor<T>(fn: () => Promise<T | false | undefined>, timeoutMs = 15_000, intervalMs = 150): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Tiny HTTP server that records POST bodies — stands in for Slack's webhook endpoint. */
export function startWebhookSink(): Promise<{ server: Server; url: string; received: string[] }> {
  const received: string[] = [];
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        received.push(data);
        res.writeHead(200).end('ok');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/hook`, received });
    });
  });
}
