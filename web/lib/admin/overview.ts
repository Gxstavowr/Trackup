import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BILLING_STATUSES, type BillingStatus } from "@/lib/billing/state";
import { normalizeOverview, type AdminPeriod, type BusinessOverview } from "@/app/admin/_lib/logic";
import { requireAdmin } from "./auth";

/**
 * Visão de negócio do painel do proprietário (item 22). Toda função começa com `requireAdmin()` e
 * só DEPOIS usa a service role (`createAdminClient`, que nunca sai do servidor). Contas demo
 * (`accounts.is_demo`) ficam fora de todos os números e listas.
 *
 * Falha de leitura (ex.: migração 0023 ainda não aplicada, RPC inexistente) NÃO vira zero: devolve
 * `{ ok: false }` e a tela mostra "dados indisponíveis" — nunca um número inventado.
 */

export type Loaded<T> = { ok: true; data: T; readAt: string } | { ok: false; reason: string };

function fail(where: string, error: { code?: string; message?: string } | null): { ok: false; reason: string } {
  console.error(`[admin] ${where}:`, error?.code, error?.message);
  return { ok: false, reason: where };
}

/** Indicadores agregados (RPC `admin_business_overview`, service role, exclui demo). */
export async function getBusinessOverview(period: AdminPeriod): Promise<Loaded<BusinessOverview>> {
  await requireAdmin();
  const { data, error } = await createAdminClient().rpc("admin_business_overview", {
    p_from: period.from,
    p_to: period.to,
  });
  if (error) return fail("admin_business_overview", error);
  return { ok: true, data: normalizeOverview(data), readAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Contas reais (não demo)
// ---------------------------------------------------------------------------

type AccountRow = { id: string; name: string; createdAt: string };

async function readAccounts(): Promise<{ real: AccountRow[]; demoIds: Set<string> } | null> {
  const { data, error } = await createAdminClient()
    .from("accounts")
    .select("id, name, created_at, is_demo")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error || !data) {
    fail("accounts", error);
    return null;
  }
  const real: AccountRow[] = [];
  const demoIds = new Set<string>();
  for (const r of data) {
    if (r.is_demo) demoIds.add(r.id as string);
    else real.push({ id: r.id as string, name: r.name as string, createdAt: r.created_at as string });
  }
  return { real, demoIds };
}

// ---------------------------------------------------------------------------
// Atividades recentes
// ---------------------------------------------------------------------------

export type ActivityItem =
  | { kind: "billing_event"; id: string; at: string; event: string; accountName: string | null; applied: boolean }
  | { kind: "new_coach"; id: string; at: string; accountName: string }
  | { kind: "new_student"; id: string; at: string; accountName: string }
  | { kind: "price_set"; id: string; at: string; amountCents: number | null; effectiveFrom: string | null };

/**
 * Linha do tempo curta, só com fatos registrados: eventos de cobrança, contas criadas, alunos
 * cadastrados (sem nome do aluno — o proprietário não precisa do dado pessoal) e preço alterado.
 */
export async function getRecentActivity(limit = 12): Promise<Loaded<ActivityItem[]>> {
  await requireAdmin();
  const accounts = await readAccounts();
  if (!accounts) return { ok: false, reason: "accounts" };
  const nameOf = new Map(accounts.real.map((a) => [a.id, a.name]));
  const admin = createAdminClient();

  const [events, clients, audits] = await Promise.all([
    admin
      .from("coach_billing_events")
      .select("id, event, account_id, received_at, occurred_at, processed_at")
      .order("received_at", { ascending: false })
      .limit(40),
    admin.from("clients").select("id, account_id, created_at").order("created_at", { ascending: false }).limit(40),
    admin
      .from("admin_audit_events")
      .select("id, detail, created_at")
      .eq("action", "platform_price_set")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  if (events.error) return fail("coach_billing_events", events.error);
  if (clients.error) return fail("clients", clients.error);

  const items: ActivityItem[] = [];
  for (const e of events.data ?? []) {
    const accountId = e.account_id as string | null;
    if (accountId && accounts.demoIds.has(accountId)) continue;
    items.push({
      kind: "billing_event",
      id: `e-${e.id}`,
      at: (e.occurred_at as string | null) ?? (e.received_at as string),
      event: e.event as string,
      accountName: accountId ? nameOf.get(accountId) ?? null : null,
      applied: e.processed_at !== null,
    });
  }
  for (const a of accounts.real.slice(0, 15)) {
    items.push({ kind: "new_coach", id: `a-${a.id}`, at: a.createdAt, accountName: a.name });
  }
  for (const c of clients.data ?? []) {
    const name = nameOf.get(c.account_id as string);
    if (!name) continue; // conta demo
    items.push({ kind: "new_student", id: `c-${c.id}`, at: c.created_at as string, accountName: name });
  }
  for (const r of audits.data ?? []) {
    const d = (r.detail ?? {}) as Record<string, unknown>;
    items.push({
      kind: "price_set",
      id: `p-${r.id}`,
      at: r.created_at as string,
      amountCents: typeof d.amount_cents === "number" ? d.amount_cents : null,
      effectiveFrom: typeof d.effective_from === "string" ? d.effective_from : null,
    });
  }

  const ts = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? 0 : t;
  };
  items.sort((x, y) => ts(y.at) - ts(x.at));
  return { ok: true, data: items.slice(0, limit), readAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Detalhe: coaches
// ---------------------------------------------------------------------------

export type CoachRow = {
  accountId: string;
  accountName: string;
  coachName: string | null;
  coachEmail: string | null;
  createdAt: string;
  students: number | null;
  billingStatus: BillingStatus;
};

/** Coaches (contas reais) com quantidade de alunos e estado da assinatura do Trackly. */
export async function listCoaches(): Promise<Loaded<CoachRow[]>> {
  await requireAdmin();
  const accounts = await readAccounts();
  if (!accounts) return { ok: false, reason: "accounts" };
  const admin = createAdminClient();
  const ids = accounts.real.map((a) => a.id);
  if (ids.length === 0) return { ok: true, data: [], readAt: new Date().toISOString() };

  const [coaches, subs, counts] = await Promise.all([
    admin.from("coach_users").select("account_id, name, email, created_at").in("account_id", ids),
    admin.from("coach_billing_subscriptions").select("account_id, status").in("account_id", ids),
    // Contagem exata por conta (head: sem trazer linhas) — não esbarra no limite de 1000 linhas.
    Promise.all(
      ids.map((id) =>
        admin.from("clients").select("id", { count: "exact", head: true }).eq("account_id", id)
      )
    ),
  ]);
  if (coaches.error) return fail("coach_users", coaches.error);
  if (subs.error) return fail("coach_billing_subscriptions", subs.error);

  // Dono da conta = primeiro coach cadastrado nela.
  const owner = new Map<string, { name: string; email: string; createdAt: string }>();
  for (const c of coaches.data ?? []) {
    const prev = owner.get(c.account_id as string);
    if (!prev || (c.created_at as string) < prev.createdAt) {
      owner.set(c.account_id as string, {
        name: c.name as string,
        email: c.email as string,
        createdAt: c.created_at as string,
      });
    }
  }
  const statusOf = new Map(
    (subs.data ?? []).map((s) => [
      s.account_id as string,
      (BILLING_STATUSES as readonly string[]).includes(s.status as string) ? (s.status as BillingStatus) : "none",
    ])
  );

  const rows: CoachRow[] = accounts.real.map((a, i) => ({
    accountId: a.id,
    accountName: a.name,
    coachName: owner.get(a.id)?.name ?? null,
    coachEmail: owner.get(a.id)?.email ?? null,
    createdAt: a.createdAt,
    students: counts[i].error ? null : counts[i].count ?? null,
    billingStatus: statusOf.get(a.id) ?? "none",
  }));
  return { ok: true, data: rows, readAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Detalhe: onboarding dos alunos por coach (só contagens, sem nome nem respostas)
// ---------------------------------------------------------------------------

export type OnboardingByCoach = {
  accountId: string;
  accountName: string;
  /** Alunos do fluxo novo (V5, `onboarding_required`). */
  newFlow: number;
  awaitingQuestionnaire: number;
  inPreparation: number;
};

const ONBOARDING_ROW_LIMIT = 1000;

/**
 * Mesmas regras da RPC: aguardando questionário = fluxo novo, com login, sem questionário enviado;
 * em preparação = questionário enviado, protocolo não concluído, com pacote. `partial` = bateu no
 * limite de linhas (a tela avisa em vez de mostrar um total falso).
 */
export async function listOnboardingByCoach(): Promise<Loaded<{ rows: OnboardingByCoach[]; partial: boolean }>> {
  await requireAdmin();
  const accounts = await readAccounts();
  if (!accounts) return { ok: false, reason: "accounts" };
  const nameOf = new Map(accounts.real.map((a) => [a.id, a.name]));

  const { data, error } = await createAdminClient()
    .from("client_onboarding_status")
    .select("account_id, has_account, onboarding_required, package, questionnaire_status, protocol_completed_at")
    .or("onboarding_required.eq.true,questionnaire_status.eq.submitted")
    .limit(ONBOARDING_ROW_LIMIT);
  if (error || !data) return fail("client_onboarding_status", error);

  const byAccount = new Map<string, OnboardingByCoach>();
  for (const r of data) {
    const accountId = r.account_id as string;
    const name = nameOf.get(accountId);
    if (!name) continue; // conta demo
    const row =
      byAccount.get(accountId) ??
      { accountId, accountName: name, newFlow: 0, awaitingQuestionnaire: 0, inPreparation: 0 };
    if (r.onboarding_required) row.newFlow += 1;
    const qs = r.questionnaire_status as string | null;
    if (r.onboarding_required && r.has_account && (qs === null || qs === "draft")) row.awaitingQuestionnaire += 1;
    if (qs === "submitted" && r.protocol_completed_at === null && r.package !== null) row.inPreparation += 1;
    byAccount.set(accountId, row);
  }
  const rows = [...byAccount.values()]
    .filter((r) => r.newFlow + r.awaitingQuestionnaire + r.inPreparation > 0)
    .sort((a, b) => b.awaitingQuestionnaire + b.inPreparation - (a.awaitingQuestionnaire + a.inPreparation));
  return {
    ok: true,
    data: { rows, partial: data.length >= ONBOARDING_ROW_LIMIT },
    readAt: new Date().toISOString(),
  };
}
