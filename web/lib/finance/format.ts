import type { DateOnly, MonthKey } from "./dates";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos (inteiro) -> `R$ 1.234,56`. Todo dinheiro do banco é em centavos. */
export function formatBRL(cents: number): string {
  return BRL.format(cents / 100);
}

/** `YYYY-MM-DD` -> `dd/mm/aaaa`. Em UTC, pra coluna `date` não deslocar um dia. */
export function formatDateOnly(date: DateOnly): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** `YYYY-MM-DD` -> `dd/mm`. */
export function formatDateShort(date: DateOnly): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  });
}

/** `2026-09` -> `setembro de 2026`. */
export function formatMonthLabel(key: MonthKey): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

/** `2026-09` -> `setembro` (só o nome do mês, pros botões anterior/próximo). */
export function formatMonthName(key: MonthKey): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    month: "long",
  });
}

/** Primeiro nome pra mensagem de cobrança. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Telefone -> dígitos pro `wa.me` (com DDI). Sem DDI (10–11 dígitos = DDD + número) assume
 * Brasil (55). `null` se não formar um número plausível — a UI então desabilita o botão em
 * vez de mostrar um link quebrado. (Cópia local da regra usada em Avaliações: aquele arquivo
 * está fora da fronteira deste módulo e pode mudar sem aviso.)
 */
export function whatsappDigits(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}
