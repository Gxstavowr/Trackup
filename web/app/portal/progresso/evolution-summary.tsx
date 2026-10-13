import Link from "next/link";
import Icon from "@/components/ui/icon";
import type { ProgressSummary } from "@/lib/progress-summary";
import type { EvolutionPeriod } from "@/lib/evolution-format";

/** Uma variação observada no período: primeiro e último registro de UMA métrica e a diferença. */
export type SynthesisTile = {
  key: string;
  label: string;
  /** "80,2 kg → 78,1 kg". */
  range: string;
  /** "▼ −2,1 kg" / "Sem variação". */
  delta: string;
  /** "S5 → S10". */
  weeks: string;
};

function rulesNote(period: EvolutionPeriod): string {
  const window = period === "all" ? "de todo o histórico" : `das últimas ${period} semanas com medidas`;
  return `Montado por regras fixas sobre os valores que você registrou: compara o primeiro e o último registro ${window} (o mesmo período escolhido acima) e conta check-ins e metas dessa janela. Não é avaliação do seu coach, não usa inteligência artificial e não é recomendação — só um retrato dos números.`;
}

/**
 * Síntese visual + resumo automático (V3 tarefa 13). Fica DEPOIS do gráfico, dentro de "Medidas e
 * gráficos", e acompanha o mesmo período do seletor. É 100% baseado em regras
 * (`lib/progress-summary.ts` + `computeMetricTrend`): o rótulo diz isso e nada aqui fala em IA.
 * Só números observados (primeiro → último registro do período), sem tendência projetada, causa
 * ou diagnóstico. Sem dados suficientes vira uma linha discreta — nunca um card vazio grande.
 */
export default function EvolutionSummary({
  summary,
  tiles,
  period,
}: {
  summary: ProgressSummary;
  tiles: SynthesisTile[];
  period: EvolutionPeriod;
}) {
  if (summary.status !== "ok" && tiles.length === 0) {
    return (
      <p className="flex items-start gap-2 text-sm text-ink-faint">
        <Icon name="info" size={16} className="mt-0.5 shrink-0" />
        <span>
          Resumo automático dos seus registros: aparece quando o período tiver pelo menos duas semanas com medidas.
        </span>
      </p>
    );
  }

  // As frases de métrica viram os blocos numéricos; aqui ficam só as demais (estáveis, check-ins, metas).
  const items = summary.status === "ok" ? summary.items.filter((i) => !i.id.startsWith("metric-")) : [];

  return (
    <section
      id="resumo"
      aria-labelledby="resumo-titulo"
      className="card scroll-mt-20 flex flex-col gap-4 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="resumo-titulo" className="t-label flex items-center gap-2 text-brand">
          <Icon name="chart" size={16} />
          Resumo automático dos seus registros
        </h3>
        <span className="rounded-full bg-surface-raised px-2.5 py-1 text-xs font-semibold text-ink-muted">
          Baseado em regras
        </span>
      </div>

      {summary.status === "ok" && (
        <p className="t-helper">
          Período: <strong className="font-semibold text-ink">{summary.periodLabel}</strong>
        </p>
      )}

      {tiles.length > 0 && (
        <ul aria-label="Mudanças observadas no período" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <li key={t.key} className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface-sunken px-3 py-3">
              <span className="t-label truncate text-ink-faint">{t.label}</span>
              <span className="font-display text-lg font-bold leading-tight tabular-nums text-ink">{t.delta}</span>
              <span className="truncate text-xs tabular-nums text-ink-muted">{t.range}</span>
              <span className="text-xs text-ink-faint">{t.weeks}</span>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 py-2 first:pt-0 last:pb-0">
              <p className="text-sm leading-snug text-ink">{item.text}</p>
              <Link
                href={item.href === "#jornada" ? "#historico" : item.href}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                Ver
                <Icon name="chevron" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <details className="group text-sm text-ink-muted">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <span className="transition-transform group-open:rotate-90">
            <Icon name="chevron" size={16} />
          </span>
          Como este resumo é feito
        </summary>
        <p className="pb-1 pt-1">{rulesNote(period)}</p>
      </details>
    </section>
  );
}
