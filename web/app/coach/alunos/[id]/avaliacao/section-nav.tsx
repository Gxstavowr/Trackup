import { buttonClass } from "@/components/ui/button";

/**
 * Atalhos para as áreas da avaliação, logo abaixo do cabeçalho. O atalho da decisão é o botão
 * primário (no celular a decisão fica no fim da página; no desktop ela já está na coluna lateral).
 */
export default function SectionNav({
  items,
  decision,
}: {
  items: { href: string; label: string }[];
  decision?: { href: string; label: string };
}) {
  return (
    <nav aria-label="Áreas da avaliação" className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {item.label}
        </a>
      ))}
      {decision && (
        <a href={decision.href} className={`${buttonClass({ variant: "primary", size: "md" })} lg:hidden`}>
          {decision.label}
        </a>
      )}
    </nav>
  );
}
