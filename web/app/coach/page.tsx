import { getClients, getPaymentStatusForClients } from "@/lib/repository";
import { getEvaluationQueue, type EvaluationRow } from "@/lib/evaluations";
import {
  evaluationsQueueHref,
  getSituation,
  isOverdue,
  priorityRows,
  weekProgress,
} from "@/lib/evaluation-situation";
import { requireCoach } from "./require-coach";
import { todayDateSP } from "@/lib/portal-today";
import {
  AttentionItem,
  EvaluationGroup,
  GroupEmpty,
  ProgressMetric,
  RowsList,
  WeekProgressRing,
} from "./avaliacoes/evaluation-ui";
import { financeHref } from "./financeiro/href";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { IconName } from "@/components/ui/icon";

/** Quantas ações prioritárias o hub mostra; a fila completa mora em `/coach/avaliacoes`. */
const PRIORITY_LIMIT = 4;

/**
 * Acompanhamento (`/coach`) — responde "como está minha operação nesta semana?".
 * Ordem: progresso da semana (anel de ciclos concluídos + check-ins recebidos + orientações
 * enviadas) -> pontos de atenção (check-in atrasado, avaliação de semana anterior, rascunho sem
 * enviar, pagamento atrasado, convite pendente) -> no máximo `PRIORITY_LIMIT` ações prioritárias
 * com link para a fila completa. NÃO renderiza a fila inteira — isso é a página Avaliações.
 *
 * Mesma fonte e mesmas regras de situação de `/coach/avaliacoes` (`getEvaluationQueue` +
 * `lib/evaluation-situation.ts`), então números e rótulos das duas telas batem. Só contagens e
 * nomes; nenhuma resposta do check-in aparece aqui.
 */
export default async function CoachTrackingPage() {
  const { coach } = await requireCoach();

  const [clients, rows] = await Promise.all([getClients(), getEvaluationQueue()]);
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

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
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
          <section
            aria-label="Progresso da semana"
            className="card flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:gap-8 sm:p-6"
          >
            <div className="flex items-center gap-5">
              <WeekProgressRing done={progress.done} total={progress.active} />
              <p className="t-subtitle text-ink sm:hidden">{summaryHeadline(progress.pending)}</p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-5">
              <p className="t-subtitle hidden text-ink sm:block">{summaryHeadline(progress.pending)}</p>
              <div className="grid gap-5 md:grid-cols-2 md:gap-6">
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
          </section>

          <AttentionSection
            rows={rows}
            today={today}
            lateCheckins={progress.late}
            overdue={progress.overdue}
            drafts={progress.drafts}
            latePayments={latePayments}
            notYetActive={notYetActive}
          />

          <EvaluationGroup
            title="Próximas ações"
            count={priority.length}
            tone="work"
            description={
              priority.length > 0
                ? "O mais urgente agora. A fila completa, com filtros, fica em Avaliações."
                : undefined
            }
            action={
              <ButtonLink href={evaluationsQueueHref()} variant="tertiary" size="sm" iconAfter="arrow-right">
                Ver fila completa
              </ButtonLink>
            }
          >
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
          </EvaluationGroup>

          <footer className="border-t border-line pt-4">
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

type AttentionEntry = {
  key: string;
  icon: IconName;
  tone: "danger" | "warning";
  count: number;
  title: string;
  text: string;
  href: string;
  linkLabel: string;
};

/** Pontos que pedem atenção — só os que existem; sem nenhum, um estado calmo em vez de lista vazia. */
function AttentionSection({
  rows,
  today,
  lateCheckins,
  overdue,
  drafts,
  latePayments,
  notYetActive,
}: {
  rows: EvaluationRow[];
  today: string;
  lateCheckins: number;
  overdue: number;
  drafts: number;
  latePayments: number;
  notYetActive: number;
}) {
  const entries: AttentionEntry[] = [
    {
      key: "late",
      icon: "clock" as IconName,
      tone: "danger" as const,
      count: lateCheckins,
      title: lateCheckins === 1 ? "check-in atrasado" : "check-ins atrasados",
      text: namesOf(rows.filter((r) => getSituation(r) === "checkin_late")),
      href: evaluationsQueueHref("waiting"),
      linkLabel: "Cobrar check-in",
    },
    {
      key: "overdue",
      icon: "alert" as IconName,
      tone: "danger" as const,
      count: overdue,
      title: overdue === 1 ? "avaliação de semana anterior" : "avaliações de semana anterior",
      text: namesOf(rows.filter((r) => isOverdue(r, today))),
      href: evaluationsQueueHref("work"),
      linkLabel: "Avaliar",
    },
    {
      key: "drafts",
      icon: "message" as IconName,
      tone: "warning" as const,
      count: drafts,
      title: drafts === 1 ? "orientação em rascunho" : "orientações em rascunho",
      text: "Salvas, mas ainda não enviadas ao aluno.",
      href: evaluationsQueueHref("work"),
      linkLabel: "Finalizar",
    },
    {
      key: "payments",
      icon: "wallet" as IconName,
      tone: "danger" as const,
      count: latePayments,
      title: latePayments === 1 ? "aluno com pagamento atrasado" : "alunos com pagamento atrasado",
      text: "Cobrança vencida sem confirmação de pagamento.",
      href: financeHref({ status: "overdue" }),
      linkLabel: "Ver financeiro",
    },
    {
      key: "invites",
      icon: "user" as IconName,
      tone: "warning" as const,
      count: notYetActive,
      title: notYetActive === 1 ? "convite não aceito" : "convites não aceitos",
      text: "Sem aceitar o convite, o aluno não entra no ciclo semanal.",
      href: "/coach/alunos",
      linkLabel: "Ver alunos",
    },
  ].filter((e) => e.count > 0);

  return (
    <section aria-labelledby="attention-title" className="flex flex-col gap-3">
      <h2 id="attention-title" className="t-subtitle text-ink">
        Pedem atenção
      </h2>
      {entries.length > 0 ? (
        <ul className="card overflow-hidden">
          {entries.map(({ key, ...entry }) => (
            <AttentionItem key={key} {...entry} />
          ))}
        </ul>
      ) : (
        <GroupEmpty
          title="Nada fora do lugar"
          text="Nenhum check-in atrasado, avaliação parada ou pagamento vencido nesta semana."
        />
      )}
    </section>
  );
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
