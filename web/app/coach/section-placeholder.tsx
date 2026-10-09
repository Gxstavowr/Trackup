import Link from "next/link";

/**
 * Casca de uma seção da navegação do coach que AINDA NÃO tem implementação real
 * (Avaliações, Financeiro, Configurações). Estado vazio explicativo — diz o que a seção vai
 * ser e qual é a próxima ação útil hoje, sem fingir dado nenhum.
 */
export default function SectionPlaceholder({
  eyebrow,
  title,
  emptyTitle,
  emptyText,
  cta,
}: {
  eyebrow: string;
  title: string;
  emptyTitle: string;
  emptyText: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
          {eyebrow}
        </span>
        <h1 className="font-display text-hero text-ink">{title}</h1>
      </header>

      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-14 text-center">
        <p className="font-display text-hero text-ink">{emptyTitle}</p>
        <p className="max-w-md text-sm text-ink-muted">{emptyText}</p>
        {cta && (
          <Link
            href={cta.href}
            className="mt-2 inline-flex min-h-11 items-center rounded-md border border-line px-4 py-2 text-sm text-ink hover:border-brand"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}
