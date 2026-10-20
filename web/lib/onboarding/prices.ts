import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PACKAGE_IDS, type BillingPeriod, type PackageId } from "./packages";

/**
 * Preço PADRÃO do coach por pacote (tabela `coach_service_prices`, migração 0022). Tudo passa pelo
 * client do usuário: a RLS (`account_id = current_account_id()`) é quem garante o isolamento.
 * Mudar o padrão NÃO altera contratos de alunos já criados (cada contrato guarda o próprio valor).
 */

export type CoachServicePrice = {
  package: PackageId;
  priceCents: number;
  billingPeriod: BillingPeriod;
  updatedAt: string;
};

export type CoachServicePrices = {
  /** Um item por pacote já configurado. */
  prices: Partial<Record<PackageId, CoachServicePrice>>;
  /** `false` = tabela ainda não existe no banco (migração 0022 não aplicada) ou a leitura falhou. */
  available: boolean;
};

const PERIODS: readonly BillingPeriod[] = ["monthly", "quarterly", "semiannual", "annual"];
const MAX_CENTS = 10_000_000;

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

/** "1.250,50" / "250" / "250,5" → centavos; inválido → null. Aceita só números no formato pt-BR. */
export function parsePriceToCents(input: string): number | null {
  const s = input.replace(/\s|R\$/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.replace(/\./g, "").split(",");
  const cents = Number(int) * 100 + Number(dec.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_CENTS ? cents : null;
}

/** Erro de "tabela inexistente" (migração pendente) do Postgres/PostgREST. */
export function isMissingTableError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    /does not exist|schema cache|could not find the table/i.test(err.message ?? "")
  );
}

/** Preços padrão da conta do coach logado. Nunca lança: falha → `available: false`. */
export async function getCoachServicePrices(): Promise<CoachServicePrices> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coach_service_prices")
      .select("package, price_cents, billing_period, updated_at");
    if (error) {
      if (!isMissingTableError(error)) console.error("Falha ao ler preços padrão:", error.message);
      return { prices: {}, available: false };
    }
    const prices: Partial<Record<PackageId, CoachServicePrice>> = {};
    for (const row of data ?? []) {
      if (!(PACKAGE_IDS as readonly string[]).includes(row.package) || !isBillingPeriod(row.billing_period)) continue;
      prices[row.package as PackageId] = {
        package: row.package as PackageId,
        priceCents: row.price_cents,
        billingPeriod: row.billing_period,
        updatedAt: row.updated_at,
      };
    }
    return { prices, available: true };
  } catch (err) {
    console.error("Falha ao ler preços padrão:", err);
    return { prices: {}, available: false };
  }
}

export type UpsertPriceResult = { ok: true } | { ok: false; error: string; unavailable?: boolean };

/** Define/altera o preço padrão de um pacote para a conta do coach logado (RLS do usuário). */
export async function upsertCoachServicePrice(input: {
  package: PackageId;
  priceCents: number;
  billingPeriod: BillingPeriod;
}): Promise<UpsertPriceResult> {
  if (!(PACKAGE_IDS as readonly string[]).includes(input.package)) return { ok: false, error: "Pacote inválido." };
  if (!isBillingPeriod(input.billingPeriod)) return { ok: false, error: "Período de cobrança inválido." };
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0 || input.priceCents > MAX_CENTS) {
    return { ok: false, error: "Informe um valor maior que zero e até R$ 100.000,00." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const { data: own, error: ownError } = await supabase
    .from("coach_users")
    .select("account_id")
    .eq("id", user.id)
    .maybeSingle();
  if (ownError || !own) return { ok: false, error: "Não foi possível confirmar sua conta." };

  const { error } = await supabase.from("coach_service_prices").upsert(
    {
      account_id: own.account_id,
      package: input.package,
      price_cents: input.priceCents,
      billing_period: input.billingPeriod,
      updated_by: user.id,
    },
    { onConflict: "account_id,package" }
  );
  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, unavailable: true, error: "Os preços padrão ainda não estão disponíveis. Tente mais tarde." };
    }
    console.error("Falha ao salvar preço padrão:", error.message);
    return { ok: false, error: "Não foi possível salvar o preço. Tente novamente." };
  }
  return { ok: true };
}
