import type { ReactNode } from "react";

/** One titled block of the detail panel, with an optional action beside the title. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = `section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="border-b border-subtle p-4 last:border-b-0">
      <div className="mb-2.5 flex min-h-[26px] items-center justify-between gap-2.5">
        <h2 id={id} className="m-0 font-mono text-[10px] font-normal uppercase tracking-[0.13em] text-muted">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
