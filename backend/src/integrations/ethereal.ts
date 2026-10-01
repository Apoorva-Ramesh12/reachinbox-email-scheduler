import nodemailer, { SentMessageInfo, Transporter } from 'nodemailer';
import { env } from '../config/env';
import type { Sender } from '../types';
import { decrypt, encrypt } from '../utils/crypto';
import type { NewSender } from '../repositories/sender.repository';

export interface EtherealCredentials {
  user: string;
  pass: string;
  host: string;
  port: number;
  secure: boolean;
}

/** Calls the real Ethereal API to provision a fresh fake-SMTP inbox. */
export async function createEtherealAccount(): Promise<EtherealCredentials> {
  const acc = await nodemailer.createTestAccount();
  return { user: acc.user, pass: acc.pass, host: acc.smtp.host, port: acc.smtp.port, secure: acc.smtp.secure };
}

export function credentialsToSender(userId: string, c: EtherealCredentials, fromName: string): NewSender {
  return {
    user_id: userId,
    email: c.user,
    from_name: fromName,
    smtp_host: c.host,
    smtp_port: c.port,
    smtp_secure: c.secure,
    smtp_user: c.user,
    smtp_pass_enc: encrypt(c.pass),
  };
}

/** Credentials from env, if the operator pre-created an Ethereal account. */
export function envEtherealCredentials(): EtherealCredentials | null {
  if (!env.ETHEREAL_USER || !env.ETHEREAL_PASS) return null;
  return { user: env.ETHEREAL_USER, pass: env.ETHEREAL_PASS, host: env.ETHEREAL_HOST, port: env.ETHEREAL_PORT, secure: false };
}

const transports = new Map<string, Transporter>();

export function getTransport(sender: Sender): Transporter {
  const cacheKey = `${sender.id}:${sender.smtp_pass_enc}`;
  let t = transports.get(cacheKey);
  if (!t) {
    t = nodemailer.createTransport({
      host: sender.smtp_host,
      port: sender.smtp_port,
      secure: sender.smtp_secure,
      auth: { user: sender.smtp_user, pass: decrypt(sender.smtp_pass_enc) },
      pool: true,
      maxConnections: 3,
    });
    transports.set(cacheKey, t);
  }
  return t;
}

export function closeTransports(): void {
  for (const t of transports.values()) t.close();
  transports.clear();
}

export const getPreviewUrl = (info: unknown): string | null => {
  const url = nodemailer.getTestMessageUrl(info as SentMessageInfo);
  return url || null;
};
