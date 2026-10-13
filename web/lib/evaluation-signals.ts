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

// ---------------------------------------------------------------------------------------------
// Cartões de sinais (V2, tarefa 14). Mesmas regras e limiares acima, em forma estruturada para a
// tela desenhar cartões: variação de cada métrica, estabilidade entre semanas, metas e check-ins.
// Cada texto é montado só com números e rótulos que existem nos registros — nunca causa, nunca
// diagnóstico, nunca "melhorou/piorou" (subir ou descer depende do objetivo do aluno).
// ---------------------------------------------------------------------------------------------

export type SignalCardTone = "attention" | "info" | "positive" | "neutral";

export type SignalCard = {
  id: string;
  tone: SignalCardTone;
  /** Selo curto no topo do cartão (ex.: "Variação relevante", "Estável", "Atenção"). */
  badge: string;
  /** O que o cartão mede (ex.: "Peso", "Metas da semana"). */
  title: string;
  /** Número em destaque (ex.: "−1,2 kg", "2 de 3"). */
  value: string;
  valueCaption?: string;
  /** Uma frase curta, só com fatos. */
  description: string;
  /** Contexto expansível: linhas "rótulo — valor" (semanas, metas). */
  context?: { label: string; value: string; current?: boolean }[];
};

function signed(value: number, unit: string): string {
  return `${value > 0 ? "+" : "−"}${num(Math.abs(value))} ${unit}`;
}

function pointsWord(points: number): string {
  return points === 1 ? "ponto" : "pontos";
}

export function deriveSignalCards(detail: EvaluationDetail): SignalCard[] {
  const cards: SignalCard[] = [];
  const week = detail.row.weekNumber;
  const ordered = [...detail.context].sort((a, b) => a.weekNumber - b.weekNumber);
  const currentRow = ordered.find((w) => w.weekNumber === week) ?? null;

  type MetricRule = {
    id: string;
    title: string;
    pick: (w: ContextWeek) => number | null;
    fmt: (v: number) => string;
    unit: (n: number) => string;
    limit: number;
    scale: boolean;
  };
  const adhSuffix = detail.adherenceIsScale ? " de 5" : "";
  const rules: MetricRule[] = [
    { id: "weight", title: "Peso", pick: (w) => w.weight, fmt: kg, unit: () => "kg", limit: WEIGHT_SIGNAL_MIN_KG, scale: false },
    {
      id: "adherence",
      title: "Aderência",
      pick: (w) => w.adherence,
      fmt: (v) => `${num(v)}${adhSuffix}`,
      unit: pointsWord,
      limit: SCALE_SIGNAL_MIN_POINTS,
      scale: true,
    },
    {
      id: "energy",
      title: "Energia",
      pick: (w) => w.energy,
      fmt: (v) => `${num(v)} de 5`,
      unit: pointsWord,
      limit: SCALE_SIGNAL_MIN_POINTS,
      scale: true,
    },
  ];

  for (const rule of rules) {
    const now = rule.id === "weight" ? detail.weight.current : currentRow ? rule.pick(currentRow) : null;
    const before = rule.id === "weight" ? detail.weight.previous : previousValue(detail, rule.pick);
    if (now == null || !before) continue;

    const diff = Math.round((now - before.value) * 100) / 100;
    const crossed = Math.abs(diff) >= rule.limit;

    // Série da janela de contexto (semanas com registro, até a atual) — a base da "estabilidade".
    const series = ordered
      .filter((w) => w.weekNumber <= week)
      .map((w) => ({ weekNumber: w.weekNumber, value: w.weekNumber === week ? now : rule.pick(w) }))
      .filter((p): p is { weekNumber: number; value: number } => p.value != null);
    // Contexto histórico = só semanas PASSADAS: o valor da semana atual já aparece em
    // "Recebido nesta semana" e na comparação, não se repete aqui.
    const context = series
      .filter((p) => p.weekNumber < week)
      .map((p) => ({ label: `Semana ${p.weekNumber}`, value: rule.fmt(p.value) }));
    const range = series.length > 0 ? Math.max(...series.map((p) => p.value)) - Math.min(...series.map((p) => p.value)) : 0;
    const stable = !crossed && series.length >= 3 && range < rule.limit;

    const valueText = diff === 0 ? "Igual" : signed(diff, rule.unit(Math.abs(diff)));
    const limitText = rule.id === "weight" ? kg(rule.limit) : `${rule.limit} pontos`;

    if (crossed) {
      cards.push({
        id: rule.id,
        tone: rule.scale && diff < 0 ? "attention" : "info",
        badge: "Variação relevante",
        title: rule.title,
        value: valueText,
        valueCaption: `desde a semana ${before.weekNumber}`,
        description: `Variação de ${limitText} ou mais — os valores de cada semana estão na comparação.`,
        context,
      });
    } else if (stable) {
      cards.push({
        id: rule.id,
        tone: "neutral",
        badge: "Estável",
        title: rule.title,
        value: range === 0 ? "Igual" : `até ${rule.id === "weight" ? kg(range) : `${num(range)} ${pointsWord(range)}`}`,
        valueCaption: `de diferença entre as semanas ${series[0].weekNumber} e ${week}`,
        description: `${series.length} semanas com registro, todas a menos de ${limitText} entre si.`,
        context,
      });
    }
    // Variação comum (abaixo do limite e sem tendência de estabilidade): nenhum cartão — a
    // diferença contra a semana anterior já é o padrão de "Comparar com outra semana".
  }

  // Check-ins das semanas anteriores da janela de contexto + prazo do desta semana.
  const prior = ordered.filter((w) => w.weekNumber < week);
  const missed = prior.filter((w) => !w.submitted).map((w) => w.weekNumber);
  const late = Boolean(detail.row.submittedAt && toSaoPauloDate(detail.row.submittedAt) > detail.row.periodEnd);
  if (missed.length > 0) {
    cards.push({
      id: "missed",
      tone: "attention",
      badge: "Atenção",
      title: "Check-ins",
      value: `${missed.length} sem envio`,
      valueCaption: missed.length === 1 ? `na semana ${missed[0]}` : `nas semanas ${missed.join(", ")}`,
      description: `Sem check-in enviado ${missed.length === 1 ? "na semana" : "nas semanas"} ${missed.join(", ")}.`,
      context: prior.map((w) => ({ label: `Semana ${w.weekNumber}`, value: w.submitted ? "Enviado" : "Sem envio" })),
    });
  } else if (prior.length >= 2 && !late) {
    cards.push({
      id: "checkins-ok",
      tone: "positive",
      badge: "Em dia",
      title: "Check-ins",
      value: `${prior.length + 1} seguidos`,
      valueCaption: `semanas ${prior[0].weekNumber} a ${week}`,
      description: `Check-in enviado em todas as semanas de ${prior[0].weekNumber} a ${week}.`,
      context: prior.map((w) => ({ label: `Semana ${w.weekNumber}`, value: "Enviado" })),
    });
  }
  if (late && detail.row.submittedAt) {
    cards.push({
      id: "late",
      tone: "attention",
      badge: "Atenção",
      title: "Prazo do check-in",
      value: shortDate(detail.row.submittedAt),
      valueCaption: `fim da semana: ${dateOnlyShort(detail.row.periodEnd)}`,
      description: `O check-in da semana ${week} foi enviado em ${shortDate(detail.row.submittedAt)}, depois do fim da semana (${dateOnlyShort(detail.row.periodEnd)}).`,
    });
  }

  // Metas da semana: atingidas × em parte × não atingidas × em aberto.
  const goals = detail.goals;
  if (goals.length > 0) {
    const met = goals.filter((g) => g.result_status === "success").length;
    const partial = goals.filter((g) => g.result_status === "partial").length;
    const failed = goals.filter((g) => g.result_status === "fail").length;
    const open = goals.filter((g) => g.result_status === "pending").length;
    const parts = [
      `${met} atingida${met === 1 ? "" : "s"}`,
      ...(partial ? [`${partial} em parte`] : []),
      ...(failed ? [`${failed} não atingida${failed === 1 ? "" : "s"}`] : []),
      ...(open ? [`${open} em aberto`] : []),
    ];
    const statusText: Record<string, string> = {
      success: "Atingida",
      partial: "Em parte",
      fail: "Não atingida",
      pending: "Em aberto",
    };
    cards.push({
      id: "goals",
      tone: failed > 0 ? "attention" : met === goals.length ? "positive" : "info",
      badge: failed > 0 ? "Atenção" : met === goals.length ? "Metas cumpridas" : "Metas",
      title: "Metas da semana",
      value: `${met} de ${goals.length}`,
      valueCaption: "atingidas",
      description: `${parts.join(" · ")}.`,
      context: goals.map((g) => ({
        label: g.label,
        value: `meta ${g.target_value.toLocaleString("pt-BR")}${g.unit ? ` ${g.unit}` : ""}${
          g.result_value != null ? ` · resultado ${Number(g.result_value).toLocaleString("pt-BR")}` : ""
        } · ${statusText[g.result_status] ?? g.result_status}`,
      })),
    });
  }

  const order: Record<SignalCardTone, number> = { attention: 0, info: 1, neutral: 2, positive: 3 };
  return cards.sort((a, b) => order[a.tone] - order[b.tone]);
}

/** Existe pelo menos uma semana anterior com dado pra comparar? Decide a mensagem do estado vazio. */
export function hasPriorWeeks(detail: EvaluationDetail): boolean {
  return (
    detail.weight.previous != null ||
    detail.context.some((w) => w.weekNumber < detail.row.weekNumber && (w.submitted || w.weight != null))
  );
}
