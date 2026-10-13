import type { KnownTotals } from "@/lib/food-macros";
import { formatNumber, MACRO_KEYS } from "@/lib/food-macros";
import { KCAL_MISSING_LABEL, missingKcalNote, type KcalSum } from "@/lib/meal-kcal";
import type { NutritionTargets } from "@/lib/nutrition-builder";
import { CARD } from "../portal-ui";

type Props = {
  /** "today": previsto + registrado x meta. "plan": previsto do dia x meta (outros dias). */
  mode: "today" | "plan";
  /** kcal previstas pelas refeições do dia (`lib/meal-kcal.ts`). */
  plannedKcal: KcalSum;
  /** kcal das refeições registradas como feitas/parciais; `null` = nada registrado (ou outro dia). */
  consumedKcal: KcalSum | null;
  plannedMacros: KnownTotals;
  consumedMacros: KnownTotals | null;
  targets: NutritionTargets;
  mealsTotal: number;
  mealsEaten: number;
  mealsSkipped: number;
  dayLabel?: string;
};

function KcalValue({ sum, size }: { sum: KcalSum; size: "lg" | "md" }) {
  const note = missingKcalNote(sum);
  return (
    <>
      {sum.kcal != null ? (
        <span className={`font-display font-extrabold leading-none tabular-nums ${size === "lg" ? "text-3xl text-brand" : "text-2xl text-ink"}`}>
          {formatNumber(sum.kcal, 0)}
          <span className="ml-1 text-sm font-semibold text-ink-faint">kcal</span>
        </span>
      ) : (
        <span className="text-sm text-ink-faint">{KCAL_MISSING_LABEL}</span>
      )}
      {sum.partial && note && <span className="text-xs text-ink-faint">Parcial · {note}</span>}
    </>
  );
}

/**
 * Resumo do dia (V3 tarefa 11): hierarquia previsto → registrado → progresso x meta.
 *  1. kcal previstas no plano (com "parcial" se algum alimento não tem kcal);
 *  2. kcal registradas hoje — só quando há refeição marcada (feita/parcial); sem registro, diz
 *     isso em vez de mostrar 0;
 *  3. barras de kcal e macros contra a META do coach (sem meta, contra o previsto), usando o
 *     registrado quando existe e, senão, o previsto — sempre rotulado.
 * Nunca mostra 0 no lugar de dado ausente. Componente puro.
 */
export default function DaySummaryCard({
  mode,
  plannedKcal,
  consumedKcal,
  plannedMacros,
  consumedMacros,
  targets,
  mealsTotal,
  mealsEaten,
  mealsSkipped,
  dayLabel,
}: Props) {
  const title = mode === "today" ? "Resumo do dia" : `Previsto · ${dayLabel ?? "dia"}`;
  const mealsLine =
    mode === "today" ? (
      <>
        <b className="text-brand">{mealsEaten}</b> de {mealsTotal} {mealsTotal === 1 ? "refeição" : "refeições"}
      </>
    ) : (
      <>
        {mealsTotal} {mealsTotal === 1 ? "refeição" : "refeições"}
      </>
    );

  const noMacroData =
    plannedKcal.kcal == null &&
    MACRO_KEYS.every((k) => plannedMacros[k] == null) &&
    !(targets.target_kcal && targets.target_kcal > 0) &&
    !(targets.target_protein_g && targets.target_protein_g > 0) &&
    !(targets.target_carbs_g && targets.target_carbs_g > 0) &&
    !(targets.target_fat_g && targets.target_fat_g > 0);

  if (noMacroData) {
    return (
      <section className={`${CARD} flex flex-col gap-1 p-4`} aria-label="Resumo do dia">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="t-label text-ink-faint">{title}</h2>
          <span className="text-sm text-ink-muted">{mealsLine}</span>
        </div>
        {mode === "today" && mealsSkipped > 0 && (
          <p className="text-xs text-ink-faint">
            {mealsSkipped} não realizada{mealsSkipped === 1 ? "" : "s"}
          </p>
        )}
        <p className="text-sm text-ink-muted">Seu coach não informou calorias e macros neste plano.</p>
      </section>
    );
  }

  const showConsumed = mode === "today";
  const progressFromConsumed = showConsumed && consumedKcal != null;
  const progressKcal = progressFromConsumed ? consumedKcal.kcal : plannedKcal.kcal;
  const progressMacros = progressFromConsumed && consumedMacros ? consumedMacros : plannedMacros;
  const sourceLabel = progressFromConsumed ? "Registrado hoje" : "Previsto no plano";

  const hasTarget = !!(targets.target_kcal && targets.target_kcal > 0);
  // Sem meta: em "hoje" compara o registrado com o previsto; no modo plano não há referência.
  const kcalRef = hasTarget ? targets.target_kcal : progressFromConsumed ? plannedKcal.kcal : null;
  const kcalPct = progressKcal != null && kcalRef ? Math.round((progressKcal / kcalRef) * 100) : null;

  const bars = [
    { key: "protein_g", label: "Proteína", color: "bg-info", target: targets.target_protein_g, plan: plannedMacros.protein_g, value: progressMacros.protein_g },
    { key: "carbs_g", label: "Carboidrato", color: "bg-warning", target: targets.target_carbs_g, plan: plannedMacros.carbs_g, value: progressMacros.carbs_g },
    { key: "fat_g", label: "Gordura", color: "bg-success", target: targets.target_fat_g, plan: plannedMacros.fat_g, value: progressMacros.fat_g },
  ] as const;

  return (
    <section className={`${CARD} flex flex-col gap-4 p-4`} aria-label="Resumo do dia">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-label text-ink-faint">{title}</h2>
        <span className="text-sm text-ink-muted">
          {mealsLine}
          {mode === "today" && mealsSkipped > 0 && ` · ${mealsSkipped} não feita${mealsSkipped === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className={`grid gap-3 ${showConsumed ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="flex min-w-0 flex-col gap-1.5 rounded-md bg-surface-sunken/60 p-3">
          <span className="text-xs font-medium text-ink-muted">Previsto no plano</span>
          <KcalValue sum={plannedKcal} size={showConsumed ? "md" : "lg"} />
        </div>
        {showConsumed && (
          <div className="flex min-w-0 flex-col gap-1.5 rounded-md bg-brand-tint p-3">
            <span className="text-xs font-medium text-ink-muted">Registrado hoje</span>
            {consumedKcal ? (
              <KcalValue sum={consumedKcal} size="lg" />
            ) : (
              <span className="text-sm text-ink-muted">Nenhuma refeição registrada ainda</span>
            )}
          </div>
        )}
      </div>

      {kcalRef != null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-ink-muted">
              {hasTarget ? "Meta do coach" : "Previsto"}: <b className="text-ink tabular-nums">{formatNumber(kcalRef, 0)} kcal</b>
            </span>
            {kcalPct != null && (
              <span className="tabular-nums text-ink">
                <b className="font-display">{kcalPct}%</b>
              </span>
            )}
          </div>
          <div
            role="progressbar"
            aria-label={`kcal — ${sourceLabel.toLowerCase()}`}
            aria-valuemin={0}
            aria-valuemax={kcalRef}
            aria-valuenow={progressKcal ?? 0}
            className="h-2.5 overflow-hidden rounded-full bg-surface-sunken"
          >
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{ width: `${kcalPct != null ? Math.min(100, kcalPct) : 0}%` }}
            />
          </div>
          {!hasTarget && mode === "today" && <span className="text-xs text-ink-faint">Sem meta de calorias definida.</span>}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium text-ink-faint">Macros · {sourceLabel.toLowerCase()}</span>
        {bars.map((bar) => {
          const ref = bar.target && bar.target > 0 ? bar.target : bar.plan;
          const pct = bar.value != null && ref ? Math.min(100, (bar.value / ref) * 100) : 0;
          return (
            <div key={bar.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-ink-muted">{bar.label}</span>
                <span className="tabular-nums text-ink">
                  <b className="font-display">{bar.value == null ? "—" : `${formatNumber(bar.value)} g`}</b>
                  {ref != null && <span className="text-ink-faint"> / {formatNumber(ref)} g</span>}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={bar.label}
                aria-valuemin={0}
                aria-valuemax={ref ?? 0}
                aria-valuenow={bar.value ?? 0}
                className="h-2 overflow-hidden rounded-full bg-surface-sunken"
              >
                <div className={`h-full rounded-full ${bar.color} transition-[width]`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
