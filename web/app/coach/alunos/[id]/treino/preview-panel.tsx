import type { WorkoutPlanWithDays } from "@/lib/repository";

/**
 * "Pré-visualizar como aluno" (item 18) — mostra o rascunho/publicado exatamente como
 * `app/portal/treino/page.tsx` renderiza hoje pro aluno (mesmos campos: sets/reps/descanso/
 * RIR/observações/instrução) — de propósito NÃO mostra cadência, bloco, superset/circuito ou
 * substituição aqui: a tela do aluno (item 19, fora do escopo desta tarefa) ainda não exibe
 * esses campos novos, então uma pré-visualização "rica" enganaria o coach sobre o que o aluno
 * realmente vê hoje. `<details>` nativo (sem JS) — Server Component.
 */
export default function PreviewPanel({ plan }: { plan: WorkoutPlanWithDays }) {
  return (
    <details className="rounded-lg border border-line bg-surface p-4">
      <summary className="cursor-pointer select-none font-medium text-ink">
        Pré-visualizar como aluno
      </summary>

      <p className="mt-3 text-xs text-ink-faint">
        Isto é o que o aluno vê hoje na tela de treino dele (portal) — cadência, bloco,
        superset/circuito e substituição ainda não aparecem lá (chegam numa próxima etapa).
      </p>

      <div className="mt-3 flex flex-col gap-5">
        <h3 className="break-words text-lg font-medium text-ink">{plan.name}</h3>

        {plan.days.length === 0 ? (
          <p className="text-sm text-ink-muted">Este treino ainda não tem dias configurados.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {plan.days.map((day) => (
              <li key={day.id} className="rounded-lg border border-line bg-surface-sunken/40 p-4">
                <h4 className="break-words font-medium text-ink">{day.name}</h4>

                {day.exercises.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">Nenhum exercício neste dia.</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-4">
                    {day.exercises.map((we) => (
                      <li key={we.id} className="flex flex-col gap-2 border-b border-line pb-4 last:border-b-0 last:pb-0">
                        <div>
                          <span className="break-words font-medium text-ink">{we.exercise.name}</span>
                          <p className="text-sm text-ink-muted">
                            {[
                              we.sets != null && `${we.sets} séries`,
                              we.reps != null && `${we.reps} reps`,
                              we.rest_sec != null && `${we.rest_sec}s descanso`,
                              we.rir != null && `RIR ${we.rir}`,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Sem detalhes"}
                          </p>
                          {we.notes && <p className="break-words text-xs text-ink-faint">{we.notes}</p>}
                          {we.exercise.instruction && (
                            <p className="break-words text-xs text-ink-faint">{we.exercise.instruction}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
