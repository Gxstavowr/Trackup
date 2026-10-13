import type { EvaluationRow } from "@/lib/evaluations";

/**
 * Situação de UM aluno no ciclo semanal, na linguagem do coach (pura, sem I/O — testável).
 * Deriva de `EvaluationRow` (estado do ciclo + `late`) e do dia de hoje; não grava nada.
 * Cada aluno tem exatamente UMA situação, logo exatamente UM grupo e UMA ação principal.
 *
 *  situação              condição                                     grupo     ação principal
 *  review_pending        check-in enviado, coach ainda não abriu      work      Abrir avaliação
 *  review_in_progress    coach abriu, sem rascunho nem orientação     work      Continuar avaliação
 *  awaiting_orientation  rascunho de orientação salvo, falta enviar   work      Finalizar avaliação
 *  checkin_late          aluno não enviou e a semana já fechou        waiting   Cobrar check-in
 *  checkin_waiting       aluno ainda não enviou (semana aberta)       waiting   Cobrar check-in
 *  done                  orientação enviada                           done      Ver acompanhamento
 *
 * `overdue` é um sinalizador (não outra situação) para as três de "work" cuja semana já
 * terminou: a avaliação ficou para trás.
 */
export type Situation =
  | "review_pending"
  | "review_in_progress"
  | "awaiting_orientation"
  | "checkin_late"
  | "checkin_waiting"
  | "done";

export type SituationGroup = "work" | "waiting" | "done";
export type SituationTone = "accent" | "warning" | "danger" | "neutral" | "success";

export const SITUATION_META: Record<
  Situation,
  { label: string; tone: SituationTone; action: string; group: SituationGroup }
> = {
  review_pending: { label: "Check-in recebido", tone: "accent", action: "Abrir avaliação", group: "work" },
  review_in_progress: { label: "Em avaliação", tone: "accent", action: "Continuar avaliação", group: "work" },
  awaiting_orientation: {
    label: "Aguardando orientação",
    tone: "warning",
    action: "Finalizar avaliação",
    group: "work",
  },
  checkin_late: { label: "Check-in atrasado", tone: "danger", action: "Cobrar check-in", group: "waiting" },
  checkin_waiting: { label: "Aguardando check-in", tone: "neutral", action: "Cobrar check-in", group: "waiting" },
  done: { label: "Ciclo concluído", tone: "success", action: "Ver acompanhamento", group: "done" },
};

type RowLike = Pick<EvaluationRow, "state" | "late" | "periodEnd">;

export function getSituation(row: RowLike): Situation {
  switch (row.state) {
    case "pending":
      return "review_pending";
    case "in_progress":
      return "review_in_progress";
    case "draft":
      return "awaiting_orientation";
    case "done":
      return "done";
    case "awaiting_checkin":
      return row.late ? "checkin_late" : "checkin_waiting";
  }
}

/** Avaliação do coach (check-in já enviado) cuja semana já acabou — ficou para trás. `today` = AAAA-MM-DD (SP). */
export function isOverdue(row: RowLike, today: string): boolean {
  return SITUATION_META[getSituation(row)].group === "work" && row.periodEnd < today;
}

export type GroupedRows<T> = { work: T[]; waiting: T[]; done: T[] };

/** Particiona as linhas: cada uma cai em exatamente um grupo; a ordem de entrada é preservada. */
export function groupRows<T extends RowLike>(rows: T[]): GroupedRows<T> {
  const out: GroupedRows<T> = { work: [], waiting: [], done: [] };
  for (const r of rows) out[SITUATION_META[getSituation(r)].group].push(r);
  return out;
}

/** Quantos alunos pedem atenção especial: check-in atrasado + avaliação de semana anterior parada. */
export function countAttention(rows: RowLike[], today: string): number {
  return rows.filter((r) => getSituation(r) === "checkin_late" || isOverdue(r, today)).length;
}

/**
 * Rótulo e filtro de cada grupo — uma fonte só para os chips de `/coach/avaliacoes` e os números
 * do resumo em `/coach`, pra as duas telas nunca chamarem o mesmo grupo de nomes diferentes.
 */
export const GROUP_META: Record<SituationGroup, { label: string; filter: "avaliar" | "aguardando" | "concluidas" }> = {
  work: { label: "Para avaliar", filter: "avaliar" },
  waiting: { label: "Aguardando aluno", filter: "aguardando" },
  done: { label: "Concluídas", filter: "concluidas" },
};

/** URL da fila completa (`/coach/avaliacoes`), opcionalmente já filtrada por um grupo. */
export function evaluationsQueueHref(group?: SituationGroup): string {
  return group ? `/coach/avaliacoes?estado=${GROUP_META[group].filter}` : "/coach/avaliacoes";
}

/**
 * Progresso da semana (só contagens, nunca respostas do check-in):
 *  - `received`: check-ins recebidos (tudo que não está aguardando o aluno);
 *  - `done`: orientações enviadas (ciclo concluído);
 *  - `pending`: avaliações a fazer (recebido sem orientação enviada);
 *  - `late` / `overdue`: check-ins atrasados e avaliações de semana anterior paradas.
 */
export type WeekProgress = {
  active: number;
  received: number;
  done: number;
  pending: number;
  drafts: number;
  late: number;
  overdue: number;
};

export function weekProgress(rows: RowLike[], today: string): WeekProgress {
  const out: WeekProgress = { active: rows.length, received: 0, done: 0, pending: 0, drafts: 0, late: 0, overdue: 0 };
  for (const r of rows) {
    const s = getSituation(r);
    const group = SITUATION_META[s].group;
    if (group !== "waiting") out.received += 1;
    if (group === "done") out.done += 1;
    if (group === "work") out.pending += 1;
    if (s === "awaiting_orientation") out.drafts += 1;
    if (s === "checkin_late") out.late += 1;
    if (isOverdue(r, today)) out.overdue += 1;
  }
  return out;
}

/**
 * Ações prioritárias do hub: avaliações de semana anterior primeiro, depois o resto da fila de
 * trabalho e, por fim, check-ins atrasados (cobrança). Ciclos concluídos e check-ins ainda no
 * prazo nunca entram — não exigem ação. Ordem estável dentro de cada faixa (a da fila).
 */
export function priorityRows<T extends RowLike>(rows: T[], today: string, limit: number): T[] {
  const rank = (r: T): number => {
    const s = getSituation(r);
    if (SITUATION_META[s].group === "work") return isOverdue(r, today) ? 0 : 1;
    if (s === "checkin_late") return 2;
    return -1;
  };
  return rows
    .map((r, i) => ({ r, i, k: rank(r) }))
    .filter((x) => x.k >= 0)
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.r);
}
