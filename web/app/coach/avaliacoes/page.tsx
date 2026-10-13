import Link from "next/link";
import { getEvaluationQueue } from "@/lib/evaluations";
import { GROUP_META, groupRows } from "@/lib/evaluation-situation";
import { todayDateSP } from "@/lib/portal-today";
import { requireCoach } from "../require-coach";
import { EvaluationGroup, GroupEmpty, RowsList } from "./evaluation-ui";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { IconName } from "@/components/ui/icon";

type FilterId = "todas" | "avaliar" | "aguardando" | "concluidas";

const FILTER_IDS: FilterId[] = ["todas", "avaliar", "aguardando", "concluidas"];
/** Links antigos (`?estado=pendentes|andamento|fazer`) caem no filtro "Para avaliar". */
const LEGACY: Record<string, FilterId> = { pendentes: "avaliar", andamento: "avaliar", fazer: "avaliar" };

/**
 * Avaliações (`/coach/avaliacoes`) — a área operacional do ciclo semanal: a fila COMPLETA, UMA
 * linha por aluno ativo (`lib/evaluations.ts`), cada uma com uma situação e um botão principal
 * (`lib/evaluation-situation.ts`) para abrir/continuar a avaliação ou cobrar o check-in. "Todas"
 * mostra a fila de trabalho em destaque e depois quem espera o aluno e os concluídos; os demais
 * filtros (`?estado=`) listam só um grupo. O panorama da semana (progresso, atenção, ações
 * prioritárias) fica em `/coach` — aqui não há card de resumo, pra as telas não se repetirem.
 * Rótulos dos grupos vêm de `GROUP_META`, os mesmos usados no hub.
 */
export default async function CoachEvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string | string[] }>;
}) {
  await requireCoach();
  const { estado } = await searchParams;
  const raw = Array.isArray(estado) ? estado[0] : estado;
  const filter: FilterId = FILTER_IDS.includes(raw as FilterId)
    ? (raw as FilterId)
    : (LEGACY[raw ?? ""] ?? "todas");

  const rows = await getEvaluationQueue();
  const today = todayDateSP();
  const groups = groupRows(rows);

  const filters: { id: FilterId; label: string; count: number }[] = [
    { id: "todas", label: "Todas", count: rows.length },
    { id: "avaliar", label: GROUP_META.work.label, count: groups.work.length },
    { id: "aguardando", label: GROUP_META.waiting.label, count: groups.waiting.length },
    { id: "concluidas", label: GROUP_META.done.label, count: groups.done.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="t-title text-ink">Avaliações</h1>
        <p className="t-helper">Fila completa do ciclo semanal: abra, continue e conclua a avaliação de cada aluno.</p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon="tracking"
          title="Nenhuma avaliação para acompanhar ainda"
          text="As avaliações nascem do check-in semanal dos seus alunos ativos. Cadastre um aluno, envie o convite e, quando ele aceitar e enviar o primeiro check-in, a avaliação aparece aqui."
          action={<ButtonLink href="/coach/alunos">Ver alunos e convites</ButtonLink>}
        />
      ) : (
        <>
          <nav aria-label="Filtrar avaliações">
            <ul className="flex flex-wrap gap-2 border-b border-line pb-3">
              {filters.map((f) => {
                const active = f.id === filter;
                return (
                  <li key={f.id}>
                    <Link
                      href={f.id === "todas" ? "/coach/avaliacoes" : `/coach/avaliacoes?estado=${f.id}`}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors md:min-h-10 ${
                        active
                          ? "border-brand bg-brand-tint text-brand"
                          : "border-line-strong text-ink-muted hover:border-brand hover:text-ink"
                      }`}
                    >
                      {f.label}
                      <span className={`tabular-nums ${active ? "text-brand" : "text-ink-faint"}`}>{f.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {filter === "todas" ? (
            <div className="flex flex-col gap-8">
              <EvaluationGroup
                title={GROUP_META.work.label}
                count={groups.work.length}
                tone="work"
                description={groups.work.length > 0 ? "Para você fazer agora. O que espera há mais tempo vem primeiro." : undefined}
              >
                {groups.work.length > 0 ? (
                  <RowsList rows={groups.work} today={today} highlightFirst work />
                ) : (
                  <GroupEmpty
                    title="Nenhuma avaliação esperando por você"
                    text={
                      groups.waiting.length > 0
                        ? "Quando um aluno enviar o check-in, ele aparece aqui. Enquanto isso, você pode cobrar quem ainda não enviou."
                        : "Todos os ciclos desta semana estão concluídos."
                    }
                  />
                )}
              </EvaluationGroup>

              {groups.waiting.length > 0 && (
                <EvaluationGroup
                  title={GROUP_META.waiting.label}
                  count={groups.waiting.length}
                  description="Ainda não enviaram o check-in. Atrasados primeiro."
                >
                  <RowsList rows={groups.waiting} today={today} />
                </EvaluationGroup>
              )}

              {groups.done.length > 0 && (
                <EvaluationGroup title={GROUP_META.done.label} count={groups.done.length}>
                  <RowsList rows={groups.done} today={today} />
                </EvaluationGroup>
              )}
            </div>
          ) : (
            <FilteredList
              rows={
                filter === "avaliar" ? groups.work : filter === "aguardando" ? groups.waiting : groups.done
              }
              filter={filter}
              today={today}
            />
          )}
        </>
      )}
    </div>
  );
}

const EMPTY: Record<Exclude<FilterId, "todas">, { title: string; text: string; icon: IconName }> = {
  avaliar: {
    icon: "check-circle",
    title: "Nada para avaliar agora",
    text: "Quando um aluno enviar o check-in, a avaliação aparece aqui até você enviar a orientação.",
  },
  aguardando: {
    icon: "check-circle",
    title: "Ninguém devendo check-in",
    text: "Todos os alunos ativos já enviaram o check-in da semana.",
  },
  concluidas: {
    icon: "clock",
    title: "Nenhum ciclo concluído ainda",
    text: "Ao enviar a orientação de uma avaliação, o ciclo do aluno aparece aqui.",
  },
};

function FilteredList({
  rows,
  filter,
  today,
}: {
  rows: Awaited<ReturnType<typeof getEvaluationQueue>>;
  filter: Exclude<FilterId, "todas">;
  today: string;
}) {
  if (rows.length === 0) return <GroupEmpty {...EMPTY[filter]} />;
  const isWork = filter === "avaliar";
  return <RowsList rows={rows} today={today} highlightFirst={isWork} work={isWork} />;
}
