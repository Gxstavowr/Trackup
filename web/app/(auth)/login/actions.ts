"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/site-url";
import { resolveHomeForCurrentUser } from "@/lib/auth/resolve-home";
import { isEmailRateLimitError, EMAIL_RATE_LIMIT_MESSAGE } from "@/lib/supabase/errors";

export type LoginState = {
  error?: string;
  success?: boolean;
  message?: string;
} | null;

/**
 * Login do coach (item 2 do TODO): email/senha via `signInWithPassword`. Depois de
 * autenticar, decide o redirecionamento checando qual perfil existe pra esse
 * `auth.uid()` — nunca assume que "logou = é coach": também serve pra um aluno que por
 * engano tentou entrar pela aba errada.
 */
export async function loginCoach(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Preencha e-mail e senha." };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return { error: "E-mail ou senha inválidos." };
  }

  const redirectPath = await resolveHomeForCurrentUser(supabase);
  if (!redirectPath) {
    // Autenticou no Supabase Auth mas não existe `coach_users` nem `clients` pra esse
    // usuário — conta órfã (não devia acontecer no fluxo normal, mas não pode deixar a
    // pessoa "meio logada" sem área nenhuma pra ver).
    await supabase.auth.signOut();
    return {
      error:
        "Essa conta não está vinculada a nenhum perfil de coach ou aluno. Fale com o suporte.",
    };
  }

  redirect(redirectPath);
}

/**
 * Login do aluno em rounds seguintes (item 6, último parágrafo) — mesma tela de login,
 * aba "sou aluno": em vez de senha, manda um magic link (`signInWithOtp`). Cobre tanto o
 * primeiro acesso via convite (ver `app/convite/actions.ts`) quanto qualquer login
 * posterior — o aluno nunca precisa lembrar de uma senha.
 */
export async function loginStudentMagicLink(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  if (!email) {
    return { error: "Informe seu e-mail." };
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/portal`,
    },
  });

  if (error) {
    if (isEmailRateLimitError(error)) {
      return { error: EMAIL_RATE_LIMIT_MESSAGE };
    }
    return { error: "Não foi possível enviar o link. Tente novamente." };
  }

  return {
    success: true,
    message: "Enviamos um link de acesso para o seu e-mail.",
  };
}
