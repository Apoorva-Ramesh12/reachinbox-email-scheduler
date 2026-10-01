import { useCallback, useEffect, useRef, useState } from 'react';

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Runs `fn` whenever `deps` change and optionally polls. Keeps previous data visible while
 * refetching (no flicker) and ignores out-of-order responses.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], pollMs?: number): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback((silent: boolean) => {
    const id = ++seq.current;
    if (!silent) setLoading(true);
    fnRef.current()
      .then((d) => {
        if (id !== seq.current) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (id === seq.current) setError(e instanceof Error ? e.message : 'Something went wrong');
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => run(false), [run, ...deps]);

  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => run(true), pollMs);
    return () => clearInterval(t);
  }, [pollMs, run]);

  return { data, loading, error, reload: () => run(false) };
}
