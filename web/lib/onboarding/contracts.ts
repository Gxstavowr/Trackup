import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/repository";
import { onboardingActionError } from "./errors";
import { isPackageId, packageLabel, type BillingPeriod, type ModuleId, type PackageId } from "./packages";

/**
 * Contrato do aluno (V5, item 14 — plano de dados §3.3 e §6). Leitura e escrita do pacote e do
 * valor contratado. O contrato é APPEND-ONLY: toda escrita passa pelas RPCs `security definer` da
 * migração 0022, que checam a posse (coach da conta / o próprio aluno). Este módulo só monta a
 * chamada e traduz os erros `trackly:*` (`onboardingActionError`).
 *
 * Nada aqui toca `subscriptions`/`payments` (controle financeiro manual do coach) nem
 * `coach_billing_*` (mensalidade do coach ao Trackly).
 *
 * Degrada sem quebrar: com a 0022 ainda não aplicada, as leituras devolvem `available: false` e as
 * escritas devolvem uma mensagem amigável, em vez de derrubar a tela.
 */

export type ContractKind = "initial" | "change";
export type ClientConfirmation = "not_required" | "pending" | "confirmed" | "declined";

export type ClientContract = {
  id: string;
  kind: ContractKind;
  package: PackageId;
  priceCents: number;
  billingPeriod: BillingPeriod;
  priceSource: "coach_default" | "custom";
  effectiveFrom: string;
  previousPackage: PackageId | null;
  previousPriceCents: number | null;
  previousBillingPeriod: BillingPeriod | null;
  changeReason: string | null;
  agreedWithClient: boolean;
  clientConfirmation: ClientConfirmation;
  clientRespondedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

export type ServicePriceDefault = { priceCents: number; billingPeriod: BillingPeriod };

/** Resultado padrão das escritas: nunca lança para a tela. */
export type ContractWriteResult = { ok: true; id?: string } | { ok: false; error: string };

const UNAVAILABLE_MESSAGE =
  "O registro de pacotes ainda não está disponível neste ambiente. Tente de novo mais tarde.";

/** Tabela/função da 0022 ainda não aplicada (PostgREST PGRST205/PGRST202, Postgres 42P01/42883). */
function isMissingSchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "PGRST202" ||
    error.code === "42P01" ||
    error.code === "42883" ||
    /does not exist|schema cache|could not find the function/i.test(error.message ?? "")
  );
}

function rpcFailure(error: { code?: string; message?: string }, fallback: string): ContractWriteResult {
  if (isMissingSchemaError(error)) return { ok: false, error: UNAVAILABLE_MESSAGE };
  return { ok: false, error: onboardingActionError(new Error(error.message ?? ""), fallback) };
}

const CONTRACT_COLUMNS =
  "id, kind, package, price_cents, billing_period, price_source, effective_from, previous_package, " +
  "previous_price_cents, previous_billing_period, change_reason, agreed_with_client, client_confirmation, " +
  "client_responded_at, voided_at, void_reason, created_at";

type ContractDbRow = {
  id: string;
  kind: ContractKind;
  package: string;
  price_cents: number;
  billing_period: BillingPeriod;
  price_source: "coach_default" | "custom";
  effective_from: string;
  previous_package: string | null;
  previous_price_cents: number | null;
  previous_billing_period: BillingPeriod | null;
  change_reason: string | null;
  agreed_with_client: boolean;
  client_confirmation: ClientConfirmation;
  client_responded_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};

function mapContract(row: ContractDbRow): ClientContract | null {
  if (!isPackageId(row.package)) return null;
  return {
    id: row.id,
    kind: row.kind,
    package: row.package,
    priceCents: row.price_cents,
    billingPeriod: row.billing_period,
    priceSource: row.price_source,
    effectiveFrom: row.effective_from,
    previousPackage: isPackageId(row.previous_package) ? row.previous_package : null,
    previousPriceCents: row.previous_price_cents,
    previousBillingPeriod: row.previous_billing_period,
    changeReason: row.change_reason,
    agreedWithClient: row.agreed_with_client,
    clientConfirmation: row.client_confirmation,
    clientRespondedAt: row.client_responded_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------------------------
// Coach — leitura
// ---------------------------------------------------------------------------------------------

/**
 * Todos os contratos do aluno (inclusive anulados), do mais recente para o mais antigo. A RLS
 * (`client_service_contracts_coach_read`) só devolve linhas de alunos da conta do coach.
 * `available: false` = migração 0022 ainda não aplicada.
 */
export async function getClientContracts(
  clientId: string
): Promise<{ available: boolean; contracts: ClientContract[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_service_contracts")
    .select(CONTRACT_COLUMNS)
    .eq("client_id", clientId)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingSchemaError(error)) return { available: false, contracts: [] };
    console.error("getClientContracts falhou:", error.code, error.message);
    throw new Error("Não foi possível carregar o pacote do aluno.");
  }

  const contracts = ((data ?? []) as unknown as ContractDbRow[])
    .map(mapContract)
    .filter((c): c is ClientContract => c !== null);
  return { available: true, contracts };
}

/**
 * Módulos com plano PUBLICADO E ATIVO (não rascunho, não arquivado, não template). Serve para
 * avisar o coach, antes de definir o pacote de um aluno legado, que um módulo já publicado vai
 * deixar de aparecer para o aluno.
 */
export async function getPublishedModules(clientId: string): Promise<Record<ModuleId, boolean>> {
  const supabase = await createClient();
  const check = async (table: "workout_plans" | "nutrition_plans") => {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("client_id", clientId)
      .eq("is_template", false)
      .eq("is_draft", false)
      .is("archived_at", null)
      .limit(1);
    if (error) {
      console.error(`getPublishedModules(${table}) falhou:`, error.code, error.message);
      return false;
    }
    return (data ?? []).length > 0;
  };
  const [training, nutrition] = await Promise.all([check("workout_plans"), check("nutrition_plans")]);
  return { training, nutrition };
}

// ---------------------------------------------------------------------------------------------
// Coach — escrita (RPCs da 0022)
// ---------------------------------------------------------------------------------------------

/** Aluno legado (sem contrato) ganha o primeiro pacote, vigente hoje. RPC `set_initial_client_contract`. */
export async function setInitialContract(input: {
  clientId: string;
  package: PackageId;
  priceCents: number;
  billingPeriod: BillingPeriod;
}): Promise<ContractWriteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_initial_client_contract", {
    p_client_id: input.clientId,
    p_package: input.package,
    p_price_cents: input.priceCents,
    p_billing_period: input.billingPeriod,
  });
  if (error) {
    console.error("set_initial_client_contract falhou:", error.code, error.message);
    return rpcFailure(error, "Não foi possível definir o pacote do aluno.");
  }
  return { ok: true, id: typeof data === "string" ? data : undefined };
}

/**
 * Mudança EXPLÍCITA de pacote/valor (RPC `change_client_contract`). O banco recusa mudança
 * retroativa, sem diferença, dupla agendada e no mesmo dia de um contrato iniciado hoje. Com
 * `requireClientConfirmation`, o aluno recebe um aviso no app para confirmar ou recusar — a
 * resposta fica registrada, mas não segura a vigência (decisão adotada, plano §11.4).
 */
export async function changeContract(input: {
  clientId: string;
  package: PackageId;
  priceCents: number;
  billingPeriod: BillingPeriod;
  effectiveFrom: string;
  reason: string | null;
  agreedWithClient: boolean;
  requireClientConfirmation: boolean;
}): Promise<ContractWriteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_client_contract", {
    p_client_id: input.clientId,
    p_package: input.package,
    p_price_cents: input.priceCents,
    p_billing_period: input.billingPeriod,
    p_effective_from: input.effectiveFrom,
    p_reason: input.reason ?? "",
    p_agreed_with_client: input.agreedWithClient,
    p_require_client_confirmation: input.requireClientConfirmation,
  });
  if (error) {
    console.error("change_client_contract falhou:", error.code, error.message);
    return rpcFailure(error, "Não foi possível registrar a mudança de pacote.");
  }

  if (input.requireClientConfirmation) {
    // Best-effort: a mudança já está gravada; o aviso só leva o aluno até o cartão em Minha conta.
    try {
      await createNotification(input.clientId, {
        event_type: "package_changed",
        recipient: "client",
        message: `Seu coach registrou uma mudança no seu pacote (${packageLabel(input.package)}). Confira e confirme em Minha conta.`,
      });
    } catch (err) {
      console.error("Aviso de mudança de pacote ao aluno falhou:", err);
    }
  }
  return { ok: true, id: typeof data === "string" ? data : undefined };
}

/** Anula uma mudança AINDA NÃO VIGENTE (RPC `void_scheduled_contract_change`). */
export async function voidScheduledChange(input: {
  contractId: string;
  reason: string | null;
}): Promise<ContractWriteResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_scheduled_contract_change", {
    p_contract_id: input.contractId,
    p_reason: input.reason ?? "",
  });
  if (error) {
    console.error("void_scheduled_contract_change falhou:", error.code, error.message);
    return rpcFailure(error, "Não foi possível anular a mudança agendada.");
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Aluno (RPCs derivam o aluno de auth.uid(); nenhum id de aluno vem do app)
// ---------------------------------------------------------------------------------------------

export type MyPackageEntry = {
  contractId: string;
  package: PackageId;
  priceCents: number;
  billingPeriod: BillingPeriod;
  effectiveFrom: string;
  isCurrent: boolean;
  clientConfirmation: ClientConfirmation;
};

export type MyServicePackage = {
  /** `false` = migração 0022 ainda não aplicada (ou falha de leitura): a tela não mostra a seção. */
  available: boolean;
  current: MyPackageEntry | null;
  /** Mudanças futuras e/ou aguardando a resposta do aluno (sem motivo interno nem autor). */
  upcoming: MyPackageEntry[];
};

/** Pacote vigente do aluno logado + mudanças futuras/pendentes. RPC `get_my_service_package`. */
export async function getMyServicePackage(): Promise<MyServicePackage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_service_package");
  if (error) {
    if (!isMissingSchemaError(error)) console.error("get_my_service_package falhou:", error.code, error.message);
    return { available: false, current: null, upcoming: [] };
  }

  const entries: MyPackageEntry[] = [];
  for (const row of (data ?? []) as {
    contract_id: string;
    package: string;
    price_cents: number;
    billing_period: BillingPeriod;
    effective_from: string;
    is_current: boolean | null;
    client_confirmation: ClientConfirmation;
  }[]) {
    if (!isPackageId(row.package)) continue;
    entries.push({
      contractId: row.contract_id,
      package: row.package,
      priceCents: row.price_cents,
      billingPeriod: row.billing_period,
      effectiveFrom: row.effective_from,
      isCurrent: row.is_current === true,
      clientConfirmation: row.client_confirmation,
    });
  }
  return {
    available: true,
    current: entries.find((e) => e.isCurrent) ?? null,
    upcoming: entries.filter((e) => !e.isCurrent),
  };
}

/** Aluno confirma ou recusa uma mudança `pending`. Recusar não anula: o coach decide. */
export async function respondToContractChange(input: {
  contractId: string;
  accept: boolean;
}): Promise<ContractWriteResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_contract_change", {
    p_contract_id: input.contractId,
    p_accept: input.accept,
  });
  if (error) {
    console.error("respond_to_contract_change falhou:", error.code, error.message);
    return rpcFailure(error, "Não foi possível registrar sua resposta. Tente de novo.");
  }
  return { ok: true };
}
