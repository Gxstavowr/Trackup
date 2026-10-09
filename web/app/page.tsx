import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveHomeForCurrentUser } from "@/lib/auth/resolve-home";

/**
 * Raiz do app (`/`). Sem UI própria: só decide pra onde mandar quem chega aqui — igual ao
 * padrão já usado no fim do login e do reset de senha (`resolveHomeForCurrentUser`). Antes
 * disto era uma tela estática "em construção" citando o protótipo, visível pra qualquer
 * visitante (item 32 do TODO — sensação de protótipo/rascunho na UI real).
 */
export default async function Home() {
  const supabase = await createClient();
  const redirectPath = (await resolveHomeForCurrentUser(supabase)) ?? "/login";
  redirect(redirectPath);
}
