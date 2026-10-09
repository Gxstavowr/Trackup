import type { NutritionPlanWithMeals } from "@/lib/repository";

/**
 * "Pré-visualizar como aluno" (item 20) — mostra o rascunho/publicado exatamente como
 * `app/portal/nutricao/page.tsx` renderiza hoje pro aluno (mesmos campos: nome/horário da
 * refeição, alimento, `qty`, macros) — de propósito NÃO mostra dia da semana, observações
 * da refeição/item, quantidade estruturada ou substituições aqui: a tela do aluno (item 21,
 * fora do escopo desta tarefa) ainda não exibe esses campos novos, então uma
 * pré-visualização "rica" enganaria o coach sobre o que o aluno realmente vê hoje.
 * `<details>` nativo (sem JS) — Server Component, mesmo padrão de `PreviewPanel` do treino.
 */
export default function PreviewPanel({ plan }: { plan: NutritionPlanWithMeals }) {
  return (
    <details className="rounded-lg border border-line bg-surface p-4">
      <summary className="cursor-pointer select-none font-medium text-ink">
        Pré-visualizar como aluno
      </summary>

      <p className="mt-3 text-xs text-ink-faint">
        Isto é o que o aluno vê hoje na tela de nutrição dele (portal) — dia da semana,
        observações, quantidade estruturada e substituições ainda não aparecem lá (chegam
        numa próxima etapa).
      </p>

      <div className="mt-3 flex flex-col gap-5">
        <h3 className="break-words text-lg font-medium text-ink">{plan.name}</h3>

        {plan.meals.length === 0 ? (
          <p className="text-sm text-ink-muted">Este plano ainda não tem refeições configuradas.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {plan.meals.map((meal) => (
              <li key={meal.id} className="rounded-lg border border-line bg-surface-sunken/40 p-4">
                <div className="flex items-center gap-2">
                  <h4 className="break-words font-medium text-ink">{meal.name}</h4>
                  {meal.time && <span className="text-xs text-ink-faint">{meal.time.slice(0, 5)}</span>}
                </div>

                {meal.items.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">Nenhum alimento nesta refeição.</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {meal.items.map((item) => (
                      <li key={item.id} className="border-b border-line pb-2 text-sm last:border-b-0 last:pb-0">
                        <span className="break-words font-medium text-ink">
                          {item.food?.name ?? "Alimento removido"}
                          {item.qty ? ` — ${item.qty}` : ""}
                        </span>
                        {(item.macros.kcal != null ||
                          item.macros.protein_g != null ||
                          item.macros.carbs_g != null ||
                          item.macros.fat_g != null) && (
                          <p className="break-words text-ink-muted">
                            {[
                              item.macros.kcal != null && `${item.macros.kcal} kcal`,
                              item.macros.protein_g != null && `${item.macros.protein_g}g prot`,
                              item.macros.carbs_g != null && `${item.macros.carbs_g}g carbo`,
                              item.macros.fat_g != null && `${item.macros.fat_g}g gord`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
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
