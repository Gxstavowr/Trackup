import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMissingConsents } from "@/lib/legal/consent";

/**
 * Guard de role do lado do servidor pra tudo em `/portal/*`: sessão + linha em `clients`
 * (espelho de `app/coach/require-coach.ts`). Sem sessão -> `/login`; sessão de coach ->
 * `/coach`; sem perfil nenhum -> `/login` (mesmo comportamento que cada `page.tsx` do portal
 * já tinha inline). `cache()` do React: layout e página da mesma requisição pagam uma ida só
 * ao banco. Layouts não re-renderizam entre rotas irmãs, então as páginas chamam também.
 */
export type PortalClient = {
  id: string;
  name: string;
  objective: string | null;
  start_date: string | null;
};

/**
 * Sessão + perfil de aluno SEM o gate de consentimento — só pra `/meus-dados` (direitos do
 * titular: exportar, pedir exclusão). Quem revogou o consentimento continua podendo exercê-los.
 */
export const requireClientSession = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, objective, start_date")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!client) {
    const { data: coach } = await supabase
      .from("coach_users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    redirect(coach ? "/coach" : "/login");
  }

  return { user, client: client as PortalClient };
});

export const requireClient = cache(async () => {
  const session = await requireClientSession();

  // LGPD: sem os aceites obrigatórios na versão atual dos documentos, nada do portal abre
  // (`lib/legal/documents.ts` / `docs/lgpd.md`).
  const supabase = await createClient();
  if ((await getMissingConsents(supabase, session.user.id, "client")).length > 0) {
    redirect("/consentimento");
  }

  return session;
});
