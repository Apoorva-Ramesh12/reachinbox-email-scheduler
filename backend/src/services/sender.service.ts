import { logger } from '../config/logger';
import {
  createEtherealAccount,
  credentialsToSender,
  envEtherealCredentials,
} from '../integrations/ethereal';
import { senderRepository } from '../repositories/sender.repository';
import type { Sender } from '../types';
import { AppError } from '../utils/errors';

export interface SenderDto {
  id: string;
  email: string;
  fromName: string;
  host: string;
}

export const toSenderDto = (s: Sender): SenderDto => ({ id: s.id, email: s.email, fromName: s.from_name, host: s.smtp_host });

export const senderService = {
  async list(userId: string): Promise<SenderDto[]> {
    return (await senderRepository.listByUser(userId)).map(toSenderDto);
  },

  /** Provisions a brand-new Ethereal inbox through Ethereal's real API. */
  async createEthereal(userId: string, fromName: string): Promise<SenderDto> {
    const creds = await createEtherealAccount();
    const sender = await senderRepository.create(credentialsToSender(userId, creds, fromName));
    logger.info({ senderId: sender.id, email: sender.email }, 'Ethereal sender created');
    return toSenderDto(sender);
  },

  /** First-use bootstrap: uses ETHEREAL_USER/PASS from env if present, otherwise creates a new account. */
  async ensureAtLeastOne(userId: string, fromName: string): Promise<Sender[]> {
    const existing = await senderRepository.listByUser(userId);
    if (existing.length > 0) return existing;
    const fromEnv = envEtherealCredentials();
    const creds = fromEnv ?? (await createEtherealAccount());
    return [await senderRepository.create(credentialsToSender(userId, creds, fromName))];
  },

  async remove(userId: string, id: string): Promise<void> {
    try {
      const n = await senderRepository.remove(userId, id);
      if (n === 0) throw AppError.notFound('Sender not found');
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_ROW_IS_REFERENCED_2') {
        throw AppError.conflict('Sender has emails and cannot be deleted');
      }
      throw err;
    }
  },
};
