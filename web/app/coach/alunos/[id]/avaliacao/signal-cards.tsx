import { Badge, type BadgeTone } from "@/components/ui/badge";
import { deriveSignalCards, hasPriorWeeks, type SignalCard, type SignalCardTone } from "@/lib/evaluation-signals";
import type { EvaluationDetail } from "@/lib/evaluations";

const TONE: Record<SignalCardTone, { badge: BadgeTone; border: string }> = {
  attention: { badge: "warning", border: "border-warning/45" },
  info: { badge: "info", border: "border-info/35" },
  neutral: { badge: "neutral", border: "border-line" },
  positive: { badge: "success", border: "border-success/35" },
};

/**
 * Sinais da semana: cartões só com o que a comparação não mostra — variação acima do limite,
 * estabilidade ao longo das semanas, check-ins e metas (a variação comum contra a semana anterior
 * fica em "Comparar com outra semana"; o "Ver contexto" lista só semanas passadas). Tudo vem de `deriveSignalCards` (regras e limiares fixos sobre dado real); o texto só
 * descreve números registrados — não explica causa nem diagnostica. O contexto (semanas, metas)
 * abre num `<details>` para a tela não virar parede de texto.
 */
export default function SignalCards({ detail }: { detail: EvaluationDetail }) {
  const cards = deriveSignalCards(detail);
  const attention = cards.filter((c) => c.tone === "attention").length;

  return (
    <section aria-label="Sinais da semana" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="t-subtitle text-ink">Sinais da semana</h2>
        {cards.length > 0 && (
          <span className="text-sm text-ink-muted">
            {attention > 0 ? `${attention} ${attention === 1 ? "ponto" : "pontos"} de atenção` : "Nenhum ponto de atenção"}
          </span>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-sm text-ink-muted">
          {hasPriorWeeks(detail)
            ? "Nenhum sinal fora do comum. A variação contra a semana anterior está em \"Comparar com outra semana\"."
            : detail.row.weekNumber > 1
              ? "As semanas anteriores não têm dados para comparar com esta."
              : "Esta é a primeira semana do aluno — ainda não há semanas anteriores para comparar."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.id} className="min-w-0" data-signal={card.id}>
              <SignalCardView card={card} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-faint">
        Calculados a partir dos registros do aluno: são pontos para você observar, não um diagnóstico.
      </p>
    </section>
  );
}

function SignalCardView({ card }: { card: SignalCard }) {
  const tone = TONE[card.tone];
  return (
    <article className={`card flex h-full flex-col gap-2 border p-4 ${tone.border}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="t-label text-ink-muted">{card.title}</span>
        <Badge tone={tone.badge}>
          {/* O selo já diz "Atenção" em alguns cartões; o prefixo só entra quando acrescenta algo. */}
          {card.tone === "attention" && card.badge !== "Atenção" && <span className="sr-only">Atenção: </span>}
          {card.badge}
        </Badge>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-2xl leading-none text-ink">{card.value}</span>
        {card.valueCaption && <span className="text-xs text-ink-muted">{card.valueCaption}</span>}
      </p>
      <p className="t-helper">{card.description}</p>
      {card.context && card.context.length > 0 && (
        <details className="mt-auto">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-brand hover:underline [&::-webkit-details-marker]:hidden">
            Ver contexto
          </summary>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-sunken text-sm">
            {card.context.map((row) => (
              <li key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                <span className={row.current ? "font-semibold text-ink" : "text-ink-muted"}>
                  {row.label}
                  {row.current ? " (atual)" : ""}
                </span>
                <span className="text-ink">{row.value}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

const DOT: Record<SignalCardTone, string> = {
  attention: "bg-warning",
  info: "bg-info",
  neutral: "bg-ink-faint",
  positive: "bg-success",
};

/**
 * Faixa compacta dos sinais da semana, no topo da avaliação: um "chip" por sinal (cor de estado +
 * o que mede + número + selo), pontos de atenção primeiro. A explicação e o contexto de cada sinal
 * ficam recolhidos em "Contexto histórico" (`SignalCards`) — aqui só o essencial para bater o olho.
 * Sinais neutros (estável/igual) ficam fora — a comparação já mostra isso. Sem sinais, não
 * renderiza nada (o contexto já explica por quê).
 */
export function SignalStrip({ detail, contextHref }: { detail: EvaluationDetail; contextHref: string }) {
  const order: SignalCardTone[] = ["attention", "info", "positive", "neutral"];
  // Sinais neutros ("Estável", "Igual") repetiriam a área de comparação: ficam só no contexto.
  const cards = deriveSignalCards(detail)
    .filter((c) => c.tone !== "neutral")
    .sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone));
  if (cards.length === 0) return null;
  return (
    <section aria-label="Sinais da semana" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-label text-ink-faint">Sinais da semana</h2>
        <a href={contextHref} className="text-xs font-semibold text-brand hover:underline">
          Detalhes no contexto histórico
        </a>
      </div>
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
        {cards.map((card) => (
          <li
            key={card.id}
            data-signal-chip={card.id}
            className={`flex shrink-0 snap-start items-center gap-2.5 rounded-full border bg-surface px-3 py-1.5 ${TONE[card.tone].border}`}
          >
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[card.tone]}`} />
            <span className="text-xs text-ink-muted">{card.title}</span>
            <span className="font-display text-sm font-bold tabular-nums text-ink">{card.value}</span>
            <Badge tone={TONE[card.tone].badge}>
              {card.tone === "attention" && card.badge !== "Atenção" && <span className="sr-only">Atenção: </span>}
              {card.badge}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
