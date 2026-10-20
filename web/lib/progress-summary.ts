import {
  computeMetricTrend,
  formatMetricValue,
  formatTrendDelta,
  selectPeriodWeeks,
  type EvolutionData,
  type EvolutionPeriod,
} from "@/lib/evolution-format";
import { dateShort } from "@/lib/week-comparison-format";
import { isSensitiveKey } from "@/lib/checkin-catalog";

/**
 * Resumo da evolução do aluno (V2 tarefa 27) — módulo PURO, só regras sobre registros reais.
 *
 * Princípios (iguais aos de `evaluation-signals.ts`): descreve o que os registros mostram, com os
 * números à vista e o período de referência explícito; NÃO diagnostica, NÃO afirma causa, NÃO
 * extrapola tendência. Sem dado suficiente devolve `status: "insufficient"` (a tela mostra um
 * estado vazio honesto, nunca um texto inventado).
 *
 * Janela: as últimas `period` semanas COM registro de métrica (padrão `SUMMARY_WEEKS`; mesma noção
 * de "semana com dado" e MESMO seletor de período — 4/8/12/completo — do gráfico de evolução, então
 * resumo e gráfico falam sempre da mesma janela). Precisa de pelo menos 2 semanas pra comparar.
 * Check-ins e metas usam a janela de semanas do próprio resumo (da 1ª semana com dado até a corrente).
 */

export const SUMMARY_WEEKS = 4;
const MAX_METRIC_ITEMS = 3;

export type SummaryItem = {
  id: string;
  text: string;
  /** Âncora da seção da tela com os dados por trás da frase. */
  href: string;
};

/** Origem do texto do resumo — a tela rotula conforme isto. Hoje só `rules` existe. */
export type SummarySource = "rules" | "ai";

export type ProgressSummary =
  | { status: "insufficient"; reason: string }
  | {
      status: "ok";
      /** `rules` = regras fixas deste módulo; `ai` = devolvido por um `SummaryProvider` de IA. */
      source: SummarySource;
      /** "Semanas 5 a 8 · 02/09 a 23/09". */
      periodLabel: string;
      items: SummaryItem[];
    };

export type SummaryCheckin = { weekNumber: number; status: string };
export type SummaryGoal = { weekNumber: number; resultStatus: "success" | "partial" | "fail" | "pending" };

export type SummaryInput = {
  evolution: EvolutionData | null;
  checkins: SummaryCheckin[];
  goals: SummaryGoal[];
  /** Semana corrente do aluno (`computeWeekInfo`); `null` sem data de início. */
  currentWeek: number | null;
  /** Período do seletor de evolução (padrão: últimas `SUMMARY_WEEKS` semanas com medidas). */
  period?: EvolutionPeriod;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildProgressSummary(input: SummaryInput): ProgressSummary {
  const { evolution, checkins, goals, currentWeek, period = SUMMARY_WEEKS } = input;
  const periodWeeks = evolution ? selectPeriodWeeks(evolution.weeks, period) : [];

  if (!evolution || periodWeeks.length < 2) {
    return {
      status: "insufficient",
      reason:
        "Ainda não há registros suficientes para resumir. O resumo aparece depois de pelo menos duas semanas com medidas registradas nos seus check-ins.",
    };
  }

  const first = periodWeeks[0];
  const last = periodWeeks[periodWeeks.length - 1];
  const dates = first.periodStart && last.periodStart ? ` · ${dateShort(first.periodStart)} a ${dateShort(last.periodStart)}` : "";
  const periodLabel = `Semanas ${first.weekNumber} a ${last.weekNumber}${dates}`;

  const items: SummaryItem[] = [];

  // Métricas acompanhadas: peso primeiro; só as que têm ≥2 pontos no período.
  const ordered = [...evolution.metrics].sort((a, b) => (a.key === "weight_kg" ? -1 : b.key === "weight_kg" ? 1 : 0));
  const stable: string[] = [];
  let shown = 0;
  for (const m of ordered) {
    const trend = computeMetricTrend(periodWeeks, m.key, m.goalDirection);
    if (!trend.hasEnoughData || trend.first == null || trend.latest == null || trend.delta == null) continue;
    if (trend.delta === 0) {
      stable.push(m.label.toLocaleLowerCase("pt-BR"));
      continue;
    }
    if (shown >= MAX_METRIC_ITEMS) continue;
    shown += 1;
    const direction =
      trend.good == null ? "" : trend.good ? " — no sentido da meta definida com seu coach" : " — no sentido oposto ao da meta definida com seu coach";
    items.push({
      id: `metric-${m.key}`,
      text: `${m.label}: de ${formatMetricValue(m.unit, trend.first)} (semana ${trend.firstWeek}) para ${formatMetricValue(m.unit, trend.latest)} (semana ${trend.latestWeek}), ${formatTrendDelta(m.unit, trend.delta)}${direction}.`,
      href: "#metricas",
    });
  }
  if (stable.length > 0) {
    items.push({
      id: "stable",
      text: `Sem variação no período: ${stable.join(", ")}.`,
      href: "#metricas",
    });
  }

  // Regularidade dos check-ins na mesma janela de semanas (semana corrente só conta se já enviada).
  if (currentWeek != null) {
    const from = Math.max(1, first.weekNumber);
    const sent = new Set(
      checkins.filter((c) => c.status === "submitted" || c.status === "reviewed").map((c) => c.weekNumber)
    );
    const upTo = sent.has(currentWeek) ? currentWeek : currentWeek - 1;
    if (upTo >= from) {
      const total = upTo - from + 1;
      let done = 0;
      for (let w = from; w <= upTo; w += 1) if (sent.has(w)) done += 1;
      if (total >= 2) {
        items.push({
          id: "checkins",
          text: `Check-ins enviados nas semanas ${from} a ${upTo}: ${done} de ${total}.`,
          href: "#jornada",
        });
      }
    }

    // Metas com resultado na mesma janela.
    const resolved = goals.filter((g) => g.weekNumber >= from && g.weekNumber <= currentWeek && g.resultStatus !== "pending");
    if (resolved.length > 0) {
      const count = (s: SummaryGoal["resultStatus"]) => resolved.filter((g) => g.resultStatus === s).length;
      const parts = [
        `${plural(count("success"), "atingida", "atingidas")}`,
        `${plural(count("partial"), "parcial", "parciais")}`,
        `${plural(count("fail"), "não atingida", "não atingidas")}`,
      ];
      items.push({
        id: "goals",
        text: `Metas semanais com resultado nas semanas ${from} a ${currentWeek}: ${parts.join(", ")}.`,
        href: "#metas",
      });
    }
  }

  if (items.length === 0) {
    return {
      status: "insufficient",
      reason: "Os registros do período ainda não trazem variações para resumir.",
    };
  }

  return { status: "ok", source: "rules", periodLabel, items };
}

// ---------------------------------------------------------------------------
// Contrato para uma futura integração de IA (V5 item 32) — NADA aqui chama IA nem envia dados.
// ---------------------------------------------------------------------------
//
// Quando houver um provedor real, ele implementa `SummaryProvider` e recebe SÓ o
// `SummaryPayload`: números e rótulos de métricas do catálogo, sem nome, e-mail, texto livre,
// respostas do check-in, fotos, notas do coach ou qualquer chave sensível. O resultado volta no
// mesmo formato (`ProgressSummary` com `source: "ai"`), então a tela (`EvolutionSummary`) já sabe
// rotular e a regra continua: se o provedor falhar ou não existir, vale `buildProgressSummary`.
// Por que um payload separado: a decisão do que SAI do app fica num único lugar, testável.

export type SummaryPayloadMetric = {
  key: string;
  label: string;
  unit: string | null;
  goalDirection: string | null;
  firstWeek: number;
  firstValue: number;
  latestWeek: number;
  latestValue: number;
  delta: number;
};

export type SummaryPayload = {
  /** Versão do formato — um provedor recusa versões que não conhece. */
  version: 1;
  firstWeek: number;
  lastWeek: number;
  metrics: SummaryPayloadMetric[];
  checkins: { sent: number; total: number } | null;
  goals: { success: number; partial: number; fail: number } | null;
};

export interface SummaryProvider {
  /** Identificador estável (ex.: "rules", "claude"). */
  readonly id: string;
  readonly source: SummarySource;
  summarize(payload: SummaryPayload): Promise<SummaryItem[]> | SummaryItem[];
}

/**
 * Recorte estruturado e mínimo do período, pronto para um provedor. `null` quando não há dado
 * suficiente (mesma regra do resumo por regras). Métricas sensíveis nunca entram.
 */
export function buildSummaryPayload(input: SummaryInput): SummaryPayload | null {
  const { evolution, checkins, goals, currentWeek, period = SUMMARY_WEEKS } = input;
  const periodWeeks = evolution ? selectPeriodWeeks(evolution.weeks, period) : [];
  if (!evolution || periodWeeks.length < 2) return null;
  const first = periodWeeks[0];
  const last = periodWeeks[periodWeeks.length - 1];

  const metrics: SummaryPayloadMetric[] = [];
  for (const m of evolution.metrics) {
    if (isSensitiveKey(m.key)) continue;
    const t = computeMetricTrend(periodWeeks, m.key, m.goalDirection);
    if (!t.hasEnoughData || t.first == null || t.latest == null || t.delta == null) continue;
    metrics.push({
      key: m.key,
      label: m.label,
      unit: m.unit ?? null,
      goalDirection: m.goalDirection ?? null,
      firstWeek: t.firstWeek as number,
      firstValue: t.first,
      latestWeek: t.latestWeek as number,
      latestValue: t.latest,
      delta: t.delta,
    });
  }

  let checkinStat: SummaryPayload["checkins"] = null;
  let goalStat: SummaryPayload["goals"] = null;
  if (currentWeek != null) {
    const from = Math.max(1, first.weekNumber);
    const sent = new Set(checkins.filter((c) => c.status === "submitted" || c.status === "reviewed").map((c) => c.weekNumber));
    const upTo = sent.has(currentWeek) ? currentWeek : currentWeek - 1;
    if (upTo >= from) {
      let done = 0;
      for (let w = from; w <= upTo; w += 1) if (sent.has(w)) done += 1;
      checkinStat = { sent: done, total: upTo - from + 1 };
    }
    const resolved = goals.filter((g) => g.weekNumber >= from && g.weekNumber <= currentWeek && g.resultStatus !== "pending");
    if (resolved.length > 0) {
      const count = (s: SummaryGoal["resultStatus"]) => resolved.filter((g) => g.resultStatus === s).length;
      goalStat = { success: count("success"), partial: count("partial"), fail: count("fail") };
    }
  }

  return { version: 1, firstWeek: first.weekNumber, lastWeek: last.weekNumber, metrics, checkins: checkinStat, goals: goalStat };
}
