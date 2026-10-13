import Link from "next/link";
import type { EvaluationDetail } from "@/lib/evaluations";
import { formatDateTime } from "../../../avaliacoes/evaluation-ui";
import SignalCards from "./signal-cards";

function formatKg(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
}

function num(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * Área "Contexto histórico" (V3, tarefa 16-C): RECOLHIDA por padrão e visualmente distinta do dado
 * atual (fundo rebaixado, borda tracejada, selo "Semanas anteriores"). Dentro: tendências já
 * calculadas (`SignalCards`), as semanas ANTERIORES (nunca a atual — ela já está em "Recebido nesta
 * semana"), cada uma com link para abrir o registro daquela semana (`?semana=N`, somente leitura),
 * a orientação enviada na semana anterior e o histórico completo. Nenhuma resposta antiga aparece
 * aqui como se fosse atual.
 */
export default function HistoryContext({ id, detail, clientId }: { id: string; detail: EvaluationDetail; clientId: string }) {
  const week = detail.row.weekNumber;
  const previous = detail.context.filter((w) => w.weekNumber < week);
  const prevOrientation = detail.previousOrientation;
  const summary = [
    previous.length > 0
      ? `${previous.length} ${previous.length === 1 ? "semana anterior" : "semanas anteriores"}`
      : "Primeira semana com registro",
    "tendências",
    prevOrientation ? `orientação da semana ${prevOrientation.weekNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section id={id} aria-label="Contexto histórico" className="scroll-mt-4">
      <details className="group rounded-xl border border-dashed border-line-strong bg-surface-sunken">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="t-subtitle text-ink">Contexto histórico</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">Semanas anteriores</span>
            </span>
            <span className="text-xs text-ink-muted">{summary}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-brand group-open:hidden">Ver</span>
          <span className="hidden shrink-0 text-sm font-semibold text-brand group-open:inline">Recolher</span>
        </summary>

        <div className="flex flex-col gap-5 border-t border-line p-4">
          <p className="text-xs text-ink-muted">
            Dados de semanas passadas, para contexto. Nada aqui faz parte do check-in da semana {week}.
          </p>

          <SignalCards detail={detail} />

          <div className="flex flex-col gap-2">
            <h3 className="t-label text-ink-faint">Semanas anteriores</h3>
            {previous.length === 0 ? (
              <p className="text-sm text-ink-muted">Ainda não há semanas anteriores registradas.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {previous.map((w) => (
                  <li key={w.weekNumber} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium text-ink">
                        Semana {w.weekNumber}
                        <span className="ml-2 text-xs font-normal text-ink-muted">
                          {w.submitted ? "Check-in enviado" : "Sem check-in"}
                        </span>
                      </span>
                      <span className="text-xs text-ink-muted">
                        Peso {w.weight != null ? formatKg(w.weight) : "não informado"} · Aderência{" "}
                        {w.adherence != null ? `${num(w.adherence)}${detail.adherenceIsScale ? " de 5" : ""}` : "não informada"} ·
                        Energia {w.energy != null ? `${w.energy} de 5` : "não informada"}
                      </span>
                    </div>
                    <Link
                      href={`/coach/alunos/${clientId}/avaliacao?semana=${w.weekNumber}`}
                      className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-brand hover:underline"
                    >
                      Abrir semana {w.weekNumber}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {prevOrientation && (
            <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4">
              <span className="t-label text-ink-faint">
                Orientação enviada na semana {prevOrientation.weekNumber}
                {prevOrientation.sentAt ? ` · ${formatDateTime(prevOrientation.sentAt)}` : ""}
              </span>
              <p className="whitespace-pre-wrap break-words text-sm text-ink-muted">{prevOrientation.text}</p>
            </div>
          )}

          <Link
            href={`/coach/alunos/${clientId}/historico`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
          >
            Ver histórico completo do aluno
          </Link>
        </div>
      </details>
    </section>
  );
}
