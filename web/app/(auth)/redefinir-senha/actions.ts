"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveHomeForCurrentUser } from "@/lib/auth/resolve-home";

export type UpdatePasswordState = {
  error?: string;
} | null;

/**
 * Segunda metade do item 4 — chamada depois que `/auth/callback` já trocou o código do
 * link de e-mail por uma sessão de verdade (por isso não precisa de senha atual: a
 * própria sessão recém-criada pela troca do código já prova posse do e-mail).
 * `supabase.auth.updateUser({ password })` exige uma sessão ativa — se não houver
 * (link expirado, ou a pessoa abriu a página direto sem clicar no e-mail), devolve erro
 * antes de tentar.
 */
export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") || "");
  if (password.length < 8) {
    return { error: "A senha precisa ter pelo menos 8 caracteres." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "Sua sessão de redefinição expirou. Peça um novo link em 'Esqueci minha senha'.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Não foi possível atualizar a senha. Tente novamente." };
  }

  const redirectPath = (await resolveHomeForCurrentUser(supabase)) ?? "/login";
  redirect(redirectPath);
}
