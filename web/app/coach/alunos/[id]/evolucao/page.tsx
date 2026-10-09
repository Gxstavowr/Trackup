import { notFound } from "next/navigation";
import { requireCoach } from "../../../require-coach";
import { getStudentEvolution } from "@/lib/evolution";
import EvolutionView from "./evolution-view";

/**
 * Evolução do aluno (`/coach/alunos/[id]/evolucao`, item 15 do TODO) — aba "Evolução" do
 * workspace do aluno (o item 12 reservou esse slot, dependente deste item). Tendência NUMÉRICA
 * das métricas ao longo das semanas: gráfico principal de peso (quando acompanhado) + cards
 * compactos das demais métricas acompanhadas, com seletor de período (4/8/12 semanas ou
 * completo) que recalcula gráfico e cards juntos — ver `EvolutionView`.
 *
 * Diferente do Histórico (item 16, `../historico`): lá é a timeline de EVENTOS (check-ins,
 * orientações, metas); aqui é só a série numérica das métricas.
 *
 * Respeita a configuração de métricas por aluno (item 17): `getStudentEvolution` só traz as
 * métricas com `tracked = true` para ESTE aluno (`getEffectiveClientMetrics`); uma métrica
 * desativada não aparece nem como card vazio, mesmo com histórico gravado.
 */
export default async function StudentEvolutionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Guard de role + posse — layouts não re-renderizam entre abas, então a página checa por conta
  // própria (mesmo padrão de fotos/pagamento/treino/nutrição/histórico).
  await requireCoach();

  const data = await getStudentEvolution(id);
  if (!data) {
    // RLS: aluno inexistente e aluno de outra conta são indistinguíveis — 404 nos dois casos.
    notFound();
  }

  const isEmpty = data.metrics.length === 0 || data.weeks.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Evolução" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-ink">Evolução</h2>
        <p className="text-sm text-ink-muted">
          A tendência numérica de {data.clientName} ao longo das semanas — peso e as métricas que
          você está acompanhando para este aluno.
        </p>
      </section>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-14 text-center">
          <p className="font-display text-hero text-ink">
            {data.metrics.length === 0 ? "Nenhuma métrica acompanhada" : "Ainda sem registros"}
          </p>
          <p className="max-w-sm text-sm text-ink-muted">
            {data.metrics.length === 0
              ? "Nenhuma métrica está configurada para acompanhamento deste aluno no momento. Ajuste em Resumo → Métricas acompanhadas."
              : "A evolução aparece aqui assim que houver pelo menos um check-in com métricas registradas."}
          </p>
        </div>
      ) : (
        <EvolutionView data={data} />
      )}
    </div>
  );
}
