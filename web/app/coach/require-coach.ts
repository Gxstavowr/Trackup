import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMissingConsents } from "@/lib/legal/consent";
import { getCoachBilling, isBillingExemptPath, SUSPENDED_PATH } from "@/lib/billing/coach";
import { isBillingBlocked } from "@/lib/billing/state";

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
export const requireCoach = cache(() => resolveCoach({ allowExemptRoute: true }));

/**
 * Guard de TODA Server Action do coach que lê/altera dados: igual a `requireCoach`, mas NUNCA
 * aceita a exceção de rota do plano suspenso. Numa Server Action o caminho que chega é o da página
 * de origem (e o header pode vir do cliente), então uma ação disparada de `/coach/assinatura` ou
 * `/coach/suspenso` passaria como liberada. Coach com assinatura suspensa/cancelada vai pra
 * `/coach/suspenso`; ativo, em atraso (carência) ou sem assinatura segue normal. Ficam fora só as
 * ações de pagamento da assinatura (`assinatura/actions.ts`, `billing-actions.ts`).
 */
export const requireActiveCoach = cache(() => resolveCoach({ allowExemptRoute: false }));

async function resolveCoach({ allowExemptRoute }: { allowExemptRoute: boolean }) {
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

  // Assinatura do Trackly suspensa/cancelada: só a tela "Plano suspenso" e "Minha assinatura"
  // abrem (`lib/billing/coach.ts`), e só para renderizar a página. Sem linha de assinatura = nunca
  // bloqueia.
  if (isBillingBlocked((await getCoachBilling())?.status)) {
    if (!allowExemptRoute || !(await isBillingExemptPath())) redirect(SUSPENDED_PATH);
  }

  return { user, coach: coach as { name: string } };
}
