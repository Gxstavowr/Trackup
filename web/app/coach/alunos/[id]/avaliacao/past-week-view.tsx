import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { getWeekRecord, type WeekRecord } from "@/lib/evaluation-week";
import { periodOfWeek } from "@/lib/checkin-week";
import { formatDateOnlyShort, formatDateTime } from "../../../avaliacoes/evaluation-ui";
import { loadComparison } from "./load-comparison";
import ReceivedSection from "./received-section";
import SectionNav from "./section-nav";
import WeekComparison from "./week-comparison";

/**
 * Visão SOMENTE LEITURA de uma semana passada (`/coach/alunos/[id]/avaliacao?semana=N`, V3 tarefa
 * 17). Tudo é lido para a semana N — check-in enviado (com data/hora), métricas, fotos e respostas
 * daquela semana, a avaliação e a orientação daquela semana — nunca reaproveitado da semana atual.
 * Não há formulário, nem marcação de "avaliação aberta", nem envio: o histórico nunca é sobrescrito.
 * A comparação (mesma peça da avaliação atual) põe a semana N contra uma semana anterior a ela.
 */
export default async function PastWeekView({
  clientId,
  clientName,
  startDate,
  weekNumber,
  currentWeek,
  lastPastWeek,
  comparar,
}: {
  clientId: string;
  clientName: string;
  startDate: string | null;
  weekNumber: number;
  /** Semana da avaliação atual (link de volta); `null` se o aluno não está na fila. */
  currentWeek: number | null;
  /** Última semana que abre nesta visão (as seguintes são a avaliação atual ou o futuro). */
  lastPastWeek: number;
  comparar: string | string[] | undefined;
}) {
  let record: WeekRecord | null = null;
  try {
    record = await getWeekRecord(clientId, weekNumber);
  } catch (err) {
    console.error("Não foi possível carregar a semana:", err);
  }
  const comparison = await loadComparison(clientId, startDate, weekNumber, comparar);
  const weekData = comparison?.weeks.find((w) => w.weekNumber === weekNumber) ?? null;
  const fallbackPeriod = startDate ? periodOfWeek(startDate, weekNumber) : null;
  const periodStart = record?.checkin?.periodStart ?? weekData?.periodStart ?? fallbackPeriod?.periodStart ?? "";
  const periodEnd = record?.checkin?.periodEnd ?? weekData?.periodEnd ?? fallbackPeriod?.periodEnd ?? "";
  const base = `/coach/alunos/${clientId}/avaliacao`;
  const prevWeek = weekNumber > 1 ? weekNumber - 1 : null;
  const nextWeek = weekNumber + 1 <= lastPastWeek ? weekNumber + 1 : null;

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Semana do histórico" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={currentWeek !== null ? base : `/coach/alunos/${clientId}/historico`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline">
            ← {currentWeek !== null ? `Voltar para a avaliação atual (semana ${currentWeek})` : "Voltar para o histórico"}
          </Link>
          <Link href={`/coach/alunos/${clientId}/historico`} className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink hover:underline">
            Histórico completo
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="t-title text-ink">Semana {weekNumber}</h2>
          <Badge tone="neutral">Registro anterior · somente leitura</Badge>
          {periodStart && periodEnd && (
            <span className="text-sm text-ink-muted">
              {formatDateOnlyShort(periodStart)} a {formatDateOnlyShort(periodEnd)}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-muted">
          O que {clientName} enviou e o que foi decidido nesta semana, como ficou registrado. Nada aqui pode ser
          editado.
        </p>
        <nav aria-label="Navegar entre semanas" className="flex flex-wrap gap-2">
          {prevWeek !== null && (
            <WeekLink href={`${base}?semana=${prevWeek}`}>← Semana {prevWeek}</WeekLink>
          )}
          {nextWeek !== null && <WeekLink href={`${base}?semana=${nextWeek}`}>Semana {nextWeek} →</WeekLink>}
          {nextWeek === null && currentWeek !== null && (
            <WeekLink href={base}>Semana {currentWeek} (atual) →</WeekLink>
          )}
        </nav>
        <SectionNav
          items={[
            { href: "#recebido", label: "Recebido" },
            { href: "#comparar", label: "Comparar" },
            { href: "#decisao-registrada", label: "Avaliação e orientação" },
          ]}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <ReceivedSection
            id="recebido"
            variant="past"
            clientId={clientId}
            weekNumber={weekNumber}
            periodStart={periodStart}
            periodEnd={periodEnd}
            record={record}
            metrics={weekData}
            photos={comparison?.initialPhotos[weekNumber]}
            adherenceIsScale={record?.adherenceIsScale ?? true}
            goals={record?.goals ?? []}
          />

          <div id="comparar" className="scroll-mt-4">
            {comparison ? (
              <WeekComparison
                key={`${clientId}:past:${weekNumber}`}
                clientId={clientId}
                currentWeek={weekNumber}
                weeks={comparison.weeks}
                adherenceIsScale={record?.adherenceIsScale ?? true}
                initialCompareWeek={comparison.compareWeek}
                initialPhotos={comparison.initialPhotos}
                currentLabel={`Semana ${weekNumber}`}
                panelMetrics={false}
                heading={{
                  title: "Comparar com outra semana",
                  text: `A semana ${weekNumber} fica fixa; escolha uma semana anterior a ela. As variações são calculadas só entre as duas semanas selecionadas.`,
                }}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-sm text-ink-muted">
                Não foi possível carregar a comparação agora. Recarregue a página para tentar de novo.
              </p>
            )}
          </div>
        </div>

        <RecordedDecision record={record} weekNumber={weekNumber} clientName={clientName} />
      </div>
    </div>
  );
}

function WeekLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:border-line-strong"
    >
      {children}
    </Link>
  );
}

/** Avaliação + orientação registradas NAQUELA semana (somente leitura). */
function RecordedDecision({
  record,
  weekNumber,
  clientName,
}: {
  record: WeekRecord | null;
  weekNumber: number;
  clientName: string;
}) {
  const checkin = record?.checkin ?? null;
  const o = record?.orientation ?? null;
  const sentOrientation = o && !o.is_draft && o.sent_at ? o : null;
  const draft = o && !sentOrientation ? o : null;

  return (
    <section
      id="decisao-registrada"
      aria-label="Avaliação e orientação da semana"
      className="card flex min-w-0 scroll-mt-4 flex-col gap-4 p-4 sm:p-5 xl:sticky xl:top-6"
    >
      <div className="flex flex-col gap-1">
        <span className="t-kicker text-ink-muted">Registro da semana {weekNumber}</span>
        <h2 className="t-subtitle text-ink">Avaliação e orientação</h2>
      </div>

      {record === null ? (
        <p className="text-sm text-ink-muted">Não foi possível carregar a avaliação desta semana agora.</p>
      ) : (
        <>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Check-in do aluno">
              {checkin?.submittedAt && (checkin.status === "submitted" || checkin.status === "reviewed")
                ? `Enviado em ${formatDateTime(checkin.submittedAt)}`
                : "Não enviado"}
            </Row>
            <Row label="Avaliação do coach">
              {checkin?.status === "reviewed" && checkin.reviewedAt
                ? `Concluída em ${formatDateTime(checkin.reviewedAt)}`
                : checkin?.reviewOpenedAt
                  ? `Aberta em ${formatDateTime(checkin.reviewOpenedAt)}, não concluída`
                  : "Não registrada"}
            </Row>
          </dl>

          <div className="flex flex-col gap-1.5 border-t border-line pt-4">
            <span className="t-label text-ink-faint">
              Orientação enviada a {clientName}
              {sentOrientation?.sent_at ? ` · ${formatDateTime(sentOrientation.sent_at)}` : ""}
            </span>
            {sentOrientation ? (
              <p className="whitespace-pre-wrap break-words text-sm text-ink">{sentOrientation.text}</p>
            ) : (
              <p className="text-sm text-ink-muted">Nenhuma orientação foi enviada nesta semana.</p>
            )}
          </div>

          {draft && draft.text.trim() !== "" && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-line-strong p-3">
              <span className="t-label text-ink-faint">Rascunho não enviado</span>
              <p className="whitespace-pre-wrap break-words text-sm text-ink-muted">{draft.text}</p>
            </div>
          )}

          {o?.coach_note && (
            <div className="flex flex-col gap-1.5 border-t border-line pt-4">
              <span className="t-label text-ink-faint">Nota do coach (privada)</span>
              <p className="whitespace-pre-wrap break-words text-sm text-ink-muted">{o.coach_note}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
