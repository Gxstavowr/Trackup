import Link from "next/link";
import { countEvaluations, getEvaluationQueue, isActionable } from "@/lib/evaluations";
import { requireCoach } from "../require-coach";
import { Counter, EvaluationGroup, GroupEmpty, RowsList } from "./evaluation-ui";

/**
 * Avaliações (`/coach/avaliacoes`) — a lista de trabalho do ciclo semanal: UMA linha por aluno
 * ativo (derivada de `checkin_instances` + `orientations`, ver `lib/evaluations.ts`), agrupada
 * pelo que o coach precisa fazer. Cada linha traz um botão principal pra sua situação.
 */
export default async function CoachEvaluationsPage() {
  await requireCoach();

  const rows = await getEvaluationQueue();
  const counts = countEvaluations(rows);

  const actionable = rows.filter((r) => isActionable(r.state));
  const awaiting = rows.filter((r) => r.state === "awaiting_checkin");
  const done = rows.filter((r) => r.state === "done");

  return (
    <div className="flex flex-col gap-8">
      <header>
        <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
          Trackly · Coach
        </span>
        <h1 className="font-display text-hero text-ink">Avaliações</h1>
        <p className="mt-1 text-sm text-ink-muted">
          O ciclo da semana de cada aluno: check-in do aluno, sua avaliação e a orientação.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-14 text-center">
          <p className="font-display text-hero text-ink">Nenhuma avaliação para acompanhar ainda</p>
          <p className="max-w-md text-sm text-ink-muted">
            As avaliações nascem do check-in semanal dos seus alunos ativos. Cadastre um aluno,
            envie o convite e, quando ele aceitar e enviar o primeiro check-in, a avaliação aparece aqui.
          </p>
          <Link href="/coach/alunos" className="mt-2 inline-flex min-h-11 items-center rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-on-accent hover:opacity-90">
            Ver alunos e convites
          </Link>
        </div>
      ) : (
        <>
          <section aria-label="Contadores da semana" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Counter label="Concluídas" value={counts.done} hint="ciclo fechado" />
            <Counter
              label="Aguardando avaliação"
              value={counts.pending}
              tone="brand"
              hint="check-in enviado"
            />
            <Counter
              label="Em andamento"
              value={counts.inProgress}
              tone="brand"
              hint="você já abriu"
            />
            <Counter
              label="Aguardando orientação"
              value={counts.draft}
              tone="brand"
              hint="rascunho salvo"
            />
            <Counter
              label="Aguardando check-in"
              value={counts.awaitingCheckin}
              hint="falta o aluno"
            />
          </section>

          <EvaluationGroup
            title="Para você fazer agora"
            count={actionable.length}
            description="Check-ins enviados sem orientação enviada — o que espera há mais tempo aparece primeiro."
          >
            {actionable.length > 0 ? (
              <RowsList rows={actionable} />
            ) : (
              <GroupEmpty
                title="Nenhuma avaliação esperando por você"
                text={
                  awaiting.length > 0
                    ? "Quando um aluno enviar o check-in, ele aparece aqui. Enquanto isso, você pode cobrar quem ainda não enviou."
                    : "Todos os ciclos desta semana estão concluídos."
                }
              />
            )}
          </EvaluationGroup>

          {awaiting.length > 0 && (
            <EvaluationGroup
              title="Aguardando o aluno"
              count={awaiting.length}
              description="Ainda não enviaram o check-in da semana."
            >
              <RowsList rows={awaiting} />
            </EvaluationGroup>
          )}

          {done.length > 0 && (
            <EvaluationGroup title="Ciclos concluídos" count={done.length}>
              <RowsList rows={done} />
            </EvaluationGroup>
          )}
        </>
      )}
    </div>
  );
}
