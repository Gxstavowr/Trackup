/**
 * Regras PURAS do painel do proprietário (sem I/O, sem `server-only`), testadas em
 * `logic.test.ts`. Ficam numa pasta privada (`_lib`, fora do roteamento) para poderem ser
 * importadas tanto por `lib/admin/*` (servidor) quanto pelas páginas, e testadas com `tsx --test`.
 *
 * Nada aqui decide autorização sozinho: `parseAdminAllowlist` só interpreta a variável de
 * ambiente; quem lê a variável e compara com o usuário da sessão é `lib/admin/auth.ts`.
 */

import { BILLING_STATUSES, type BillingStatus } from "@/lib/billing/state";

// ---------------------------------------------------------------------------
// Allowlist do proprietário
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * `TRACKLY_ADMIN_USER_IDS` ("uuid1, uuid2") -> conjunto de UUIDs em minúsculas. Entradas que não
 * são UUID são descartadas (um valor malformado nunca vira "todo mundo é admin"). Sem variável ou
 * vazia -> conjunto vazio -> ninguém é admin.
 */
export function parseAdminAllowlist(raw: string | null | undefined): ReadonlySet<string> {
  if (!raw) return new Set();
  const ids = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID_RE.test(s));
  return new Set(ids);
}

export function isIdInAllowlist(id: string | null | undefined, allowlist: ReadonlySet<string>): boolean {
  if (!id || typeof id !== "string") return false;
  const norm = id.trim().toLowerCase();
  return UUID_RE.test(norm) && allowlist.has(norm);
}

// ---------------------------------------------------------------------------
// Período (fuso de São Paulo — UTC-3 fixo desde 2019, sem horário de verão)
// ---------------------------------------------------------------------------

export const PERIOD_KEYS = ["mes", "anterior"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export type AdminPeriod = {
  key: PeriodKey;
  /** Início (inclusivo), ISO. */
  from: string;
  /** Fim (exclusivo), ISO. */
  to: string;
  /** "outubro de 2026" */
  label: string;
};

const SP_OFFSET_HOURS = 3;
const SP_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
});
const MONTH_LABEL = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

export function parsePeriodKey(raw: string | string[] | undefined): PeriodKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (PERIOD_KEYS as readonly string[]).includes(v ?? "") ? (v as PeriodKey) : "mes";
}

/** Meia-noite de São Paulo do dia 1 de (ano, mês 0-based), como instante UTC. */
function spMonthStart(year: number, month0: number): Date {
  return new Date(Date.UTC(year, month0, 1, SP_OFFSET_HOURS, 0, 0));
}

/**
 * Janela meio-aberta [from, to) do mês civil em São Paulo. O mês INTEIRO (não "até agora"):
 * assim "cobranças previstas no período" enxerga as próximas cobranças do resto do mês.
 */
export function resolvePeriod(key: PeriodKey, now: Date = new Date()): AdminPeriod {
  const parts = SP_PARTS.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month0 = Number(parts.find((p) => p.type === "month")?.value) - 1;
  const offset = key === "anterior" ? -1 : 0;
  const from = spMonthStart(year, month0 + offset);
  const to = spMonthStart(year, month0 + offset + 1);
  return {
    key,
    from: from.toISOString(),
    to: to.toISOString(),
    label: MONTH_LABEL.format(new Date(Date.UTC(year, month0 + offset, 15))),
  };
}

// ---------------------------------------------------------------------------
// Indicadores (`admin_business_overview`)
// ---------------------------------------------------------------------------

export type PackageBucket = "training" | "nutrition" | "hybrid" | "legacy";

export type BusinessOverview = {
  generatedAt: string | null;
  coachesTotal: number;
  studentsTotal: number;
  studentsWithAccount: number;
  newCoaches: number;
  newStudents: number;
  billingByStatus: Record<BillingStatus, number>;
  billingLastUpdate: string | null;
  /** Preço vigente da mensalidade do Trackly. `null` = não configurado. */
  platformPriceCents: number | null;
  /** Preço × assinaturas `active`. `null` = sem preço configurado (nunca inventado). */
  mrrExpectedCents: number | null;
  /** QUANTIDADE de eventos de pagamento aplicados no período (sem valor em R$). */
  paidEventsInPeriod: number;
  nextChargesInPeriod: number;
  studentsAwaitingQuestionnaire: number;
  protocolsInPreparation: number;
  studentsByPackage: Record<PackageBucket, number>;
};

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** Contagem: número finito >= 0 (aceita string numérica de bigint); qualquer outra coisa -> 0. */
function count(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

/** Valor opcional: `null`/ausente/inválido continua `null` (diferente de zero). */
function optionalCents(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function optionalIso(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  return Number.isNaN(new Date(v).getTime()) ? null : v;
}

/** JSON cru da RPC -> forma tipada, sem inventar nada (ausente = 0 em contagem, `null` em valor). */
export function normalizeOverview(raw: unknown): BusinessOverview {
  const o = asObj(raw);
  const byStatusRaw = asObj(o.billing_by_status);
  const billingByStatus = Object.fromEntries(
    BILLING_STATUSES.map((s) => [s, count(byStatusRaw[s])])
  ) as Record<BillingStatus, number>;
  const pkgRaw = asObj(o.students_by_package);
  const price = optionalCents(o.platform_price_cents);
  return {
    generatedAt: optionalIso(o.generated_at),
    coachesTotal: count(o.coaches_total),
    studentsTotal: count(o.students_total),
    studentsWithAccount: count(o.students_with_account),
    newCoaches: count(o.new_coaches),
    newStudents: count(o.new_students),
    billingByStatus,
    billingLastUpdate: optionalIso(o.billing_last_update),
    platformPriceCents: price,
    // Sem preço, o MRR é `null` mesmo que a RPC devolva algo (defesa: nunca inventar MRR).
    mrrExpectedCents: price === null ? null : optionalCents(o.mrr_expected_cents),
    paidEventsInPeriod: count(o.paid_events_in_period),
    nextChargesInPeriod: count(o.next_charges_in_period),
    studentsAwaitingQuestionnaire: count(o.students_awaiting_questionnaire),
    protocolsInPreparation: count(o.protocols_in_preparation),
    studentsByPackage: {
      training: count(pkgRaw.training),
      nutrition: count(pkgRaw.nutrition),
      hybrid: count(pkgRaw.hybrid),
      legacy: count(pkgRaw.legacy),
    },
  };
}

// ---------------------------------------------------------------------------
// Preço da mensalidade (formulário do admin)
// ---------------------------------------------------------------------------

/** Mesmo teto do CHECK de `platform_plan_prices.amount_cents` (0023). */
export const MAX_PLATFORM_PRICE_CENTS = 10_000_000;

/**
 * "149,90" | "149.90" | "1.234,56" -> centavos. Com vírgula, pontos são milhar. `null` se não for
 * um valor positivo dentro do teto.
 */
export function parseReaisToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(/^R\$\s*/i, "");
  if (!trimmed || !/^[\d.,]+$/.test(trimmed)) return null;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  if ((normalized.match(/\./g) ?? []).length > 1) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  return cents > 0 && cents <= MAX_PLATFORM_PRICE_CENTS ? cents : null;
}

/** `YYYY-MM-DD` válido de calendário, ou `null`. */
export function parseDateOnly(raw: string): string | null {
  const v = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/** Preço vigente numa data: maior `effectiveFrom` <= `today` (mesma regra da RPC). */
export function currentPrice<T extends { effectiveFrom: string }>(rows: T[], today: string): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (r.effectiveFrom <= today && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Eventos de cobrança (rótulos — nunca mostramos o payload)
// ---------------------------------------------------------------------------

const EVENT_LABEL: Record<string, string> = {
  cobranca_paga: "Cobrança paga",
  cobranca_gerada: "Cobrança gerada",
  cobranca_falhou: "Cobrança falhou",
  cobranca_retentativa: "Nova tentativa de cobrança",
  assinatura_criada: "Assinatura criada",
  assinatura_ativada: "Assinatura ativada",
  assinatura_reativada: "Assinatura reativada",
  assinatura_renovada: "Assinatura renovada",
  assinatura_em_atraso: "Assinatura em atraso",
  assinatura_suspensa: "Assinatura suspensa",
  assinatura_cancelada: "Assinatura cancelada",
  plano_alterado: "Plano alterado",
  mandato_ativado: "Pix Automático autorizado",
  mandato_cancelado: "Autorização do Pix Automático cancelada",
  trackly_pix_enroll: "Inscrição no Pix Automático (Trackly)",
  trackly_pix_mandate: "Atualização da autorização Pix (Trackly)",
  trackly_switch_request: "Pedido de troca da forma de pagamento",
  trackly_switch_cancel: "Cancelamento da assinatura anterior (troca)",
};

export function billingEventLabel(event: string): string {
  return EVENT_LABEL[event] ?? event.replace(/_/g, " ");
}

export type EventTone = "success" | "warning" | "danger" | "neutral";

export function billingEventTone(event: string): EventTone {
  if (["cobranca_paga", "assinatura_ativada", "assinatura_reativada", "assinatura_renovada"].includes(event)) {
    return "success";
  }
  if (["assinatura_suspensa", "assinatura_cancelada"].includes(event)) return "danger";
  if (["cobranca_falhou", "cobranca_retentativa", "assinatura_em_atraso"].includes(event)) return "warning";
  return "neutral";
}

/** Tom de cada estado de assinatura (verde = ok, amarelo = atenção, coral = crítico). */
export const BILLING_STATUS_TONE: Record<BillingStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  none: "neutral",
  pending_first_payment: "info",
  active: "success",
  overdue: "warning",
  suspended: "danger",
  cancelled: "danger",
};

/** Rótulos do painel (o "overdue" do coach é "Pagamento pendente"; aqui, "Em atraso"). */
export const ADMIN_BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  none: "Sem assinatura",
  pending_first_payment: "Aguardando 1º pagamento",
  active: "Ativa",
  overdue: "Em atraso",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

export function parseBillingStatusFilter(raw: string | string[] | undefined): BillingStatus | "all" {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (BILLING_STATUSES as readonly string[]).includes(v ?? "") ? (v as BillingStatus) : "all";
}

// ---------------------------------------------------------------------------
// Forma de pagamento — só quando há sinal explícito no log (nada de "deve ser cartão")
// ---------------------------------------------------------------------------

export type KnownMethod = "pix_automatico" | "credit_card";

/**
 * Forma de pagamento de UMA assinatura (token), a partir dos eventos dela (mais recentes
 * primeiro). Só sinais explícitos: inscrição de Pix feita pelo Trackly ou `billing_method`
 * mandado pela SyncPay. Sem sinal -> `null` ("não informado"). O payload é lido só aqui, no
 * servidor, e nunca sai daqui.
 */
export function explicitMethod(events: { event: string; payload: unknown }[]): KnownMethod | null {
  if (events.some((e) => e.event === "trackly_pix_enroll")) return "pix_automatico";
  for (const e of events) {
    const p = asObj(e.payload);
    const m = asObj(p.plan).billing_method ?? p.billing_method;
    if (m === "pix_automatico") return "pix_automatico";
    if (m === "credit_card" || m === "card") return "credit_card";
  }
  return null;
}
