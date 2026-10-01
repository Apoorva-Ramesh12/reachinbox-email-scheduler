import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { endpoints } from '../api/endpoints';
import { ComposeModal } from '../components/ComposeModal';
import { Header } from '../components/Header';
import { IntegrationsModal } from '../components/IntegrationsModal';
import { scheduledColumns, searchColumns, sentColumns } from '../components/EmailTables';
import { Button } from '../components/ui/Button';
import { DataTable } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { Pagination } from '../components/ui/Pagination';
import { Spinner } from '../components/ui/Spinner';
import { Tabs } from '../components/ui/Tabs';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { useDebounced } from '../hooks/useDebounced';

type TabKey = 'scheduled' | 'sent';
const PAGE_SIZE = 10;
const POLL_MS = 5000;

export function DashboardPage() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>('scheduled');
  const [pages, setPages] = useState<Record<TabKey, number>>({ scheduled: 1, sent: 1 });
  const [composeOpen, setComposeOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());

  const scheduled = useAsync(() => endpoints.scheduled(pages.scheduled, PAGE_SIZE), [pages.scheduled], POLL_MS);
  const sent = useAsync(() => endpoints.sent(pages.sent, PAGE_SIZE), [pages.sent], POLL_MS);
  const search = useAsync(() => (q ? endpoints.search(q, 1, 25) : Promise.resolve(undefined)), [q]);

  // Slack OAuth returns here with ?slack=connected|denied|error
  useEffect(() => {
    const status = params.get('slack');
    if (!status) return;
    if (status === 'connected') toast.success('Slack connected. You will be notified when a sender hits its hourly limit.');
    else if (status === 'denied') toast.info('Slack connection was cancelled.');
    else toast.error('Could not connect Slack. Please try again.');
    setParams({}, { replace: true });
  }, [params, setParams, toast]);

  if (loading) return <div className="grid h-full place-items-center text-muted"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace />;

  const active = tab === 'scheduled' ? scheduled : sent;
  const searching = q.length > 0;

  return (
    <div className="min-h-full">
      <Header onOpenIntegrations={() => setIntegrationsOpen(true)} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Emails</h1>
            <p className="mt-1 text-sm text-muted">Queued sends update every few seconds.</p>
          </div>
          <Button onClick={() => setComposeOpen(true)}>Compose new email</Button>
        </div>

        <div className="rounded-xl border border-line bg-white">
          <div className="space-y-4 px-4 pt-4 sm:px-6">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by recipient, subject or body"
              aria-label="Search emails"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            {!searching && (
              <Tabs
                active={tab}
                onChange={setTab}
                tabs={[
                  { key: 'scheduled', label: 'Scheduled emails', count: scheduled.data?.total },
                  { key: 'sent', label: 'Sent emails', count: sent.data?.total },
                ]}
              />
            )}
          </div>

          {searching ? (
            <DataTable
              columns={searchColumns}
              rows={search.data?.items}
              rowKey={(r) => r.id}
              loading={search.loading}
              error={search.error}
              onRetry={search.reload}
              empty={<EmptyState title="No matches" description={`Nothing found for “${q}”. Try a different recipient or subject.`} />}
            />
          ) : tab === 'scheduled' ? (
            <>
              <DataTable
                columns={scheduledColumns}
                rows={scheduled.data?.items}
                rowKey={(r) => r.id}
                loading={scheduled.loading}
                error={scheduled.error}
                onRetry={scheduled.reload}
                empty={
                  <EmptyState
                    title="No scheduled emails"
                    description="Upload a list of leads and pick a start time to queue your first campaign."
                    action={<Button onClick={() => setComposeOpen(true)}>Compose new email</Button>}
                  />
                }
              />
              <Pagination page={pages.scheduled} pageSize={PAGE_SIZE} total={scheduled.data?.total ?? 0} onChange={(p) => setPages((s) => ({ ...s, scheduled: p }))} />
            </>
          ) : (
            <>
              <DataTable
                columns={sentColumns}
                rows={sent.data?.items}
                rowKey={(r) => r.id}
                loading={sent.loading}
                error={sent.error}
                onRetry={sent.reload}
                empty={<EmptyState title="No sent emails yet" description="Emails appear here as soon as they are delivered or fail." />}
              />
              <Pagination page={pages.sent} pageSize={PAGE_SIZE} total={sent.data?.total ?? 0} onChange={(p) => setPages((s) => ({ ...s, sent: p }))} />
            </>
          )}
          {!searching && active.error && active.data && (
            <p className="border-t border-line px-6 py-2 text-xs text-danger" role="alert">
              Could not refresh: {active.error}
            </p>
          )}
        </div>
      </main>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onScheduled={() => {
          setPages({ scheduled: 1, sent: 1 });
          scheduled.reload();
          setTab('scheduled');
        }}
      />
      <IntegrationsModal open={integrationsOpen} onClose={() => setIntegrationsOpen(false)} />
    </div>
  );
}
