import "server-only";
import type { createClient } from "@/lib/supabase/server";

/**
 * Resolve pra qual área (`/coach` ou `/portal`) a sessão atual pertence, checando qual
 * das duas tabelas de perfil tem uma linha pra esse `auth.uid()`. Fonte única de verdade
 * pra essa decisão — usada pelo login com senha, pelo fim do reset de senha e pelas duas
 * páginas stub (`/coach`, `/portal`), nunca reimplementada por tela (item 2 e 7 do TODO).
 *
 * Deliberadamente um módulo comum (sem `"use server"`), não uma Server Action: é chamado
 * de dentro de Server Components e de outras Server Actions, nunca ligado direto a um
 * form/botão no cliente — não precisa (nem deve) virar um endpoint RPC próprio.
 */
export async function resolveHomeForCurrentUser(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<"/coach" | "/portal" | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: coach } = await supabase
    .from("coach_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (coach) return "/coach";

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (client) return "/portal";

  return null;
}
