interface Tab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

interface Props<K extends string> {
  tabs: Tab<K>[];
  active: K;
  onChange: (key: K) => void;
}

export function Tabs<K extends string>({ tabs, active, onChange }: Props<K>) {
  return (
    <div role="tablist" className="flex gap-6 border-b border-line">
      {tabs.map((t) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.key)}
            className={`-mb-px flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors ${
              selected ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`rounded-full px-2 py-0.5 text-xs ${selected ? 'bg-accent-soft text-accent-strong' : 'bg-line text-muted'}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
