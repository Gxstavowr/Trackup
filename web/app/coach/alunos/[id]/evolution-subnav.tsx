import Link from "next/link";

const SECTIONS = [
  { segment: "evolucao", label: "Métricas" },
  { segment: "fotos", label: "Fotos" },
  { segment: "historico", label: "Histórico" },
] as const;

/**
 * Seções da experiência de evolução do aluno: Métricas | Fotos | Histórico. Cada uma mantém a
 * sua URL (`/evolucao`, `/fotos`, `/historico`), então links antigos continuam valendo; a aba
 * "Evolução" do workspace fica ativa nas três.
 */
export default function EvolutionSubnav({
  clientId,
  active,
}: {
  clientId: string;
  active: (typeof SECTIONS)[number]["segment"];
}) {
  return (
    <nav aria-label="Seções da evolução" className="overflow-x-auto">
      <ul className="flex min-w-max gap-2">
        {SECTIONS.map((s) => (
          <li key={s.segment}>
            <Link
              href={`/coach/alunos/${clientId}/${s.segment}`}
              aria-current={s.segment === active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors ${
                s.segment === active
                  ? "border-brand bg-brand-tint text-brand"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
