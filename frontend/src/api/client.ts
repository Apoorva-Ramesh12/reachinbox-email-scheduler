export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: { message?: string; details?: { path: string; message: string }[] };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const body = data as ErrorBody;
    const detail = body.error?.details?.[0];
    const message = detail ? `${detail.path ? detail.path + ': ' : ''}${detail.message}` : (body.error?.message ?? `Request failed (${res.status})`);
    throw new ApiError(res.status, message, body.error?.details);
  }
  return data as T;
}
