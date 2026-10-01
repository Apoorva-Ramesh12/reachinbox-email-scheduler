export function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) return <img src={src} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full object-cover" />;
  return (
    <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong" aria-hidden>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
