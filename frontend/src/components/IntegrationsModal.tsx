import { useState } from 'react';
import { endpoints } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Spinner } from './ui/Spinner';

export function IntegrationsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const slack = useAsync(() => endpoints.slackStatus(), [open]);
  const senders = useAsync(() => endpoints.senders(), [open]);
  const [busy, setBusy] = useState<'add' | 'test' | 'disconnect' | null>(null);

  const run = async (kind: typeof busy, work: () => Promise<void>, okMessage: string) => {
    setBusy(kind);
    try {
      await work();
      toast.success(okMessage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Integrations">
      <div className="space-y-8">
        <section>
          <h3 className="font-semibold">Slack alerts</h3>
          <p className="mt-1 text-sm text-muted">Get a Slack message when a sender reaches its hourly limit.</p>
          <div className="mt-3 rounded-lg border border-line p-4">
            {slack.loading && !slack.data ? (
              <Spinner />
            ) : slack.error ? (
              <p className="text-sm text-danger">{slack.error}</p>
            ) : slack.data?.connected ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  Connected to <span className="font-medium">{slack.data.teamName ?? 'your workspace'}</span>
                  {slack.data.channel && <> · {slack.data.channel}</>}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" loading={busy === 'test'} onClick={() => void run('test', async () => void (await endpoints.slackTest()), 'Test message sent to Slack')}>
                    Send test message
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy === 'disconnect'}
                    onClick={() =>
                      void run(
                        'disconnect',
                        async () => {
                          await endpoints.slackDisconnect();
                          slack.reload();
                        },
                        'Slack disconnected',
                      )
                    }
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">Not connected. Rate-limit hits will not notify anyone.</p>
                <Button size="sm" onClick={() => window.location.assign('/api/slack/connect')}>
                  Connect Slack
                </Button>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="font-semibold">Sender accounts</h3>
          <p className="mt-1 text-sm text-muted">Emails are spread across your senders. Each sender has its own hourly limit.</p>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {senders.loading && !senders.data && (
              <li className="p-4">
                <Spinner />
              </li>
            )}
            {senders.data?.items.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="truncate font-medium">{s.email}</span>
                <span className="text-xs text-muted">{s.host}</span>
              </li>
            ))}
            {senders.data?.items.length === 0 && <li className="px-4 py-3 text-sm text-muted">No senders yet. One is created automatically on your first schedule.</li>}
          </ul>
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            loading={busy === 'add'}
            onClick={() => void run('add', async () => { await endpoints.addSender(); senders.reload(); }, 'New Ethereal sender created')}
          >
            Add Ethereal sender
          </Button>
        </section>
      </div>
    </Modal>
  );
}
