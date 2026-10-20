import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Conta de demonstração (V5, migração 0023: `accounts.is_demo`). Em conta demo nada sai de verdade
 * (e-mail de convite vira `simulated`, checkout bloqueado etc.). A leitura usa a sessão do usuário:
 * o coach só enxerga a própria conta (policy `accounts_coach_read`).
 *
 * Nunca lança. Coluna inexistente (0023 ainda não aplicada), conta não encontrada ou erro de leitura
 * → `false` ("conta real"); quem precisa de proteção extra contra envio real deve combinar com outras
 * guardas (ex.: domínio reservado `.test` em `lib/onboarding/invites.ts`).
 */

function isMissingColumnError(err: { code?: string; message?: string }): boolean {
  return err.code === "42703" || err.code === "PGRST204" || /column .* does not exist|schema cache/i.test(err.message ?? "");
}

export async function isDemoAccount(accountId: string): Promise<boolean> {
  if (!accountId) return false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("accounts").select("is_demo").eq("id", accountId).maybeSingle();
    if (error) {
      if (!isMissingColumnError(error)) console.error("Falha ao ler accounts.is_demo:", error.message);
      return false;
    }
    return (data as { is_demo?: boolean } | null)?.is_demo === true;
  } catch (err) {
    console.error("Falha ao ler accounts.is_demo:", err);
    return false;
  }
}

/** A conta do coach logado é de demonstração? Deduplicado por requisição. */
export const isCurrentCoachDemo = cache(async (): Promise<boolean> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: coach } = await supabase.from("coach_users").select("account_id").eq("id", user.id).maybeSingle();
    if (!coach?.account_id) return false;
    return await isDemoAccount(coach.account_id as string);
  } catch (err) {
    console.error("Falha ao verificar conta demo:", err);
    return false;
  }
});
