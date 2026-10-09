import { GOAL_DIRECTION_OPTIONS } from "@/lib/metrics-catalog";
import { getEffectiveClientMetrics, type EffectiveMetric } from "@/lib/metrics-settings";
import AddCustomMetricForm from "./add-custom-metric-form";
import { setMetricGoalAction, toggleMetricTrackedAction } from "./metric-settings-actions";

const PANEL = "flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4";
const PANEL_TITLE =
  "flex items-center gap-1.5 font-mono text-label uppercase tracking-widest text-ink-faint";
const INPUT =
  "min-h-11 rounded-md border border-line bg-surface-sunken px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand";

/**
 * Painel "Métricas acompanhadas" (item 17 do master TODO) — dentro do Resumo do aluno
 * (`app/coach/alunos/[id]/page.tsx`). O coach escolhe, PARA ESTE ALUNO: quais métricas do
 * catálogo padrão (peso/cintura/quadril/energia) acompanhar, cria métricas próprias, e define a
 * meta (valor-alvo + direção) de cada uma. Remover é sempre "parar de acompanhar" (`tracked =
 * false`) — nunca apaga a linha nem o histórico já gravado em `metrics`, que continua existindo
 * (visível em avaliação/evolução) mesmo depois de a métrica sair do check-in.
 *
 * Server Component: cada linha tem seu próprio `<form>` de Server Action (toggle e meta), sem
 * `useActionState` — mesmo padrão sem-JS-no-cliente de `publishWorkoutPlanAction`. Só o formulário
 * "Nova métrica" precisa de feedback de erro inline, por isso é o único client component aqui
 * (`add-custom-metric-form.tsx`).
 */
export default async function MetricSettingsPanel({ clientId }: { clientId: string }) {
  const metrics = await getEffectiveClientMetrics(clientId);

  return (
    <section aria-label="Métricas acompanhadas" className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-ink">Métricas acompanhadas</h2>
      <div className={PANEL}>
        <h3 className={PANEL_TITLE}>Por aluno</h3>
        <p className="text-sm text-ink-muted">
          Escolha quais métricas aparecem no check-in deste aluno e defina uma meta pra cada uma.
          Ocultar uma métrica não apaga o histórico já registrado — só para de perguntar dela daqui
          pra frente.
        </p>

        <ul className="flex flex-col divide-y divide-line">
          {metrics.map((metric) => (
            <MetricRow key={metric.key} clientId={clientId} metric={metric} />
          ))}
        </ul>

        <AddCustomMetricForm clientId={clientId} />
      </div>
    </section>
  );
}

function MetricRow({ clientId, metric }: { clientId: string; metric: EffectiveMetric }) {
  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-words text-sm font-medium text-ink">{metric.label}</span>
          {metric.unit && <span className="text-xs text-ink-faint">({metric.unit})</span>}
          {metric.source === "custom" && (
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-faint">
              própria do aluno
            </span>
          )}
          {!metric.tracked && (
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-faint">
              não acompanhada
            </span>
          )}
        </div>

        {/* Meta: valor-alvo + direção. Enviar sem valor limpa a meta (target_value = null). */}
        <form action={setMetricGoalAction} className="flex flex-wrap items-center gap-2 pt-1">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="metricKey" value={metric.key} />
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            Meta
            <input
              type="text"
              inputMode="decimal"
              name="targetValue"
              defaultValue={metric.targetValue ?? ""}
              placeholder="—"
              className={`${INPUT} w-20`}
              aria-label={`Valor-alvo de ${metric.label}`}
            />
          </label>
          <select
            name="goalDirection"
            defaultValue={metric.goalDirection ?? ""}
            className={INPUT}
            aria-label={`Direção da meta de ${metric.label}`}
          >
            <option value="">Sem direção</option>
            {GOAL_DIRECTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-11 rounded-md border border-line px-3 text-xs text-ink hover:border-brand"
          >
            Salvar meta
          </button>
        </form>
      </div>

      <form action={toggleMetricTrackedAction} className="shrink-0">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="metricKey" value={metric.key} />
        <input type="hidden" name="nextTracked" value={metric.tracked ? "false" : "true"} />
        <button
          type="submit"
          className={`min-h-11 rounded-md border px-3 text-xs transition-colors ${
            metric.tracked
              ? "border-line text-ink-muted hover:border-coral hover:text-coral-text"
              : "border-brand-tint-strong bg-brand-tint text-brand"
          }`}
        >
          {metric.tracked ? "Ocultar" : "Acompanhar"}
        </button>
      </form>
    </li>
  );
}
