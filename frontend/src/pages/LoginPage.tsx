import { Navigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';

const GoogleMark = () => (
  <svg className="size-5" viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.9 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

export function LoginPage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const error = params.get('error');

  if (loading) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <Spinner />
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <main className="grid min-h-full lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-accent" aria-hidden>
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
              <path d="M4 7l8 6 8-6M4 7v10h16V7z" />
            </svg>
          </span>
          <span className="font-semibold">Email Scheduler</span>
        </div>
        <div>
          {/* The product in one picture: a queue where early sends are done and the rest wait their turn. */}
          <div className="mb-8 flex flex-wrap gap-2" aria-hidden>
            {Array.from({ length: 36 }, (_, i) => (
              <span key={i} className={`size-3 rounded-full ${i < 11 ? 'bg-accent' : i < 14 ? 'bg-accent/50' : 'bg-white/15'}`} />
            ))}
          </div>
          <h1 className="max-w-md text-4xl leading-tight font-semibold tracking-tight">Every email goes out exactly when you said it would.</h1>
          <p className="mt-4 max-w-md text-white/70">Schedule thousands of sends, pace them per sender, and keep going through restarts without a duplicate.</p>
        </div>
        <p className="text-sm text-white/50">Built on BullMQ, Redis and MySQL.</p>
      </section>

      <section className="grid place-items-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-2 text-sm text-muted">Use your Google account to open your dashboard.</p>
          {error && (
            <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              Google sign-in failed ({error}). Try again.
            </p>
          )}
          <a
            href="/api/auth/google"
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-paper"
          >
            <GoogleMark />
            Continue with Google
          </a>
        </div>
      </section>
    </main>
  );
}
