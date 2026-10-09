import type { ContextWeek, EvaluationDetail } from "@/lib/evaluations";
import { toSaoPauloDate } from "@/lib/finance/dates";

/**
 * "Sinais importantes" da avaliação (item 13): pontos que o coach deve OBSERVAR, derivados só de
 * dado real (métricas, respostas, metas e check-ins das últimas semanas) por regras simples e
 * factuais. Nada aqui diagnostica nem afirma causa: cada sinal descreve o que os registros dizem
 * ("o peso variou 1,4 kg", "a aderência caiu 2 pontos"), com os números à vista.
 *
 * Limiares (deliberadamente simples e fixos):
 *  - peso: variação de 1 kg ou mais contra o registro anterior;
 *  - aderência / energia (escala 1–5): variação de 2 pontos ou mais contra a semana anterior
 *    com registro.
 * Módulo puro (sem I/O), testável e usável no servidor ou no cliente.
 */

export type EvaluationSignalTone = "attention" | "info";

export type EvaluationSignal = {
  id: string;
  tone: EvaluationSignalTone;
  text: string;
};

export const WEIGHT_SIGNAL_MIN_KG = 1;
export const SCALE_SIGNAL_MIN_POINTS = 2;

function kg(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
}

function num(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function shortDate(iso: string): string {
  // `toSaoPauloDate` devolve AAAA-MM-DD; reordena pra dd/mm sem passar por Date (sem deslocar dia).
  const [, m, d] = toSaoPauloDate(iso).split("-");
  return `${d}/${m}`;
}

function dateOnlyShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

/** Semana anterior mais recente (dentro da janela de contexto) que tem esse valor. */
export function previousValue(
  detail: EvaluationDetail,
  pick: (week: ContextWeek) => number | null
): { weekNumber: number; value: number } | null {
  const current = detail.row.weekNumber;
  const earlier = detail.context
    .filter((w) => w.weekNumber < current && pick(w) != null)
    .sort((a, b) => b.weekNumber - a.weekNumber)[0];
  return earlier ? { weekNumber: earlier.weekNumber, value: pick(earlier) as number } : null;
}

export function deriveEvaluationSignals(detail: EvaluationDetail): EvaluationSignal[] {
  const signals: EvaluationSignal[] = [];
  const { row } = detail;
  const week = row.weekNumber;

  // Peso: mudança de 1 kg ou mais contra o registro anterior. Neutro (subir/descer depende do objetivo).
  const { current: weight, previous: previousWeight, delta } = detail.weight;
  if (weight != null && previousWeight && delta != null && Math.abs(delta) >= WEIGHT_SIGNAL_MIN_KG) {
    signals.push({
      id: "weight",
      tone: "info",
      text: `O peso ${delta > 0 ? "subiu" : "caiu"} ${kg(Math.abs(delta))} desde a semana ${previousWeight.weekNumber} (${kg(previousWeight.value)} → ${kg(weight)}).`,
    });
  }

  // Aderência e energia: variação de 2 pontos ou mais contra a semana anterior com registro.
  const scaleSuffix = (isScale: boolean) => (isScale ? " de 5" : "");
  const scaleRules: {
    id: string;
    label: string;
    pick: (w: ContextWeek) => number | null;
    isScale: boolean;
  }[] = [
    { id: "adherence", label: "A aderência", pick: (w) => w.adherence, isScale: detail.adherenceIsScale },
    { id: "energy", label: "A energia", pick: (w) => w.energy, isScale: true },
  ];
  const currentWeekRow = detail.context.find((w) => w.weekNumber === week);
  for (const rule of scaleRules) {
    const now = currentWeekRow ? rule.pick(currentWeekRow) : null;
    const before = previousValue(detail, rule.pick);
    if (now == null || !before) continue;
    const diff = now - before.value;
    if (Math.abs(diff) < SCALE_SIGNAL_MIN_POINTS) continue;
    const points = Math.abs(diff);
    signals.push({
      id: rule.id,
      tone: diff < 0 ? "attention" : "info",
      text: `${rule.label} ${diff < 0 ? "caiu" : "subiu"} ${num(points)} ${points === 1 ? "ponto" : "pontos"} desde a semana ${before.weekNumber} (${num(before.value)}${scaleSuffix(rule.isScale)} → ${num(now)}${scaleSuffix(rule.isScale)}).`,
    });
  }

  // Check-ins que não chegaram nas semanas anteriores da janela de contexto.
  const missed = detail.context.filter((w) => w.weekNumber < week && !w.submitted).map((w) => w.weekNumber);
  if (missed.length > 0) {
    const weeksLabel = [...missed].sort((a, b) => a - b).join(", ");
    signals.push({
      id: "missed",
      tone: "attention",
      text: `Sem check-in enviado ${missed.length === 1 ? "na semana" : "nas semanas"} ${weeksLabel}.`,
    });
  }

  // Check-in desta avaliação enviado depois do fim da semana.
  if (row.submittedAt && toSaoPauloDate(row.submittedAt) > row.periodEnd) {
    signals.push({
      id: "late",
      tone: "attention",
      text: `O check-in da semana ${week} foi enviado em ${shortDate(row.submittedAt)}, depois do fim da semana (${dateOnlyShort(row.periodEnd)}).`,
    });
  }

  // Metas da semana com resultado já registrado como não atingido / parcial.
  const failed = detail.goals.filter((g) => g.result_status === "fail");
  if (failed.length > 0) {
    signals.push({
      id: "goals-fail",
      tone: "attention",
      text: `${failed.length === 1 ? "1 meta da semana não foi atingida" : `${failed.length} metas da semana não foram atingidas`}: ${failed.map((g) => g.label).join("; ")}.`,
    });
  }
  const partial = detail.goals.filter((g) => g.result_status === "partial");
  if (partial.length > 0) {
    signals.push({
      id: "goals-partial",
      tone: "info",
      text: `${partial.length === 1 ? "1 meta da semana foi atingida em parte" : `${partial.length} metas da semana foram atingidas em parte`}: ${partial.map((g) => g.label).join("; ")}.`,
    });
  }

  return signals;
}

/** Existe pelo menos uma semana anterior com dado pra comparar? Decide a mensagem do estado vazio. */
export function hasPriorWeeks(detail: EvaluationDetail): boolean {
  return (
    detail.weight.previous != null ||
    detail.context.some((w) => w.weekNumber < detail.row.weekNumber && (w.submitted || w.weight != null))
  );
}
