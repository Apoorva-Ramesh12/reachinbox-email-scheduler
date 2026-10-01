import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';

export function Header({ onOpenIntegrations }: { onOpenIntegrations: () => void }) {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-white" aria-hidden>
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
              <path d="M4 7l8 6 8-6M4 7v10h16V7z" />
            </svg>
          </span>
          <span className="font-semibold">Email Scheduler</span>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onOpenIntegrations}>
            Integrations
          </Button>
          {user && (
            <div className="flex items-center gap-3 border-l border-line pl-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm leading-tight font-medium">{user.name}</p>
                <p className="text-xs leading-tight text-muted">{user.email}</p>
              </div>
              <Avatar name={user.name} src={user.avatarUrl} />
              <Button variant="secondary" size="sm" onClick={() => void logout()}>
                Log out
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
