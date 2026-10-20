import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { computeWeekInfo, getClient } from "@/lib/repository";
import { getEvaluationDetail } from "@/lib/evaluations";
import { getWeekRecord, type WeekRecord } from "@/lib/evaluation-week";
import { parseWeekParam } from "@/lib/evaluation-answers";
import { SITUATION_META, getSituation } from "@/lib/evaluation-situation";
import Icon from "@/components/ui/icon";
import { ButtonLink } from "@/components/ui/button";
import { requireCoach } from "../../../require-coach";
import {
  ChargeCheckinButton,
  StateBadge,
  formatDateOnlyShort,
  formatDateTime,
} from "../../../avaliacoes/evaluation-ui";
import CycleDoneBanner from "./cycle-done-banner";
import DecisionBar from "./decision-bar";
import EvaluationForm from "./evaluation-form";
import HistoryContext from "./history-context";
import { loadComparison } from "./load-comparison";
import MarkReviewOpened from "./mark-review-opened";
import PastWeekView from "./past-week-view";
import ReceivedSection from "./received-section";
import SectionNav from "./section-nav";
import { SignalStrip } from "./signal-cards";
import WeekComparison from "./week-comparison";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Avaliação do aluno (`/coach/alunos/[id]/avaliacao`) — o hub de decisão do ciclo semanal (V3,
 * tarefa 16). Quatro áreas distintas, cada dado em UM lugar:
 *
 *  A. "Recebido nesta semana" (`ReceivedSection`): tudo o que o aluno mandou no check-in atual —
 *     data/hora do envio, peso e métricas (uma vez, sem variação), fotos, todas as respostas e o
 *     bloco discreto "Informações sensíveis". Marcada como atual.
 *  B. "Comparar com outra semana" (`WeekComparison`, `panelMetrics=false`): escolha da semana
 *     comparativa (`?comparar=N`, validado no servidor); as duas semanas com número e período; só
 *     as variações entre as duas semanas selecionadas.
 *  C. "Contexto histórico" (`HistoryContext`): recolhido; tendências, semanas anteriores (com link
 *     para abrir cada uma), orientação anterior e histórico completo. Nunca mostra resposta antiga
 *     como atual.
 *  D. "Decisão do coach" (`#orientacao`): orientação, nota privada e "Finalizar avaliação". Desktop:
 *     coluna lateral fixa ao rolar (à vista desde o topo). Celular: atalho "Ir para a decisão" no
 *     topo + barra sticky (`DecisionBar`).
 *
 * `?semana=N` (N anterior à semana da avaliação) abre a visão SOMENTE LEITURA daquela semana
 * (`PastWeekView`, tarefa 17) — com os dados DAQUELA semana, sem formulário nem marcação de abertura.
 *
 * "Sinais" são regras factuais sobre dado real (`lib/evaluation-signals.ts`) — nunca diagnóstico.
 * Isolamento: `getClient` + o RLS devolvem 404 pra aluno de outra conta (o layout já faz o mesmo;
 * esta página confere de novo — layouts não re-renderizam entre abas). `getEvaluationDetail` só
 * enxerga alunos da conta do coach.
 */
export default async function StudentEvaluationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const { comparar, semana } = await searchParams;
  await requireCoach();

  const client = await getClient(id);
  if (!client) notFound();

  const detail = await getEvaluationDetail(id);

  // Semana passada (histórico): só semanas ANTERIORES à da avaliação (ou, fora da fila, até a
  // semana corrente do calendário). Qualquer outro valor cai na avaliação atual.
  const askedWeek = parseWeekParam(semana);
  const lastPastWeek = detail
    ? detail.row.weekNumber - 1
    : client.start_date
      ? computeWeekInfo(client.start_date).weekNumber
      : 0;
  if (askedWeek !== null && askedWeek <= lastPastWeek) {
    return (
      <PastWeekView
        key={`${id}:${askedWeek}`}
        clientId={id}
        clientName={client.name}
        startDate={client.start_date}
        weekNumber={askedWeek}
        currentWeek={detail?.row.weekNumber ?? null}
        lastPastWeek={lastPastWeek}
        comparar={comparar}
      />
    );
  }

  // Aluno fora da fila: convite ainda não aceito ou acompanhamento pausado.
  if (!detail) {
    return (
      <EmptyCard
        title={
          client.status === "paused" ? "Acompanhamento pausado" : "Este aluno ainda não iniciou o acompanhamento"
        }
        text={
          client.status === "paused"
            ? "Enquanto o acompanhamento estiver pausado, não há avaliação semanal para este aluno."
            : "A avaliação nasce do check-in semanal. Assim que o aluno aceitar o convite e enviar o primeiro check-in, ele aparece aqui."
        }
        action={
          <ButtonLink href={`/coach/alunos/${id}`} variant="secondary">
            Ver resumo do aluno
          </ButtonLink>
        }
      />
    );
  }

  const { row } = detail;

  if (row.state === "awaiting_checkin") {
    return (
      <EmptyCard
        badge={<StateBadge state="awaiting_checkin" />}
        title={`Aguardando o check-in de ${client.name}`}
        text={`A avaliação da semana ${row.weekNumber} começa quando o aluno enviar o check-in (previsto até ${formatDateOnlyShort(row.periodEnd)}). Se quiser, lembre-o agora.`}
        action={
          <div className="flex flex-col gap-2">
            <ChargeCheckinButton client={row.client} weekNumber={row.weekNumber} late={row.late} />
            {row.weekNumber > 1 && (
              <ButtonLink href={`/coach/alunos/${id}/avaliacao?semana=${row.weekNumber - 1}`} variant="secondary">
                Ver a semana {row.weekNumber - 1}
              </ButtonLink>
            )}
          </div>
        }
      />
    );
  }

  const done = row.state === "done";
  const o = detail.orientation;
  const [comparison, record] = await Promise.all([
    loadComparison(id, client.start_date, row.weekNumber, comparar),
    getWeekRecord(id, row.weekNumber).catch((err: unknown): WeekRecord | null => {
      console.error("Não foi possível carregar o check-in da semana:", err);
      return null;
    }),
  ]);
  const currentWeekData = comparison?.weeks.find((w) => w.weekNumber === row.weekNumber) ?? null;

  return (
    <div className="flex flex-col gap-5">
      {/* Sempre montado (ver o componente): só marca a semana com que a tela foi ABERTA. */}
      <MarkReviewOpened key={id} clientId={id} weekNumber={row.weekNumber} pending={row.state === "pending"} />

      {/* Situação do ciclo — sempre no topo, com linguagem de ciclo explícita. */}
      <section aria-label="Situação da avaliação" className="tk-enter flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="t-title text-ink">Semana {row.weekNumber}</h2>
              <StateBadge state={row.state} />
              <span className="text-sm text-ink-muted">
                {formatDateOnlyShort(row.periodStart)} a {formatDateOnlyShort(row.periodEnd)}
              </span>
            </div>
            <p className="text-sm text-ink-muted">
              {row.state === "pending" && "Aguardando a sua avaliação."}
              {row.state === "in_progress" && "Avaliação aberta. A orientação ainda não foi enviada."}
              {row.state === "draft" && "Rascunho salvo. Falta finalizar e enviar ao aluno."}
              {done && row.reviewedAt && `Orientação enviada em ${formatDateTime(row.reviewedAt)}.`}
            </p>
          </div>
          <SectionNav
            items={[
              { href: "#recebido", label: "Recebido" },
              { href: "#comparar", label: "Comparar" },
              { href: "#contexto", label: "Contexto" },
            ]}
            decision={{ href: "#orientacao", label: done ? "Ver orientação enviada" : "Ir para a decisão" }}
          />
        </div>
        {done && (
          <CycleDoneBanner>
            Ciclo da semana {row.weekNumber} concluído: a orientação foi enviada e {client.name} já
            recebeu a notificação.
          </CycleDoneBanner>
        )}
      </section>

      {/* Sinais em chips compactos (detalhe recolhido em "Contexto histórico"). */}
      <SignalStrip detail={detail} contextHref="#contexto" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        {/* A + B + C: o que chegou, a comparação e o contexto — nesta ordem. */}
        <div className="flex min-w-0 flex-col gap-5 xl:col-start-1 xl:row-start-1">
          <ReceivedSection
            id="recebido"
            variant="current"
            clientId={id}
            weekNumber={row.weekNumber}
            periodStart={row.periodStart}
            periodEnd={row.periodEnd}
            record={record}
            metrics={currentWeekData}
            photos={comparison?.initialPhotos[row.weekNumber]}
            adherenceIsScale={detail.adherenceIsScale}
            goals={detail.goals}
          />

          <div id="comparar" className="scroll-mt-4">
            {comparison ? (
              <WeekComparison
                key={`${id}:${row.weekNumber}`}
                clientId={id}
                currentWeek={row.weekNumber}
                weeks={comparison.weeks}
                adherenceIsScale={detail.adherenceIsScale}
                initialCompareWeek={comparison.compareWeek}
                initialPhotos={comparison.initialPhotos}
                currentLabel={SITUATION_META[getSituation(row)].label}
                panelMetrics={false}
                heading={{
                  title: "Comparar com outra semana",
                  text: `A semana ${row.weekNumber} fica fixa; escolha a semana de comparação.`,
                }}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-sm text-ink-muted">
                Não foi possível carregar a comparação agora. Recarregue a página para tentar de novo.
              </p>
            )}
          </div>

          <HistoryContext id="contexto" detail={detail} clientId={id} />
        </div>

        {/* D. DECISÃO: orientação + nota privada. Coluna lateral fixa ao rolar no desktop. */}
        <section
          id="orientacao"
          aria-label="Decisão do coach"
          className="card flex min-w-0 scroll-mt-4 flex-col gap-4 border-brand/60 p-4 shadow-[0_0_0_1px_var(--color-brand),0_12px_40px_-18px_var(--color-brand)] sm:p-5 xl:sticky xl:top-6 xl:col-start-2 xl:row-start-1 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto"
        >
          {/* Desktop: o painel rola por dentro (ex.: confirmação aberta) — o título fica preso no topo. */}
          <div className="flex flex-col gap-1 xl:sticky xl:-top-5 xl:z-10 xl:-mx-5 xl:-mt-5 xl:rounded-t-[inherit] xl:border-b xl:border-line xl:bg-surface xl:px-5 xl:pt-5 xl:pb-3">
            <span className="t-kicker text-brand">Decisão do coach</span>
            <h2 className="t-subtitle text-ink">
              {done ? "Orientação enviada" : `Avaliação da semana ${row.weekNumber}`}
            </h2>
          </div>

          {done ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="t-label text-ink-faint">
                  Orientação para {client.name}
                  {o?.sent_at ? ` · ${formatDateTime(o.sent_at)}` : ""}
                </span>
                <p className="whitespace-pre-wrap break-words text-sm text-ink">{o?.text}</p>
              </div>
              {o?.coach_note && (
                <div className="flex flex-col gap-1.5 border-t border-line pt-4">
                  <span className="t-label inline-flex items-center gap-1.5 text-ink-faint">
                    <Icon name="privacy" size={14} /> Nota privada · só você vê
                  </span>
                  <p className="whitespace-pre-wrap break-words rounded-lg border border-dashed border-line-strong bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">
                    {o.coach_note}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <EvaluationForm
              key={id}
              clientId={id}
              clientName={client.name}
              weekNumber={row.weekNumber}
              initialText={o?.text ?? ""}
              initialNote={o?.coach_note ?? ""}
              hasDraft={Boolean(o)}
            />
          )}
        </section>
      </div>

      {!done && (
        <DecisionBar
          targetId="orientacao"
          label="Ir para a decisão"
          hint={row.state === "draft" ? "Rascunho salvo — falta finalizar." : "Escreva a orientação e finalize."}
        />
      )}
    </div>
  );
}

function EmptyCard({
  badge,
  title,
  text,
  action,
}: {
  badge?: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      {badge}
      <EmptyState
        className="w-full"
        icon="clock"
        title={title}
        text={text}
        action={action && <div className="w-full max-w-xs sm:w-auto">{action}</div>}
      />
    </div>
  );
}
