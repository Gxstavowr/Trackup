import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BILLING_STATUSES, type BillingStatus } from "@/lib/billing/state";
import { explicitMethod, type KnownMethod } from "@/app/admin/_lib/logic";
import { requireAdmin } from "./auth";
import type { Loaded } from "./overview";

/**
 * Assinaturas do coach com o Trackly (itens 23–24) — SÓ leitura de `coach_billing_subscriptions` e
 * `coach_billing_events` (0021), que o webhook/telas da SyncPay já mantêm. Nenhuma rotina de
 * cobrança é chamada ou duplicada aqui.
 *
 * O que NUNCA sai deste arquivo: payload cru dos eventos, token da assinatura, CPF/CNPJ e e-mail do
 * assinante na SyncPay. O payload só é lido (no servidor) para identificar a forma de pagamento
 * quando há sinal explícito; a tela recebe só o rótulo. Contas demo ficam fora.
 */

function fail(where: string, error: { code?: string; message?: string } | null): { ok: false; reason: string } {
  console.error(`[admin] ${where}:`, error?.code, error?.message);
  return { ok: false, reason: where };
}

async function accountsMap(): Promise<{ names: Map<string, string>; demoIds: Set<string> } | null> {
  const { data, error } = await createAdminClient().from("accounts").select("id, name, is_demo").limit(1000);
  if (error || !data) {
    fail("accounts", error);
    return null;
  }
  const names = new Map<string, string>();
  const demoIds = new Set<string>();
  for (const a of data) {
    if (a.is_demo) demoIds.add(a.id as string);
    else names.set(a.id as string, a.name as string);
  }
  return { names, demoIds };
}

// ---------------------------------------------------------------------------
// Assinaturas
// ---------------------------------------------------------------------------

export type AdminSubscription = {
  accountId: string;
  accountName: string;
  coachName: string | null;
  status: BillingStatus;
  /** Só quando confiável (assinatura ativa ou em atraso, com data registrada). */
  nextChargeAt: string | null;
  paymentFailedAt: string | null;
  /** `null` = a forma não está registrada de forma explícita ("não informado"). */
  method: KnownMethod | null;
  updatedAt: string;
};

export type SubscriptionList = {
  rows: AdminSubscription[];
  countsByStatus: Record<BillingStatus, number>;
  /** Contas reais sem nenhuma linha de assinatura (equivale a "sem assinatura"). */
  accountsWithoutRow: number;
  lastUpdate: string | null;
};

const METHOD_EVENTS = [
  "trackly_pix_enroll",
  "cobranca_paga",
  "assinatura_criada",
  "assinatura_ativada",
  "assinatura_reativada",
  "assinatura_renovada",
];

export async function listSubscriptions(): Promise<Loaded<SubscriptionList>> {
  await requireAdmin();
  const accounts = await accountsMap();
  if (!accounts) return { ok: false, reason: "accounts" };
  const admin = createAdminClient();

  const { data: subs, error } = await admin
    .from("coach_billing_subscriptions")
    .select("account_id, status, next_charge_at, payment_failed_at, updated_at, syncpay_subscription_token")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error || !subs) return fail("coach_billing_subscriptions", error);

  const real = subs.filter((s) => accounts.names.has(s.account_id as string));
  const ids = real.map((s) => s.account_id as string);
  const tokens = real.map((s) => s.syncpay_subscription_token as string | null).filter((t): t is string => !!t);

  const [coaches, events] = await Promise.all([
    ids.length
      ? admin.from("coach_users").select("account_id, name, created_at").in("account_id", ids)
      : Promise.resolve({ data: [], error: null }),
    tokens.length
      ? admin
          .from("coach_billing_events")
          .select("event, subscription_token, payload")
          .in("subscription_token", tokens)
          .in("event", METHOD_EVENTS)
          .order("received_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const owner = new Map<string, { name: string; at: string }>();
  for (const c of coaches.data ?? []) {
    const prev = owner.get(c.account_id as string);
    if (!prev || (c.created_at as string) < prev.at) owner.set(c.account_id as string, { name: c.name as string, at: c.created_at as string });
  }
  // Payload lido aqui e descartado: só o rótulo da forma de pagamento segue para a tela.
  const eventsByToken = new Map<string, { event: string; payload: unknown }[]>();
  for (const e of events.data ?? []) {
    const t = e.subscription_token as string;
    const list = eventsByToken.get(t) ?? [];
    list.push({ event: e.event as string, payload: e.payload });
    eventsByToken.set(t, list);
  }

  const countsByStatus = Object.fromEntries(BILLING_STATUSES.map((s) => [s, 0])) as Record<BillingStatus, number>;
  let lastUpdate: string | null = null;
  const rows: AdminSubscription[] = real.map((s) => {
    const status = (BILLING_STATUSES as readonly string[]).includes(s.status as string)
      ? (s.status as BillingStatus)
      : "none";
    countsByStatus[status] += 1;
    const updatedAt = s.updated_at as string;
    if (!lastUpdate || updatedAt > lastUpdate) lastUpdate = updatedAt;
    const token = s.syncpay_subscription_token as string | null;
    const reliableNext = status === "active" || status === "overdue";
    return {
      accountId: s.account_id as string,
      accountName: accounts.names.get(s.account_id as string) ?? "—",
      coachName: owner.get(s.account_id as string)?.name ?? null,
      status,
      nextChargeAt: reliableNext ? ((s.next_charge_at as string | null) ?? null) : null,
      paymentFailedAt: (s.payment_failed_at as string | null) ?? null,
      method: token ? explicitMethod(eventsByToken.get(token) ?? []) : null,
      updatedAt,
    };
  });

  const accountsWithoutRow = [...accounts.names.keys()].filter((id) => !ids.includes(id)).length;
  return {
    ok: true,
    data: { rows, countsByStatus, accountsWithoutRow, lastUpdate },
    readAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Eventos recentes (sem payload)
// ---------------------------------------------------------------------------

export type AdminBillingEvent = {
  id: string;
  event: string;
  accountName: string | null;
  occurredAt: string | null;
  receivedAt: string;
  /** Status aplicado veio da API da SyncPay (não só do corpo do webhook). */
  verified: boolean;
  /** Aplicado à assinatura (`processed_at` preenchido). */
  applied: boolean;
};

export async function listRecentBillingEvents(limit = 20): Promise<Loaded<AdminBillingEvent[]>> {
  await requireAdmin();
  const accounts = await accountsMap();
  if (!accounts) return { ok: false, reason: "accounts" };
  const { data, error } = await createAdminClient()
    .from("coach_billing_events")
    // Colunas explícitas: `payload` e `subscription_token` nunca são selecionados aqui.
    .select("id, event, account_id, occurred_at, received_at, verified, processed_at")
    .order("received_at", { ascending: false })
    .limit(limit * 2);
  if (error || !data) return fail("coach_billing_events", error);

  const rows = data
    .filter((e) => !e.account_id || !accounts.demoIds.has(e.account_id as string))
    .slice(0, limit)
    .map((e) => ({
      id: e.id as string,
      event: e.event as string,
      accountName: e.account_id ? accounts.names.get(e.account_id as string) ?? null : null,
      occurredAt: (e.occurred_at as string | null) ?? null,
      receivedAt: e.received_at as string,
      verified: !!e.verified,
      applied: e.processed_at !== null,
    }));
  return { ok: true, data: rows, readAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Preço da mensalidade do Trackly (`platform_plan_prices`, só service role)
// ---------------------------------------------------------------------------

export type PlatformPrice = {
  id: string;
  amountCents: number;
  effectiveFrom: string;
  note: string | null;
  createdAt: string;
};

export async function listPlatformPrices(): Promise<Loaded<PlatformPrice[]>> {
  await requireAdmin();
  const { data, error } = await createAdminClient()
    .from("platform_plan_prices")
    .select("id, amount_cents, effective_from, note, created_at")
    .eq("plan_code", "coach_monthly")
    .order("effective_from", { ascending: false })
    .limit(50);
  if (error || !data) return fail("platform_plan_prices", error);
  return {
    ok: true,
    data: data.map((r) => ({
      id: r.id as string,
      amountCents: r.amount_cents as number,
      effectiveFrom: r.effective_from as string,
      note: (r.note as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
    readAt: new Date().toISOString(),
  };
}

export type InsertPriceResult = { ok: true; id: string } | { ok: false; code: "duplicate" | "error" };

/**
 * Registra um NOVO preço com vigência (append-only: preço antigo nunca é sobrescrito, o histórico
 * fica). Os valores já chegam validados pela Server Action; o banco revalida pelos CHECKs.
 */
export async function insertPlatformPrice(input: {
  amountCents: number;
  effectiveFrom: string;
  note: string | null;
}): Promise<InsertPriceResult> {
  const { user } = await requireAdmin();
  const { data, error } = await createAdminClient()
    .from("platform_plan_prices")
    .insert({
      plan_code: "coach_monthly",
      amount_cents: input.amountCents,
      currency: "BRL",
      effective_from: input.effectiveFrom,
      note: input.note,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, code: "duplicate" };
    console.error("[admin] falha ao gravar preço:", error?.code, error?.message);
    return { ok: false, code: "error" };
  }
  return { ok: true, id: data.id as string };
}
