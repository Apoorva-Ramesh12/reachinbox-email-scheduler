export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';

export interface User {
  id: string;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: Date;
}

export interface Sender {
  id: string;
  user_id: string;
  email: string;
  from_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass_enc: string;
  created_at: Date;
}

export interface Campaign {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  start_time: Date;
  delay_seconds: number;
  hourly_limit: number;
  total: number;
  created_at: Date;
}

export interface EmailRecord {
  id: string;
  campaign_id: string;
  user_id: string;
  sender_id: string;
  to_email: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduled_at: Date;
  sent_at: Date | null;
  attempts: number;
  reschedule_count: number;
  seq: number;
  message_id: string | null;
  preview_url: string | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SlackConnection {
  id: string;
  user_id: string;
  team_name: string | null;
  channel: string | null;
  webhook_url_enc: string;
  created_at: Date;
}

/** Payload stored on each BullMQ job. Kept minimal; the DB row is the source of truth. */
export interface EmailJobData {
  emailId: string;
  userId: string;
  senderId: string;
  hourlyLimit: number;
  seq: number;
}

/** Public-safe representation returned by the API. */
export interface EmailDto {
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
