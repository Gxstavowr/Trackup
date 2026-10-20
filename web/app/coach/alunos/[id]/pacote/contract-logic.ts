/**
 * Lógica pura da tela "Pacote do aluno" (V5, item 14) — sem I/O, testável com `node --test`.
 * Espelha as regras da 0022 (`client_current_contract_id`, `change_client_contract`) só para dar
 * a mensagem certa ANTES de chamar o banco; quem garante as regras continua sendo o banco.
 */
import { isPackageId, modulesOf, type BillingPeriod, type ModuleId, type PackageId } from "@/lib/onboarding/packages";

export const BILLING_PERIODS: readonly BillingPeriod[] = ["monthly", "quarterly", "semiannual", "annual"];
export const REASON_MAX = 500;
const MAX_PRICE_CENTS = 10_000_000;

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return typeof value === "string" && (BILLING_PERIODS as readonly string[]).includes(value);
}

/** O mínimo de um contrato que a derivação precisa. */
export type ContractLike = {
  id: string;
  effectiveFrom: string;
  createdAt: string;
  voidedAt: string | null;
};

/** `YYYY-MM-DD` + n dias (UTC, sem fuso: é data de calendário). */
export function addDaysToDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Contrato vigente = não anulado com o maior `effective_from` ≤ hoje (desempate: mais recente).
 * Mudança agendada = não anulada com `effective_from` > hoje (o banco permite no máximo uma).
 */
export function deriveContractState<T extends ContractLike>(
  contracts: readonly T[],
  today: string
): { current: T | null; scheduled: T | null } {
  const active = contracts.filter((c) => c.voidedAt === null);
  const byNewest = (a: T, b: T) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt);
  const current = active.filter((c) => c.effectiveFrom <= today).sort(byNewest)[0] ?? null;
  const scheduled =
    active
      .filter((c) => c.effectiveFrom > today)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] ?? null;
  return { current, scheduled };
}

/**
 * Primeira data de vigência aceita para uma mudança: hoje, ou amanhã se o contrato vigente começou
 * hoje (o banco recusa dois contratos no mesmo dia — `trackly:same_day_change`).
 */
export function minEffectiveDate(current: { effectiveFrom: string } | null, today: string): string {
  return current && current.effectiveFrom >= today ? addDaysToDate(today, 1) : today;
}

/**
 * Módulos com plano publicado que deixam de aparecer para o aluno se ele passar a ter o pacote
 * `pkg` (ex.: pacote Treino com dieta publicada → Nutrição). Lista vazia = nada some.
 */
export function modulesHiddenBy(pkg: PackageId, published: Readonly<Record<ModuleId, boolean>>): ModuleId[] {
  const included = modulesOf(pkg);
  return (Object.keys(published) as ModuleId[]).filter((m) => published[m] && !included.includes(m));
}

/**
 * Módulos que saem do pacote numa mudança (estavam no anterior e não estão no novo). Para avisar
 * que, a partir da vigência, o aluno deixa de ver aquele módulo.
 */
export function modulesRemovedByChange(from: PackageId, to: PackageId): ModuleId[] {
  const next = modulesOf(to);
  return modulesOf(from).filter((m) => !next.includes(m));
}

/**
 * `"150,00"`, `"1.234,56"`, `"150.5"`, `"0"` → centavos. Aceita zero (cortesia, permitido pela
 * 0022). `null` se não der para interpretar ou passar do limite do banco.
 */
export function parsePriceToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(/^R\$\s*/i, "");
  if (!trimmed) return null;
  if (!/^[\d.,]+$/.test(trimmed)) return null;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  if ((normalized.match(/\./g) ?? []).length > 1) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  const cents = Math.round(n * 100);
  return cents > MAX_PRICE_CENTS ? null : cents;
}

/** Centavos → texto editável no campo ("249,90"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type InitialInput = { package: PackageId; priceCents: number; billingPeriod: BillingPeriod };
export type ChangeInput = InitialInput & {
  effectiveFrom: string;
  reason: string | null;
  agreedWithClient: boolean;
  requireClientConfirmation: boolean;
};

type Raw = Record<string, string | boolean | null | undefined>;
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: Raw[string]) => (typeof v === "string" ? v : "");

/** Valida pacote, valor e período (comum à definição inicial e à mudança). */
export function validateInitialInput(raw: Raw): Result<InitialInput> {
  const pkg = str(raw.package);
  if (!isPackageId(pkg)) return { ok: false, error: "Escolha o pacote: Treino, Nutrição ou Híbrido." };
  const period = str(raw.billingPeriod);
  if (!isBillingPeriod(period)) return { ok: false, error: "Escolha o período de cobrança." };
  const priceCents = parsePriceToCents(str(raw.price));
  if (priceCents == null) return { ok: false, error: "Informe um valor válido (ex.: 249,90). Use 0 para cortesia." };
  return { ok: true, value: { package: pkg, priceCents, billingPeriod: period } };
}

/**
 * Valida a mudança contra o contrato vigente. `today` em São Paulo. As mesmas regras do banco:
 * vigência não retroativa nem no dia de início do vigente, algo precisa mudar, motivo ≤ 500.
 */
export function validateChangeInput(
  raw: Raw,
  current: { package: PackageId; priceCents: number; billingPeriod: BillingPeriod; effectiveFrom: string } | null,
  today: string
): Result<ChangeInput> {
  if (!current) return { ok: false, error: "Este aluno ainda não tem um pacote definido." };
  const base = validateInitialInput(raw);
  if (!base.ok) return base;

  const effectiveFrom = str(raw.effectiveFrom);
  if (!DATE_RE.test(effectiveFrom) || Number.isNaN(Date.parse(`${effectiveFrom}T00:00:00Z`))) {
    return { ok: false, error: "Informe a data de vigência." };
  }
  const min = minEffectiveDate(current, today);
  if (effectiveFrom < today) return { ok: false, error: "A mudança não pode começar numa data passada." };
  if (effectiveFrom < min) {
    return { ok: false, error: "O pacote atual começou hoje. Agende a mudança a partir de amanhã." };
  }

  const v = base.value;
  if (v.package === current.package && v.priceCents === current.priceCents && v.billingPeriod === current.billingPeriod) {
    return { ok: false, error: "Nada mudou: o pacote, o valor e o período são iguais aos atuais." };
  }

  const reason = str(raw.reason).trim();
  if (reason.length > REASON_MAX) return { ok: false, error: `O motivo pode ter no máximo ${REASON_MAX} caracteres.` };

  return {
    ok: true,
    value: {
      ...v,
      effectiveFrom,
      reason: reason || null,
      agreedWithClient: raw.agreedWithClient === true || raw.agreedWithClient === "on",
      requireClientConfirmation: raw.requireClientConfirmation === true || raw.requireClientConfirmation === "on",
    },
  };
}
