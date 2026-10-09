"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveHomeForCurrentUser } from "@/lib/auth/resolve-home";
import { getMissingConsents, recordConsent } from "@/lib/legal/consent";

export type ConsentState = { error?: string } | null;

/**
 * Grava o aceite das finalidades pendentes. Recalcula as pendências no servidor (nunca confia na
 * lista que veio do form) e exige a caixa marcada de CADA uma — consentimento é manifestação
 * livre e inequívoca (art. 5º, XII), então nada vem pré-marcado e nada é aceito "em bloco".
 */
export async function acceptConsents(
  _prev: ConsentState,
  formData: FormData
): Promise<ConsentState> {
  const supabase = await createClient();
  const home = await resolveHomeForCurrentUser(supabase);
  if (!home) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = home === "/coach" ? "coach" : "client";
  const missing = await getMissingConsents(supabase, user!.id, role);

  if (missing.some((purpose) => formData.get(purpose) !== "on")) {
    return { error: "Para continuar, marque todas as confirmações." };
  }

  try {
    await recordConsent(supabase, missing, "granted");
  } catch (err) {
    console.error(err);
    return { error: "Não foi possível registrar seu aceite. Tente novamente." };
  }

  redirect(home);
}
