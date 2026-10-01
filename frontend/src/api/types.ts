export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';

export interface EmailItem {
  id: string;
  campaignId: string;
  to: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  senderEmail?: string;
  previewUrl: string | null;
  error: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchHit {
  id: string;
  to: string;
  from: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
}

export interface Sender {
  id: string;
  email: string;
  fromName: string;
  host: string;
}

export type SlackStatus = { connected: false } | { connected: true; teamName: string | null; channel: string | null };

export interface ScheduleRequest {
  subject: string;
  body: string;
  emails: string[];
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
  senderIds?: string[];
}

export interface ScheduleResponse {
  campaignId: string;
  total: number;
  senders: number;
  effectiveHourlyLimit: number;
  firstSendAt: string;
  lastSendAt: string;
}
