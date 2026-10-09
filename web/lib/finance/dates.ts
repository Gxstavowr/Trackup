/**
 * Datas do Financeiro — tudo calculado em America/Sao_Paulo.
 *
 * Duas famílias de coluna no banco, tratadas de forma diferente de propósito:
 *   - `due_date`/`paid_date` são `date` (sem hora, sem fuso). Chegam como `YYYY-MM-DD` e são
 *     comparadas como STRING (ordem lexicográfica == cronológica nesse formato) contra o "hoje"
 *     de São Paulo. Nunca passam por `new Date(str)` sem `T00:00:00Z` + `timeZone: "UTC"`,
 *     senão deslocam um dia conforme o fuso de quem roda o código.
 *   - `created_at` é `timestamptz`: é convertido para a data LOCAL de São Paulo antes de ser
 *     comparado com o mês (uma assinatura criada às 23h de 31/08 em SP já é 01/09 em UTC).
 *
 * Módulo puro (sem I/O, sem `server-only`): pode ser usado por qualquer lado.
 */

export const FINANCE_TIMEZONE = "America/Sao_Paulo";

/** `YYYY-MM-DD` */
export type DateOnly = string;
/** `YYYY-MM` */
export type MonthKey = string;

// en-CA formata como `YYYY-MM-DD` de forma estável entre engines.
const SP_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: FINANCE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data de "hoje" em São Paulo, como `YYYY-MM-DD`. */
export function todayInSaoPaulo(now: Date = new Date()): DateOnly {
  return SP_DATE.format(now);
}

/** Converte um instante (`timestamptz` ISO) para a data local de São Paulo. */
export function toSaoPauloDate(iso: string): DateOnly {
  return SP_DATE.format(new Date(iso));
}

export function monthOf(date: DateOnly): MonthKey {
  return date.slice(0, 7);
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Valida `?mes=YYYY-MM` vindo da URL; qualquer coisa fora do formato cai no `fallback`. */
export function parseMonthKey(raw: string | null | undefined, fallback: MonthKey): MonthKey {
  if (!raw) return fallback;
  const match = MONTH_RE.exec(raw);
  if (!match) return fallback;
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) return fallback;
  return raw;
}

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Primeiro e último dia (inclusive) do mês, como `YYYY-MM-DD`. */
export function monthRange(key: MonthKey): { start: DateOnly; end: DateOnly } {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${key}-01`, end: `${key}-${String(last).padStart(2, "0")}` };
}

export function addDays(date: DateOnly, days: number): DateOnly {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dias inteiros de `from` até `to` (positivo se `to` é depois de `from`). */
export function daysBetween(from: DateOnly, to: DateOnly): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}
