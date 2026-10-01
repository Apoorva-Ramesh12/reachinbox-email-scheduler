import { api } from './client';
import type { EmailItem, Page, ScheduleRequest, ScheduleResponse, SearchHit, Sender, SlackStatus, User } from './types';

const qs = (params: Record<string, string | number | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v));
  return `?${sp.toString()}`;
};

export const endpoints = {
  me: () => api<User>('/auth/me'),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  scheduled: (page: number, pageSize: number) => api<Page<EmailItem>>(`/emails/scheduled${qs({ page, pageSize })}`),
  sent: (page: number, pageSize: number) => api<Page<EmailItem>>(`/emails/sent${qs({ page, pageSize })}`),
  search: (q: string, page: number, pageSize: number) =>
    api<{ items: SearchHit[]; total: number }>(`/emails/search${qs({ q, page, pageSize })}`),
  schedule: (body: ScheduleRequest) => api<ScheduleResponse>('/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  senders: () => api<{ items: Sender[] }>('/senders'),
  addSender: () => api<Sender>('/senders', { method: 'POST', body: JSON.stringify({}) }),
  slackStatus: () => api<SlackStatus>('/slack/status'),
  slackTest: () => api<{ sent: boolean }>('/slack/test', { method: 'POST' }),
  slackDisconnect: () => api<void>('/slack', { method: 'DELETE' }),
};
