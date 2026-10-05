interface EmptyStateProps {
  title: string;
  body: string;
  /** The way in: an empty screen always offers the first step. */
  action: React.ReactNode;
}

/** A screen with nothing on it yet: what it is for, and the first thing to do. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-2 rounded-lg border border-subtle bg-panel px-7 py-6 text-center">
      <h1 className="text-base font-semibold text-primary">{title}</h1>
      <p className="text-[13px] leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  );
}
