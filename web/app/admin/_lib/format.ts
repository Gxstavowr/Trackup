/** Formatação do painel (pura, fuso de São Paulo para servidor e navegador baterem). */

const DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR");

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME.format(d).replace(",", " ·");
}

/** `YYYY-MM-DD` (coluna `date`) -> dd/mm/aaaa sem deslocar o dia. */
export function formatDateOnly(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}

export function formatCents(cents: number): string {
  return BRL.format(cents / 100);
}

export function formatCount(n: number): string {
  return NUM.format(n);
}

export const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;
