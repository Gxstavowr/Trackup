import { pillItemClass, pillTrackClass } from "@/components/ui/pill";
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
      <div className={pillTrackClass}>
        {items.map((item) => (
          <a key={item.href} href={item.href} className={pillItemClass(false, "sm")}>
            {item.label}
          </a>
        ))}
      </div>
      {decision && (
        <a href={decision.href} data-decision-shortcut className={`${buttonClass({ variant: "primary", size: "md" })} xl:hidden`}>
          {decision.label}
        </a>
      )}
    </nav>
  );
}
