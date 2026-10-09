import { macroProgress, type NutritionTargets } from "@/lib/nutrition-builder";
import type { DaySummary } from "@/lib/nutrition-session";
import { CARD } from "../portal-ui";

/**
 * Resumo do dia (item 21 — "mostrar resumo do dia"): quantas refeições em cada status hoje +
 * macros consumidos (refeições `done`/`partial`) contra os planejados e contra a meta do
 * plano (quando definida). Componente puro (sem estado) — todo o cálculo já veio pronto de
 * `computeDaySummary`/`macroProgress`, aqui é só apresentação.
 */
export default function DaySummaryCard({
  summary,
  targets,
}: {
  summary: DaySummary;
  targets: NutritionTargets;
}) {
  const progress = macroProgress(summary.macrosConsumed, targets);
  const eaten = summary.mealsDone + summary.mealsPartial;

  return (
    <div className={`${CARD} flex flex-col gap-3 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-label uppercase tracking-widest text-ink-faint">Resumo do dia</h2>
        <span className="text-sm text-ink-muted">
          {eaten}/{summary.mealsTotal} {summary.mealsTotal === 1 ? "refeição" : "refeições"}
          {summary.mealsSkipped > 0 && ` · ${summary.mealsSkipped} não realizada${summary.mealsSkipped === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Kcal"
          value={`${Math.round(summary.macrosConsumed.kcal)} / ${Math.round(summary.macrosPlanned.kcal)}`}
          sub={progress.kcal != null ? `${progress.kcal}% da meta` : undefined}
        />
        <Stat
          label="Proteína"
          value={`${Math.round(summary.macrosConsumed.protein_g)}g`}
          sub={progress.protein_g != null ? `${progress.protein_g}% da meta` : undefined}
        />
        <Stat
          label="Carbo"
          value={`${Math.round(summary.macrosConsumed.carbs_g)}g`}
          sub={progress.carbs_g != null ? `${progress.carbs_g}% da meta` : undefined}
        />
        <Stat
          label="Gordura"
          value={`${Math.round(summary.macrosConsumed.fat_g)}g`}
          sub={progress.fat_g != null ? `${progress.fat_g}% da meta` : undefined}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">{label}</span>
      <span className="break-words font-display text-lg text-ink">{value}</span>
      {sub && <span className="text-xs text-ink-faint">{sub}</span>}
    </div>
  );
}
