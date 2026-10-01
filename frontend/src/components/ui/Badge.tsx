import type { EmailStatus } from '../../api/types';

const tone: Record<EmailStatus, string> = {
  scheduled: 'bg-warn-soft text-warn',
  sending: 'bg-blue-50 text-blue-700',
  sent: 'bg-accent-soft text-accent-strong',
  failed: 'bg-danger-soft text-danger',
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tone[status]}`}>{status}</span>;
}
