"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/site-url";

export type ForgotPasswordState = {
  success?: boolean;
  message?: string;
  error?: string;
} | null;

/**
 * Item 4 do TODO — pedido de reset de senha. `redirectTo` aponta pro Route Handler de
 * callback (`/auth/callback`), que troca o código PKCE por sessão e só então manda pra
 * `/redefinir-senha` — mesmo mecanismo usado pelo magic link do aluno, um único ponto
 * (`app/auth/callback/route.ts`) resolve "código de e-mail -> sessão" pros dois fluxos.
 *
 * Sempre devolve a mesma mensagem de sucesso, exista ou não esse e-mail na base — evita
 * confirmar pra quem está tentando adivinhar e-mails cadastrados que um e-mail existe.
 */
export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") || "").trim();
  if (!email) {
    return { error: "Informe seu e-mail." };
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/redefinir-senha`,
  });

  return {
    success: true,
    message:
      "Se esse e-mail estiver cadastrado, você vai receber um link para redefinir sua senha.",
  };
}
