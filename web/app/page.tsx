import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveHomeForCurrentUser } from "@/lib/auth/resolve-home";
import { postLoginDestination } from "@/lib/auth/post-login";
import { isAdminUserId } from "@/lib/admin/auth";

/**
 * Raiz do app (`/`). Sem UI própria: só decide pra onde mandar quem chega aqui — igual ao
 * padrão já usado no fim do login e do reset de senha (`resolveHomeForCurrentUser`). Antes
 * disto era uma tela estática "em construção" citando o protótipo, visível pra qualquer
 * visitante (item 32 do TODO — sensação de protótipo/rascunho na UI real).
 */
export default async function Home() {
  const supabase = await createClient();
  const home = await resolveHomeForCurrentUser(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const redirectPath = postLoginDestination({ isAdmin: isAdminUserId(user?.id), home }) ?? "/login";
  redirect(redirectPath);
}
