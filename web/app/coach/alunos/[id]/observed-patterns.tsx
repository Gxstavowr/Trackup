import { MIN_HISTORY_WEEKS } from "@/lib/insights";
import { getStudentInsightReport, type InsightReport } from "@/lib/insights-data";

/**
 * "Padrões observados" (item 31 do master TODO) — Resumo do aluno. Fatos calculados por regras
 * simples e determinísticas (`lib/insights.ts`) sobre o histórico semanal já gravado: mudança de
 * peso/medidas, estabilidade, queda de aderência, check-ins faltantes, metas que se repetem sem
 * ser atingidas. Só o que dá pra conferir nos registros, com números e semanas — nunca
 * diagnóstico nem causa (mesmo texto de rodapé dos "Sinais importantes" da Avaliação).
 *
 * Bloco suplementar: se o cálculo falhar, o Resumo continua funcionando e o card diz que não
 * conseguiu carregar (o erro vai pro log do servidor), em vez de derrubar a página inteira.
 */
export default async function ObservedPatterns({
  clientId,
  startDate,
}: {
  clientId: string;
  startDate: string | null;
}) {
  let report: InsightReport | null = null;
  let failed = false;
  try {
    report = await getStudentInsightReport(clientId, startDate);
  } catch (err) {
    console.error("Não foi possível calcular os padrões observados do aluno:", err);
    failed = true;
  }
  return <ObservedPatternsCard report={report} failed={failed} />;
}

/** Parte visual, separada da leitura de dados (recebe o relatório pronto). */
export function ObservedPatternsCard({
  report,
  failed = false,
}: {
  report: InsightReport | null;
  failed?: boolean;
}) {
  return (
    <section aria-label="Padrões observados" className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-ink">Padrões observados</h2>
      {failed || !report ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-ink-muted">
          Não foi possível calcular os padrões agora. Os registros do aluno continuam disponíveis em
          Evolução e Histórico.
        </p>
      ) : report.insights.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-ink-muted">
          {report.enoughData
            ? "Nenhum padrão nas regras automáticas: sem variação relevante nas métricas acompanhadas, sem queda de aderência, sem check-ins faltando e sem metas se repetindo sem resultado."
            : `Ainda não há histórico suficiente. Os padrões aparecem depois de ${MIN_HISTORY_WEEKS} semanas com registros do aluno.`}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          {report.insights.map((insight) => (
            <li
              key={insight.id}
              className="flex items-start gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0"
            >
              <span
                aria-hidden
                className={`mt-1.5 size-2 shrink-0 rounded-full ${insight.tone === "attention" ? "bg-warn" : "bg-brand"}`}
              />
              <span className="min-w-0 break-words text-ink">
                <span className="sr-only">{insight.tone === "attention" ? "Atenção: " : "Observação: "}</span>
                {insight.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-faint">
        Calculados a partir dos check-ins e metas registrados: descrevem o que os números mostram,
        não o motivo — e não são diagnóstico.
      </p>
    </section>
  );
}
