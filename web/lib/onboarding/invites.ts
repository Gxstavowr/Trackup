import "server-only";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/site-url";
import { isEmailRateLimitError, EMAIL_RATE_LIMIT_MESSAGE } from "@/lib/supabase/errors";
import { isDemoAccount } from "@/lib/demo";
import { isBillingPeriod, isMissingTableError } from "./prices";
import { isPackageId, type BillingPeriod, type PackageId } from "./packages";
import { onboardingErrorCode, translateOnboardingError } from "./errors";
import { COACH_STAGE_LABELS, deriveOnboardingStage, type OnboardingStage, type OnboardingStatusRow } from "./stage";

/**
 * Convite do aluno (V5, itens 7–8; plano §8). NÃO é um sistema paralelo: o cadastro continua sendo
 * uma linha em `clients` com `invite_status` (`pending` → `invited` → `active`), o link continua
 * `/convite?id=` (consentimento LGPD + magic link do próprio aluno) e o callback continua sendo
 * `/auth/callback?invite=`. Este módulo só acrescenta:
 *  - criação pelo RPC `create_invited_client` (aluno + contrato inicial + preço padrão opcional);
 *  - envio do link por e-mail a partir do coach, pelo MESMO mecanismo de e-mail do Supabase Auth
 *    (`signInWithOtp`) que `app/convite/actions.ts` já usa;
 *  - trilha `client_onboarding_events` (`invite_sent` / `invite_send_failed` / `invite_link_copied`),
 *    gravada com a sessão do coach (policy estreita da 0022).
 *
 * Tudo com o client do usuário (RLS): um coach nunca lê nem convida aluno de outra conta.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DbError = { code?: string; message?: string } | null | undefined;

/** RPC inexistente (migração 0022 pendente) — PostgREST `PGRST202` / Postgres `42883`. */
function isMissingFunctionError(err: DbError): boolean {
  if (!err) return false;
  return (
    err.code === "PGRST202" ||
    err.code === "42883" ||
    /could not find the function|function .* does not exist/i.test(err.message ?? "")
  );
}

/** Algo da 0022 ainda não existe (função, tabela ou view). */
export function isOnboardingSchemaMissing(err: DbError): boolean {
  return isMissingFunctionError(err) || isMissingTableError(err);
}

/** Domínios reservados (RFC 2606/6761) nunca recebem e-mail: guarda extra para logins demo
 * (`@trackly.test`) mesmo se `accounts.is_demo` ainda não existir (0023 pendente). */
function isReservedEmail(email: string): boolean {
  return /\.(test|example|invalid|localhost)$/i.test(email.trim());
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type ExistingClientRef = {
  id: string;
  name: string;
  inviteStatus: "pending" | "invited" | "active";
};

/** Aluno da conta do coach com este e-mail (comparação sem caixa/espaços, como o índice da 0022). */
export async function findClientByEmail(email: string): Promise<ExistingClientRef | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, invite_status, email")
    .ilike("email", escapeLike(normalized))
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) {
    console.error("Falha ao procurar aluno pelo e-mail:", error.message);
    return null;
  }
  const row = (data ?? []).find((r) => (r.email ?? "").trim().toLowerCase() === normalized) ?? data?.[0];
  return row ? { id: row.id, name: row.name, inviteStatus: row.invite_status } : null;
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export type CreateInvitedClientInput = {
  name: string;
  email: string;
  phone?: string;
  package: PackageId;
  priceCents: number;
  billingPeriod: BillingPeriod;
  /** Grava o valor como padrão do pacote se o coach ainda não tiver um (nunca sobrescreve). */
  saveAsDefault: boolean;
};

export type CreateInvitedClientResult =
  | { ok: true; clientId: string }
  | { ok: false; reason: "duplicate"; error: string; existing: ExistingClientRef | null }
  /** 0022 não aplicada: quem chama cai no fluxo de criação antigo. */
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "error"; error: string };

/** Cria aluno (convite pendente, `onboarding_required`) + contrato inicial numa transação (RPC). */
export async function createInvitedClient(input: CreateInvitedClientInput): Promise<CreateInvitedClientResult> {
  if (!isPackageId(input.package)) return { ok: false, reason: "error", error: "Escolha um pacote válido." };
  if (!isBillingPeriod(input.billingPeriod)) {
    return { ok: false, reason: "error", error: "Escolha um período de cobrança válido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invited_client", {
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone ?? "",
    p_package: input.package,
    p_price_cents: input.priceCents,
    p_billing_period: input.billingPeriod,
    p_save_as_default: input.saveAsDefault,
  });

  if (error) {
    if (isOnboardingSchemaMissing(error)) return { ok: false, reason: "unavailable" };
    // E-mail repetido: código do RPC ou, numa corrida, o índice único `clients_account_email_uidx`.
    if (onboardingErrorCode(error.message ?? "") === "client_email_exists" || error.code === "23505") {
      return {
        ok: false,
        reason: "duplicate",
        error: "Já existe um aluno com esse e-mail.",
        existing: await findClientByEmail(input.email),
      };
    }
    const translated = translateOnboardingError(error.message ?? "");
    if (!translated) console.error("Falha ao criar aluno convidado:", error.code, error.message);
    return { ok: false, reason: "error", error: translated ?? "Não foi possível criar o aluno. Tente novamente." };
  }

  const clientId = typeof data === "string" ? data : null;
  if (!clientId) return { ok: false, reason: "error", error: "Não foi possível criar o aluno. Tente novamente." };
  return { ok: true, clientId };
}

// ---------------------------------------------------------------------------
// Envio do convite
// ---------------------------------------------------------------------------

type InviteClientRow = {
  id: string;
  account_id: string;
  name: string;
  email: string | null;
  invite_status: "pending" | "invited" | "active";
  auth_user_id: string | null;
};

async function loadInviteClient(clientId: string) {
  if (!UUID_RE.test(clientId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("clients")
    .select("id, account_id, name, email, invite_status, auth_user_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!data) return null;
  return { supabase, user, client: data as InviteClientRow };
}

type InviteEvent = "invite_sent" | "invite_send_failed" | "invite_link_copied";

/** Grava um evento de convite como o próprio coach (policy `client_onboarding_events_coach_insert_invite`). */
async function insertInviteEvent(
  ctx: NonNullable<Awaited<ReturnType<typeof loadInviteClient>>>,
  event: InviteEvent,
  extra: { sentTo?: string | null; simulated?: boolean; detail?: Record<string, string | number | boolean | null> } = {}
): Promise<{ ok: boolean; missing: boolean }> {
  const { error } = await ctx.supabase.from("client_onboarding_events").insert({
    account_id: ctx.client.account_id,
    client_id: ctx.client.id,
    event,
    actor: "coach",
    actor_user_id: ctx.user.id,
    sent_to: extra.sentTo ?? null,
    simulated: extra.simulated ?? false,
    detail: extra.detail ?? {},
  });
  if (error) {
    const missing = isMissingTableError(error);
    if (!missing) console.error(`Falha ao registrar o evento ${event}:`, error.message);
    return { ok: false, missing };
  }
  return { ok: true, missing: false };
}

/**
 * A trilha de eventos (0022) existe? `missing` = tabela ausente: o envio por e-mail fica desligado
 * (fluxo antigo, em que o coach marca o envio à mão). Um erro momentâneo é `error`, NUNCA `missing`:
 * senão a tela cairia no "marcar como enviado" sem nenhum e-mail ter saído (item 35).
 */
async function inviteTrailState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string
): Promise<"ok" | "missing" | "error"> {
  const { error } = await supabase.from("client_onboarding_events").select("id").eq("client_id", clientId).limit(1);
  if (!error) return "ok";
  if (isMissingTableError(error)) return "missing";
  console.error("Falha ao consultar eventos do convite:", error.message);
  return "error";
}

export type SendInviteResult =
  | { ok: true; sentTo: string; simulated: boolean }
  | { ok: false; error: string; unavailable?: boolean };

/**
 * Envia (ou reenvia) o link do convite para o e-mail do aluno.
 *
 * Mecanismo: o mesmo e-mail do Supabase Auth que o aluno já recebe ao aceitar em `/convite`
 * (`signInWithOtp`). O link do e-mail leva para `/convite?id=<aluno>`: o aluno passa pelo aceite
 * LGPD de sempre e recebe o magic link no próprio navegador, que volta em `/auth/callback?invite=`.
 * O envio usa um client Supabase avulso, sem cookies: não mexe na sessão do coach nem grava o
 * `code_verifier` do PKCE no navegador dele (o link é aberto em outro aparelho, pelo aluno).
 *
 * Só responde `ok` se o envio deu certo (ou foi simulado em conta demo, com `simulated: true`).
 */
export async function sendInviteEmail(clientId: string): Promise<SendInviteResult> {
  const ctx = await loadInviteClient(clientId);
  if (!ctx) return { ok: false, error: "Aluno não encontrado." };
  const { client, supabase } = ctx;

  if (client.invite_status === "active" || client.auth_user_id) {
    return { ok: false, error: "Esse aluno já ativou a conta. Não é preciso reenviar o convite." };
  }
  const email = client.email?.trim().toLowerCase() ?? "";
  if (!email) return { ok: false, error: "Cadastre o e-mail do aluno antes de enviar o convite." };

  const trail = await inviteTrailState(supabase, client.id);
  if (trail === "error") {
    return { ok: false, error: "Não foi possível preparar o envio do convite agora. Nada foi enviado. Tente novamente." };
  }
  if (trail === "missing") {
    return {
      ok: false,
      unavailable: true,
      error: "O envio do convite por e-mail ainda não está disponível. Copie o link do convite e envie ao aluno.",
    };
  }

  const markInvited = async () => {
    const { error } = await supabase
      .from("clients")
      .update({ invite_status: "invited", invited_at: new Date().toISOString() })
      .eq("id", client.id)
      .neq("invite_status", "active");
    if (error) console.error("Falha ao marcar o convite como enviado:", error.message);
  };

  // Conta demo (ou domínio reservado): nada sai de verdade. Registra como simulado.
  if (isReservedEmail(email) || (await isDemoAccount(client.account_id))) {
    const recorded = await insertInviteEvent(ctx, "invite_sent", { sentTo: email, simulated: true });
    if (!recorded.ok) return { ok: false, error: "Não foi possível registrar o convite. Tente novamente." };
    await markInvited();
    return { ok: true, sentTo: email, simulated: true };
  }

  const origin = await getOrigin();
  const mailer = createSupabaseJsClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await mailer.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/convite?id=${client.id}` },
  });

  if (error) {
    const rateLimited = isEmailRateLimitError(error);
    await insertInviteEvent(ctx, "invite_send_failed", {
      sentTo: email,
      detail: { code: (error as { code?: string }).code ?? (rateLimited ? "rate_limit" : "send_failed"), status: error.status ?? null },
    });
    console.error("Falha ao enviar o convite por e-mail:", error.status, (error as { code?: string }).code);
    return {
      ok: false,
      error: rateLimited
        ? EMAIL_RATE_LIMIT_MESSAGE
        : "Não foi possível enviar o convite por e-mail. Tente reenviar ou copie o link do convite.",
    };
  }

  // O e-mail saiu: o resultado é verdadeiro mesmo se a trilha falhar (só registra no log).
  await insertInviteEvent(ctx, "invite_sent", { sentTo: email });
  await markInvited();
  return { ok: true, sentTo: email, simulated: false };
}

/** Registra que o coach copiou o link `/convite?id=` (best-effort; nunca lança). */
export async function recordInviteLinkCopied(clientId: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await loadInviteClient(clientId);
    if (!ctx || ctx.client.invite_status === "active") return { ok: false };
    const result = await insertInviteEvent(ctx, "invite_link_copied");
    return { ok: result.ok };
  } catch (err) {
    console.error("Falha ao registrar cópia do link do convite:", err);
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Situação do convite
// ---------------------------------------------------------------------------

export type InviteStatusInfo =
  | { available: false }
  | {
      available: true;
      stage: OnboardingStage;
      label: string;
      hasAccount: boolean;
      email: string | null;
      lastSentAt: string | null;
      lastSentTo: string | null;
      lastSentSimulated: boolean;
      lastFailedAt: string | null;
      acceptedAt: string | null;
      /** Ainda sem conta e com e-mail: pode (re)enviar. */
      canResend: boolean;
    };

/** Situação do convite de um aluno da conta (view `client_onboarding_status` + último envio). */
export async function getInviteStatus(clientId: string): Promise<InviteStatusInfo | null> {
  if (!UUID_RE.test(clientId)) return null;
  try {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("client_onboarding_status")
      .select(
        "client_id, invite_status, has_account, onboarding_required, package, questionnaire_status, questionnaire_opened_at, protocol_due_at, training_published, nutrition_published, training_draft, nutrition_draft, invite_last_sent_at, invite_last_failed_at, invite_accepted_at"
      )
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) {
      if (!isOnboardingSchemaMissing(error)) console.error("Falha ao ler a situação do convite:", error.message);
      return { available: false };
    }
    if (!row) return null;

    const [{ data: client }, { data: lastSent }] = await Promise.all([
      supabase.from("clients").select("email").eq("id", clientId).maybeSingle(),
      supabase
        .from("client_onboarding_events")
        .select("sent_to, simulated, occurred_at")
        .eq("client_id", clientId)
        .eq("event", "invite_sent")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const statusRow = row as unknown as OnboardingStatusRow;
    const info = deriveOnboardingStage(statusRow);
    const email = (client?.email as string | null | undefined)?.trim() || null;
    return {
      available: true,
      stage: info.stage,
      label: COACH_STAGE_LABELS[info.stage],
      hasAccount: statusRow.has_account,
      email,
      lastSentAt: (row.invite_last_sent_at as string | null) ?? null,
      lastSentTo: (lastSent?.sent_to as string | null | undefined) ?? null,
      lastSentSimulated: lastSent?.simulated === true,
      lastFailedAt: (row.invite_last_failed_at as string | null) ?? null,
      acceptedAt: (row.invite_accepted_at as string | null) ?? null,
      canResend: !statusRow.has_account && statusRow.invite_status !== "active" && !!email,
    };
  } catch (err) {
    console.error("Falha ao ler a situação do convite:", err);
    return { available: false };
  }
}
