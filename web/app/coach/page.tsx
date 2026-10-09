import Link from "next/link";
import { getClients } from "@/lib/repository";
import { countEvaluations, getEvaluationQueue, isActionable } from "@/lib/evaluations";
import { requireCoach } from "./require-coach";
import { todayDateSP } from "@/lib/portal-today";
import {
  AttentionList,
  BUTTON_GHOST,
  Counter,
  EvaluationGroup,
  GroupEmpty,
  RowsList,
  getAttentionItems,
} from "./avaliacoes/evaluation-ui";

/**
 * Acompanhamento (`/coach`) — destino de entrada do coach e o começo do fluxo do produto:
 * Acompanhamento -> Avaliação -> Orientação. A tela responde UMA pergunta: "o que preciso
 * fazer agora?". Por isso o conteúdo principal é a fila de trabalho de "Avaliações desta
 * semana" (alunos que exigem ação, o que espera há mais tempo primeiro) e SÓ DEPOIS um resumo
 * curto da semana. Sem gráficos, sem BI — só o que dá pra agir. Entre a fila e o resumo, o bloco
 * compacto "Merece atenção" (só aparece se houver algo) lista o que ficou pra trás no ciclo:
 * check-in atrasado, avaliação de semana anterior sem orientação enviada e rascunho parado.
 *
 * Dado real: `getEvaluationQueue()` (`lib/evaluations.ts`), derivado de `checkin_instances` +
 * `orientations` da conta do coach (RLS). O mesmo cálculo alimenta o badge da navegação.
 */
export default async function CoachTrackingPage() {
  const { coach } = await requireCoach();

  const [clients, rows] = await Promise.all([getClients(), getEvaluationQueue()]);
  const counts = countEvaluations(rows);
  const notYetActive = clients.length - clients.filter((c) => c.invite_status === "active").length;

  const queue = rows.filter((r) => isActionable(r.state));
  const awaiting = rows.filter((r) => r.state === "awaiting_checkin");
  const attention = getAttentionItems(rows, todayDateSP());

  return (
    <div className="flex flex-col gap-8">
      <header>
        <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
          Acompanhamento · Olá, {coach.name}
        </span>
        <h1 className="font-display text-hero text-ink">Avaliações desta semana</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {counts.actionable > 0
            ? `${counts.actionable} ${counts.actionable === 1 ? "aluno espera" : "alunos esperam"} por você agora.`
            : "O que precisa da sua ação hoje aparece aqui."}
        </p>
      </header>

      {clients.length === 0 ? (
        <EmptyState
          title="Comece cadastrando seu primeiro aluno"
          text="O acompanhamento semanal nasce do check-in dos seus alunos. Cadastre o primeiro, envie o convite e acompanhe por aqui."
          cta={{ href: "/coach/alunos", label: "Cadastrar aluno" }}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum aluno ativo ainda"
          text={`${notYetActive} ${notYetActive === 1 ? "aluno cadastrado ainda não aceitou" : "alunos cadastrados ainda não aceitaram"} o convite. Assim que aceitarem, o check-in semanal deles vira uma avaliação aqui.`}
          cta={{ href: "/coach/alunos", label: "Ver alunos e convites" }}
        />
      ) : (
        <>
          <EvaluationGroup
            title="Fila de trabalho"
            count={queue.length}
            description="Check-ins enviados sem orientação enviada. O que espera há mais tempo vem primeiro."
          >
            {queue.length > 0 ? (
              <RowsList rows={queue} />
            ) : (
              <GroupEmpty
                title="Nada para avaliar agora"
                text={
                  awaiting.length > 0
                    ? `${awaiting.length} ${awaiting.length === 1 ? "aluno ainda não enviou" : "alunos ainda não enviaram"} o check-in da semana. Quando enviarem, a avaliação aparece nesta fila. Você pode cobrar quem falta logo abaixo.`
                    : "Todos os ciclos desta semana estão concluídos. Bom trabalho."
                }
              />
            )}
          </EvaluationGroup>

          {attention.length > 0 && (
            <EvaluationGroup
              title="Merece atenção"
              count={attention.length}
              description="Situações do ciclo que ficaram para trás. Uma ação por aluno."
            >
              <AttentionList items={attention} />
            </EvaluationGroup>
          )}

          {awaiting.length > 0 && (
            <EvaluationGroup
              title="Aguardando check-in do aluno"
              count={awaiting.length}
              description="Sem check-in não há o que avaliar — um lembrete pelo WhatsApp costuma resolver."
            >
              <RowsList rows={awaiting} />
            </EvaluationGroup>
          )}

          <section aria-label="Resumo da semana" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium text-ink">Resumo da semana</h2>
              <Link href="/coach/avaliacoes" className={`${BUTTON_GHOST} !w-auto !px-4`}>
                Ver todas as avaliações
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Counter label="Alunos ativos" value={counts.active} />
              <Counter label="Concluídas" value={counts.done} hint="ciclo fechado" />
              <Counter
                label="Pendentes"
                value={counts.actionable}
                tone="brand"
                hint="exigem sua ação"
              />
              <Counter
                label="Aguardando check-in"
                value={counts.awaitingCheckin}
                hint="falta o aluno"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function EmptyState({
  title,
  text,
  cta,
}: {
  title: string;
  text: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-14 text-center">
      <p className="font-display text-hero text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-muted">{text}</p>
      <Link
        href={cta.href}
        className="mt-2 inline-flex min-h-11 items-center rounded-md bg-brand px-5 py-2.5 font-medium text-on-accent transition-opacity hover:opacity-90"
      >
        {cta.label}
      </Link>
    </div>
  );
}
