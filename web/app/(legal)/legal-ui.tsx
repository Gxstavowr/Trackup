import { LEGAL_VERSION } from "@/lib/legal/documents";

/** Blocos de texto das páginas legais — mesma tipografia do design system, leitura longa. */

export function LegalHeader({ title, intro }: { title: string; intro: string }) {
  const [y, m, d] = LEGAL_VERSION.split("-");
  return (
    <header className="mb-6 flex flex-col gap-2">
      <h1 className="font-display text-hero text-ink">{title}</h1>
      <p className="font-mono text-label uppercase tracking-widest text-ink-faint">
        Versão {LEGAL_VERSION} · vigente desde {d}/{m}/{y}
      </p>
      <p className="text-sm text-ink-muted">{intro}</p>
    </header>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 flex flex-col gap-2 text-sm leading-relaxed text-ink-muted [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      {children}
    </section>
  );
}
