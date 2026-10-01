import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

const control =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  id: string;
  children: ReactNode;
}

function FieldShell({ label, hint, error, id, children }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

type Shared = { label: string; hint?: string; error?: string };

export function Input({ label, hint, error, ...rest }: Shared & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell {...{ label, hint, error, id }}>
      <input id={id} aria-invalid={!!error} className={`${control} ${error ? 'border-danger' : 'border-line'}`} {...rest} />
    </FieldShell>
  );
}

export function Textarea({ label, hint, error, ...rest }: Shared & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell {...{ label, hint, error, id }}>
      <textarea id={id} aria-invalid={!!error} className={`${control} min-h-32 resize-y ${error ? 'border-danger' : 'border-line'}`} {...rest} />
    </FieldShell>
  );
}
