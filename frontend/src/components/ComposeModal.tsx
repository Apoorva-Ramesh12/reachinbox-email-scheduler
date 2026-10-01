import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { endpoints } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import { extractEmails } from '../utils/leads';
import { formatDateTime, formatDuration, toLocalInputValue } from '../utils/format';
import { Button } from './ui/Button';
import { Input, Textarea } from './ui/Field';
import { Modal } from './ui/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

interface Errors {
  subject?: string;
  body?: string;
  leads?: string;
  startTime?: string;
  delay?: string;
  limit?: string;
}

const defaultStart = () => toLocalInputValue(new Date(Date.now() + 5 * 60_000));

export function ComposeModal({ open, onClose, onScheduled }: Props) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fileName, setFileName] = useState('');
  const [leads, setLeads] = useState<string[]>([]);
  const [startTime, setStartTime] = useState(defaultStart);
  const [delay, setDelay] = useState('5');
  const [limit, setLimit] = useState('50');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const plan = useMemo(() => {
    const d = Number(delay);
    if (!leads.length || !Number.isFinite(d) || d < 0 || !startTime) return null;
    const start = new Date(startTime);
    return { start, end: new Date(start.getTime() + (leads.length - 1) * d * 1000), duration: (leads.length - 1) * d };
  }, [leads, delay, startTime]);

  const reset = () => {
    setSubject('');
    setBody('');
    setFileName('');
    setLeads([]);
    setStartTime(defaultStart());
    setDelay('5');
    setLimit('50');
    setErrors({});
    if (fileInput.current) fileInput.current.value = '';
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrors((p) => ({ ...p, leads: 'File is larger than 5 MB' }));
      return;
    }
    const found = extractEmails(await file.text());
    setFileName(file.name);
    setLeads(found);
    setErrors((p) => ({ ...p, leads: found.length ? undefined : 'No email addresses found in this file' }));
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!subject.trim()) e.subject = 'Enter a subject';
    if (!body.trim()) e.body = 'Enter the email body';
    if (!leads.length) e.leads = 'Upload a CSV or text file with at least one email address';
    else if (leads.length > 10_000) e.leads = 'A campaign can contain at most 10,000 recipients';
    if (!startTime || Number.isNaN(new Date(startTime).getTime())) e.startTime = 'Choose a start time';
    const d = Number(delay);
    if (!Number.isInteger(d) || d < 0) e.delay = 'Use a whole number of seconds (0 or more)';
    const l = Number(limit);
    if (!Number.isInteger(l) || l < 1) e.limit = 'Use a whole number of 1 or more';
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      const res = await endpoints.schedule({
        subject: subject.trim(),
        body: body.trim(),
        emails: leads,
        startTime: new Date(startTime).toISOString(),
        delaySeconds: Number(delay),
        hourlyLimit: Number(limit),
      });
      toast.success(`Scheduled ${res.total} emails. First send: ${formatDateTime(res.firstSendAt)}`);
      reset();
      onScheduled();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not schedule emails');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compose new email"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="compose-form" loading={submitting}>
            {leads.length ? `Schedule ${leads.length} emails` : 'Schedule'}
          </Button>
        </>
      }
    >
      <form id="compose-form" onSubmit={(e) => void submit(e)} className="space-y-5" noValidate>
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} error={errors.subject} placeholder="Quick question about {{company}}" maxLength={500} />
        <Textarea label="Body" value={body} onChange={(e) => setBody(e.target.value)} error={errors.body} placeholder="Write your message. HTML is supported." />

        <div className="space-y-1.5">
          <span className="block text-sm font-medium">Leads</span>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line p-3">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
              Upload CSV or text file
            </Button>
            <input ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e)} aria-label="Upload leads file" />
            <p className="text-sm text-muted" aria-live="polite">
              {leads.length ? (
                <>
                  <span className="font-semibold text-accent-strong">{leads.length} email addresses detected</span> in {fileName}
                </>
              ) : (
                'No file selected'
              )}
            </p>
          </div>
          {errors.leads && (
            <p className="text-xs text-danger" role="alert">
              {errors.leads}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Start time" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} error={errors.startTime} />
          <Input label="Delay between emails (seconds)" type="number" min={0} value={delay} onChange={(e) => setDelay(e.target.value)} error={errors.delay} />
          <Input label="Hourly limit per sender" type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} error={errors.limit} hint="Extra emails roll into the next hour." />
        </div>

        {plan && (
          <div className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-strong">
            Sends start {formatDateTime(plan.start.toISOString())} and finish around {formatDateTime(plan.end.toISOString())} ({formatDuration(plan.duration)}), unless an hourly limit pushes some into later hours.
          </div>
        )}
      </form>
    </Modal>
  );
}
