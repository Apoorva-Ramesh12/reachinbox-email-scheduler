import type { EmailItem, SearchHit } from '../api/types';
import { formatDateTime } from '../utils/format';
import { StatusBadge } from './ui/Badge';
import type { Column } from './ui/DataTable';

export const scheduledColumns: Column<EmailItem>[] = [
  { header: 'Email', cell: (r) => <span className="font-medium">{r.to}</span> },
  { header: 'Subject', cell: (r) => <span className="line-clamp-1 max-w-xs">{r.subject}</span> },
  { header: 'Scheduled time', cell: (r) => formatDateTime(r.scheduledAt) },
  { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export const sentColumns: Column<EmailItem>[] = [
  { header: 'Email', cell: (r) => <span className="font-medium">{r.to}</span> },
  { header: 'Subject', cell: (r) => <span className="line-clamp-1 max-w-xs">{r.subject}</span> },
  { header: 'Sent time', cell: (r) => formatDateTime(r.sentAt) },
  {
    header: 'Status',
    cell: (r) => (
      <div className="flex items-center gap-3">
        <StatusBadge status={r.status} />
        {r.previewUrl && (
          <a href={r.previewUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent-strong underline-offset-2 hover:underline">
            Preview
          </a>
        )}
        {r.status === 'failed' && r.error && <span className="line-clamp-1 max-w-48 text-xs text-muted" title={r.error}>{r.error}</span>}
      </div>
    ),
  },
];

export const searchColumns: Column<SearchHit>[] = [
  { header: 'Email', cell: (r) => <span className="font-medium">{r.to}</span> },
  { header: 'Subject', cell: (r) => <span className="line-clamp-1 max-w-xs">{r.subject}</span> },
  { header: 'Time', cell: (r) => formatDateTime(r.sentAt ?? r.scheduledAt) },
  { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];
