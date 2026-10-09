import { notFound } from "next/navigation";
import { requireCoach } from "../../../require-coach";
import { getStudentTimeline } from "@/lib/history";
import HistoryTimeline from "./history-timeline";

/**
 * Histórico do aluno (`/coach/alunos/[id]/historico`, item 16 do TODO) — aba "Histórico" do
 * workspace do aluno (o item 12 deixou essa aba explicitamente fora, dependente deste item).
 * Timeline longitudinal: semanas (check-in, avaliação), orientações enviadas, metas (com mudança
 * de valor-alvo derivada — ver limitação em `lib/history.ts`) e eventos importantes de
 * `history_events`, com detalhe de cada semana aberto sob demanda (client component
 * `HistoryTimeline`). Preserva histórico após edição do plano atual: nenhuma leitura aqui toca
 * `workout_plans`/`nutrition_plans` (dado mutável do plano CORRENTE).
 */
export default async function StudentHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Guard de role + posse — layouts não re-renderizam entre abas, então a página checa por conta
  // própria (mesmo padrão de fotos/pagamento/treino/nutrição).
  await requireCoach();

  const timeline = await getStudentTimeline(id);
  if (!timeline) {
    // RLS: aluno inexistente e aluno de outra conta são indistinguíveis — 404 nos dois casos.
    notFound();
  }

  const isEmpty =
    timeline.weeks.length === 0 && timeline.unmatchedEvents.length === 0 && !timeline.joinedAt;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Histórico" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-ink">Histórico</h2>
        <p className="text-sm text-ink-muted">
          A evolução da relação com {timeline.clientName} ao longo das semanas — check-ins,
          avaliações, orientações e metas. Clique numa semana para ver os detalhes.
        </p>
      </section>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-14 text-center">
          <p className="font-display text-hero text-ink">Ainda sem histórico</p>
          <p className="max-w-sm text-sm text-ink-muted">
            O histórico aparece aqui assim que o aluno enviar o primeiro check-in ou você registrar
            a primeira orientação/meta.
          </p>
        </div>
      ) : (
        <HistoryTimeline timeline={timeline} />
      )}
    </div>
  );
}
