import type { ReactNode } from 'react';
import { Button } from './Button';
import { Spinner } from './Spinner';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  empty: ReactNode;
}

/** Generic table with built-in loading, error and empty states. */
export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty }: Props<T>) {
  if (error && !rows) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center" role="alert">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (loading && !rows) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-muted" aria-busy="true">
        <Spinner /> <span className="text-sm">Loading emails…</span>
      </div>
    );
  }
  if (rows && rows.length === 0) return <>{empty}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-paper text-xs font-medium text-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.header} className={`px-4 py-3 font-medium ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows?.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-paper/60">
              {columns.map((c) => (
                <td key={c.header} className={`px-4 py-3 ${c.className ?? ''}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
