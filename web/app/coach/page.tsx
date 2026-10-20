import { getClients, getPaymentStatusForClients } from "@/lib/repository";
import { getEvaluationQueue, type EvaluationRow } from "@/lib/evaluations";
import {
  evaluationsQueueHref,
  getSituation,
  priorityRows,
  weekProgress,
} from "@/lib/evaluation-situation";
import { requireCoach } from "./require-coach";
import { todayDateSP } from "@/lib/portal-today";
import { GroupEmpty, ProgressMetric, RowsList } from "./avaliacoes/evaluation-ui";
import { getProtocolPendingStudents } from "./protocol-queue";
import { ProtocolQueue, SectionHead, TaskColumn, type TaskEntry } from "./overview-parts";
import { financeHref } from "./financeiro/href";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressRing, StatusDonut, UpdatedAtStrip } from "@/components/viz";

/** Quantas ações prioritárias o hub mostra; a fila completa mora em `/coach/avaliacoes`. */
const PRIORITY_LIMIT = 4;

/**
 * Acompanhamento (`/coach`) — visão geral da operação na semana, em camadas:
 *  1. resumo visual: anel de progresso da semana (assimétrico) + donut da situação dos alunos;
 *  2. (sem linha de KPIs: as contagens com atalho moram nas colunas abaixo, sem repetir número);
 *  3. pendências separadas por dono: "Com você" (coach) x "Com o aluno";
 *  4. protocolos a preparar (onboarding) — hoje sempre "nenhum": o questionário inicial ainda não existe;
 *  5. no máximo `PRIORITY_LIMIT` próximas ações, com link para a fila completa.
 * NÃO renderiza a fila inteira — isso é a página Avaliações.
 *
 * Mesma fonte e regras de `/coach/avaliacoes` (`getEvaluationQueue` + `lib/evaluation-situation.ts`),
 * então números e rótulos batem. Só contagens e nomes; nenhuma resposta do check-in aparece aqui.
 */
export default async function CoachTrackingPage() {
  const { coach } = await requireCoach();

  const [clients, rows, protocolQueue] = await Promise.all([
    getClients(),
    getEvaluationQueue(),
    getProtocolPendingStudents(),
  ]);
  // Pagamento é um sinal complementar: se a consulta falhar, o hub continua de pé sem ele.
  const paymentStatus = await getPaymentStatusForClients(clients.map((c) => c.id)).catch(() => null);

  const today = todayDateSP();
  const progress = weekProgress(rows, today);
  const priority = priorityRows(rows, today, PRIORITY_LIMIT);
  const notYetActive = clients.filter((c) => c.invite_status !== "active").length;
  const paused = clients.filter((c) => c.status === "paused").length;
  const latePayments = paymentStatus
    ? [...paymentStatus.values()].filter((s) => s === "atrasado").length
    : 0;
  const notSent = progress.active - progress.received;
  const waitingOnTime = notSent - progress.late;
  const toReview = progress.pending - progress.drafts;
  const readAt = new Date();

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <header className="tk-enter flex flex-col gap-1">
        <span className="t-label text-ink-muted">Olá, {coach.name}</span>
        <h1 className="t-title text-ink">Acompanhamento</h1>
        <p className="t-helper">Como está a sua operação nesta semana.</p>
      </header>

      {clients.length === 0 ? (
        <CoachEmpty
          title="Comece cadastrando seu primeiro aluno"
          text="O acompanhamento semanal nasce do check-in dos seus alunos. Cadastre o primeiro, envie o convite e acompanhe por aqui."
          cta={{ href: "/coach/alunos", label: "Cadastrar aluno" }}
        />
      ) : rows.length === 0 ? (
        <CoachEmpty
          title="Nenhum aluno ativo ainda"
          text={`${notYetActive} ${notYetActive === 1 ? "aluno cadastrado ainda não aceitou" : "alunos cadastrados ainda não aceitaram"} o convite. Assim que aceitarem, o check-in semanal deles vira uma avaliação aqui.`}
          cta={{ href: "/coach/alunos", label: "Ver alunos e convites" }}
        />
      ) : (
        <>
          {/* Resumo visual: progresso da semana (bloco largo) + distribuição dos alunos */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card
              as="section"
              variant="raised"
              padding="lg"
              enter
              aria-label="Progresso da semana"
              className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8"
            >
              <div className="flex items-center gap-5">
                <ProgressRing
                  value={progress.done}
                  max={progress.active}
                  size={132}
                  thickness={13}
                  tone={progress.done === progress.active ? "success" : "accent"}
                  label="Ciclos concluídos na semana"
                >
                  <span className="flex flex-col items-center leading-none">
                    <span className="font-display text-3xl font-extrabold tabular-nums text-ink">
                      {progress.done}
                      <span className="text-ink-faint">/{progress.active}</span>
                    </span>
                    <span className="t-label mt-1 text-ink-muted">concluídos</span>
                  </span>
                </ProgressRing>
                <p className="t-subtitle text-ink sm:hidden">{summaryHeadline(progress.pending)}</p>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-5">
                <p className="t-subtitle hidden text-ink sm:block">{summaryHeadline(progress.pending)}</p>
                <div className="grid gap-5">
                  <ProgressMetric
                    label="Check-ins recebidos"
                    value={progress.received}
                    total={progress.active}
                    hint={
                      notSent > 0
                        ? `${notSent} ${notSent === 1 ? "aluno ainda não enviou" : "alunos ainda não enviaram"}`
                        : "Todos os alunos ativos já enviaram"
                    }
                  />
                  <ProgressMetric
                    label="Orientações enviadas"
                    value={progress.done}
                    total={progress.received}
                    hint={pendingHint(progress.pending, progress.drafts)}
                  />
                </div>
              </div>
            </Card>

            <Card as="section" padding="md" enter aria-label="Situação dos alunos" className="flex flex-col gap-4">
              <h2 className="t-subtitle text-ink">Situação dos alunos</h2>
              <StatusDonut
                label="Alunos ativos por situação na semana"
                layout="side"
                size={120}
                thickness={18}
                segments={[
                  { label: "Concluídos", value: progress.done, tone: "success" },
                  { label: "Para avaliar", value: toReview, tone: "info" },
                  { label: "Rascunho", value: progress.drafts, tone: "warning" },
                  { label: "No prazo", value: waitingOnTime, tone: "neutral" },
                  { label: "Atrasados", value: progress.late, tone: "danger" },
                ]}
              />
            </Card>
          </div>

          <UpdatedAtStrip at={readAt} title="Pendências" />

          {/* Quem precisa agir: coach x aluno, lado a lado */}
          <div className="grid items-start gap-4 md:grid-cols-2">
            <TaskColumn
              accent
              icon="checkin"
              title="Com você"
              subtitle="O que depende do coach"
              entries={coachEntries(rows, toReview, progress.drafts, progress.overdue)}
              emptyText="Nenhuma avaliação ou orientação esperando por você."
            />
            <TaskColumn
              icon="users"
              title="Com o aluno"
              subtitle="O que depende do aluno"
              entries={studentEntries(rows, {
                late: progress.late,
                onTime: waitingOnTime,
                latePayments,
                notYetActive,
              })}
              emptyText="Nada pendente do lado dos alunos."
            />
          </div>

          {/* Onboarding: novos alunos com questionário inicial respondido aguardando protocolo.
              Fluxo ainda não existe no banco (ver protocol-queue.ts): mostra "nenhum" honesto. */}
          <ProtocolQueue students={protocolQueue.students} unavailable={!protocolQueue.available} />

          <section aria-labelledby="next-title" className="flex flex-col gap-3">
            <SectionHead
              id="next-title"
              title="Próximas ações"
              action={
                <ButtonLink href={evaluationsQueueHref()} variant="tertiary" size="sm" iconAfter="arrow-right">
                  Ver fila completa
                </ButtonLink>
              }
            />
            {priority.length > 0 ? (
              <RowsList rows={priority} today={today} highlightFirst work />
            ) : (
              <GroupEmpty
                title="Nada urgente agora"
                text={
                  notSent > 0
                    ? "Quem ainda não enviou o check-in está dentro do prazo. As avaliações aparecem assim que chegarem."
                    : "Todos os ciclos desta semana estão concluídos. Bom trabalho."
                }
              />
            )}
          </section>

          <footer className="flex flex-col gap-1 border-t border-line pt-4">
            {!paymentStatus && (
              <p className="t-helper">Não foi possível conferir os pagamentos agora; atrasos de pagamento podem não aparecer acima.</p>
            )}
            <p className="t-helper">
              {paused > 0
                ? `${paused} ${paused === 1 ? "aluno pausado fica" : "alunos pausados ficam"} fora do acompanhamento.`
                : "Alunos pausados ficam fora do acompanhamento."}
            </p>
          </footer>
        </>
      )}
    </div>
  );
}

/** Pendências do coach: só as que existem (count > 0). */
function coachEntries(rows: EvaluationRow[], toReview: number, drafts: number, overdue: number): TaskEntry[] {
  const entries: TaskEntry[] = [
    {
      key: "review",
      icon: "checkin",
      tone: overdue > 0 ? "danger" : "accent",
      count: toReview,
      title: toReview === 1 ? "avaliação para fazer" : "avaliações para fazer",
      text:
        (overdue > 0 ? `${overdue} de semana anterior · ` : "") +
        namesOf(rows.filter((r) => ["review_pending", "review_in_progress"].includes(getSituation(r)))),
      href: evaluationsQueueHref("work"),
      linkLabel: "Avaliar",
    },
    {
      key: "drafts",
      icon: "message",
      tone: "warning",
      count: drafts,
      title: drafts === 1 ? "orientação em rascunho" : "orientações em rascunho",
      text: namesOf(rows.filter((r) => getSituation(r) === "awaiting_orientation")) || "Salvas, mas não enviadas.",
      href: evaluationsQueueHref("work"),
      linkLabel: "Finalizar",
    },
  ];
  return entries.filter((e) => e.count > 0);
}

/** Pendências dos alunos: check-in, pagamento e convite. */
function studentEntries(
  rows: EvaluationRow[],
  c: { late: number; onTime: number; latePayments: number; notYetActive: number }
): TaskEntry[] {
  const entries: TaskEntry[] = [
    {
      key: "late",
      icon: "clock",
      tone: "danger",
      count: c.late,
      title: c.late === 1 ? "check-in atrasado" : "check-ins atrasados",
      text: namesOf(rows.filter((r) => getSituation(r) === "checkin_late")),
      href: evaluationsQueueHref("waiting"),
      linkLabel: "Cobrar",
    },
    {
      key: "ontime",
      icon: "checkin",
      tone: "neutral",
      count: c.onTime,
      title: c.onTime === 1 ? "check-in no prazo" : "check-ins no prazo",
      text: namesOf(rows.filter((r) => getSituation(r) === "checkin_waiting")),
      href: evaluationsQueueHref("waiting"),
      linkLabel: "Ver",
      info: true,
    },
    {
      key: "payments",
      icon: "wallet",
      tone: "danger",
      count: c.latePayments,
      title: c.latePayments === 1 ? "pagamento atrasado" : "pagamentos atrasados",
      text: "Cobrança vencida sem confirmação.",
      href: financeHref({ status: "overdue" }),
      linkLabel: "Financeiro",
    },
    {
      key: "invites",
      icon: "user",
      tone: "warning",
      count: c.notYetActive,
      title: c.notYetActive === 1 ? "convite não aceito" : "convites não aceitos",
      text: "Sem aceitar, o aluno não entra no ciclo semanal.",
      href: "/coach/alunos",
      linkLabel: "Alunos",
    },
  ];
  return entries.filter((e) => e.count > 0);
}

/** "Ana e Bruno" / "Ana, Bruno e mais 3" — primeiros nomes, no máximo 2, pra caber no celular. */
function namesOf(rows: EvaluationRow[]): string {
  const names = rows.map((r) => r.client.name.trim().split(/\s+/)[0] || r.client.name);
  if (names.length <= 2) return names.join(" e ");
  return `${names.slice(0, 2).join(", ")} e mais ${names.length - 2}`;
}

function summaryHeadline(pending: number): string {
  if (pending === 0) return "Nada esperando por você agora";
  return `${pending} ${pending === 1 ? "aluno espera" : "alunos esperam"} por você`;
}

function pendingHint(pending: number, drafts: number): string {
  if (pending === 0) return "Nenhuma avaliação pendente";
  const base = `${pending} ${pending === 1 ? "avaliação pendente" : "avaliações pendentes"}`;
  return drafts > 0 ? `${base} (${drafts} em rascunho)` : base;
}

function CoachEmpty({
  title,
  text,
  cta,
}: {
  title: string;
  text: string;
  cta: { href: string; label: string };
}) {
  return (
    <EmptyState
      icon="tracking"
      title={title}
      text={text}
      action={<ButtonLink href={cta.href}>{cta.label}</ButtonLink>}
    />
  );
}
