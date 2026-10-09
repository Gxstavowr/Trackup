import "server-only";
import { countPendingEvaluations } from "@/lib/evaluations";

/**
 * Quantidade de avaliações aguardando o coach — alimenta o badge numérico do item
 * "Avaliações" na navegação (`coach-nav.tsx`).
 *
 * Conta REAL: alunos ativos com check-in enviado e SEM orientação enviada (avaliação pendente
 * + em avaliação + orientação em rascunho), a mesma definição da fila em `/coach` e da lista
 * em `/coach/avaliacoes` — por isso o badge nunca diverge do que essas telas mostram. O
 * cálculo (`lib/evaluations.ts`) é deduplicado por requisição com `cache()` do React: layout e
 * página pagam uma consulta só. O badge some sozinho quando a contagem é 0 (`CountBadge`).
 */
export async function getPendingEvaluationsCount(): Promise<number> {
  return countPendingEvaluations();
}
