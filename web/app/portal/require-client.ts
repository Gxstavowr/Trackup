import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getMissingConsents } from "@/lib/legal/consent";
import { BILLING_PATH_HEADER } from "@/lib/billing/path-header";

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

  // V5 (item 9): aluno do fluxo novo sem questionário enviado vai para o questionário inicial em
  // vez do dashboard vazio. Legado (`onboarding_required = false`) nunca é redirecionado.
  if (!(await isOnboardingExemptPath()) && (await needsOnboarding(supabase, session.client.id))) {
    redirect(ONBOARDING_PATH);
  }

  return session;
});

export const ONBOARDING_PATH = "/portal/onboarding";

/** Rotas que continuam abertas com o questionário pendente (o próprio questionário, conta e avisos). */
const ONBOARDING_EXEMPT_PREFIXES = [ONBOARDING_PATH, "/portal/conta", "/portal/notificacoes"];

/**
 * Caminho pedido vem do `proxy.ts` (header sempre sobrescrito lá, o mesmo usado pelo bloqueio de
 * plano do coach). Sem o header não dá para saber a rota: não bloqueia (evita laço de redirect).
 */
async function isOnboardingExemptPath(): Promise<boolean> {
  const raw = (await headers()).get(BILLING_PATH_HEADER);
  if (!raw) return true;
  const { pathname } = new URL(raw, "http://local");
  return ONBOARDING_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * `onboarding_required` e questionário ainda não enviado? Degrada para "não" se a migração 0022
 * não estiver aplicada (coluna/tabela ausentes) ou em qualquer erro: o portal segue como antes.
 */
async function needsOnboarding(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("clients")
      .select("onboarding_required")
      .eq("id", clientId)
      .maybeSingle();
    if (error || (data as { onboarding_required?: boolean } | null)?.onboarding_required !== true) return false;

    const { data: sent, error: sentError } = await supabase
      .from("onboarding_questionnaires")
      .select("id")
      .eq("client_id", clientId)
      .eq("status", "submitted")
      .limit(1);
    if (sentError) return false;
    return (sent ?? []).length === 0;
  } catch {
    return false;
  }
}
