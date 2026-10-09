import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMissingConsents } from "@/lib/legal/consent";

/**
 * Guard de role do lado do servidor pra tudo em `/coach/*`: sessão + linha em `coach_users`.
 * Sem sessão -> `/login`; sessão de aluno -> `/portal`; sem perfil nenhum -> `/login`
 * (mesmo comportamento que cada `page.tsx` do coach já tinha inline).
 *
 * Embrulhado em `cache()` do React pra que layout e página da mesma requisição paguem uma
 * única ida ao banco. Atenção: layouts NÃO re-renderizam em navegação entre rotas irmãs
 * (partial rendering), então páginas que expõem dado continuam chamando este guard também —
 * nunca confiar só no layout (ver `node_modules/next/dist/docs/01-app/02-guides/authentication.md`).
 */
export const requireCoach = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: coach } = await supabase
    .from("coach_users")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  if (!coach) {
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    redirect(client ? "/portal" : "/login");
  }

  // LGPD: sem os aceites obrigatórios na versão atual dos documentos, nada do app abre
  // (`lib/legal/documents.ts` / `docs/lgpd.md`).
  if ((await getMissingConsents(supabase, user.id, "coach")).length > 0) {
    redirect("/consentimento");
  }

  return { user, coach: coach as { name: string } };
});
