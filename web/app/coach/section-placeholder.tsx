import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

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
        <span className="t-label text-ink-faint">
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
            className={buttonClass({ variant: "secondary", className: "mt-2" })}
          >
            {cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}
