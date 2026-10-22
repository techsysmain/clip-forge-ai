import type { ReactNode } from "react";

export function LegalDoc({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="space-y-5">
      <header className="space-y-1 border-b border-border pb-5">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
      </header>
      {children}
    </article>
  );
}

export const H2 = ({ children }: { children: ReactNode }) => <h2 className="pt-4 text-xl font-semibold tracking-tight">{children}</h2>;
export const P = ({ children }: { children: ReactNode }) => <p className="leading-relaxed text-foreground/85">{children}</p>;
export const UL = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc space-y-1.5 pl-6 leading-relaxed text-foreground/85">{children}</ul>
);
export const Note = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed text-foreground/85">{children}</div>
);
