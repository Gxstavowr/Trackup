import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isIdInAllowlist, parseAdminAllowlist } from "@/app/admin/_lib/logic";

/**
 * Autorização do painel do proprietário (`/admin`) — item 21 do TODO V5, §9 do plano de dados.
 *
 * Quem é admin: allowlist de UUIDs de `auth.users` na variável de ambiente do SERVIDOR
 * `TRACKLY_ADMIN_USER_IDS` (separados por vírgula). Nunca `NEXT_PUBLIC_*`, nunca coluna editável
 * pelo usuário (`coach_users.role = 'admin'` é papel dentro de uma conta de coach e NÃO serve),
 * nunca cookie/header/query vindo do navegador. Sem a variável, ninguém é admin.
 *
 * Lida a cada chamada (não em constante de módulo) para uma troca da variável valer sem rebuild.
 */
export function isAdminUserId(id: string | null | undefined): boolean {
  return isIdInAllowlist(id, parseAdminAllowlist(process.env.TRACKLY_ADMIN_USER_IDS));
}

/**
 * Guard de TODA página, layout e Server Action do admin. Obtém o usuário com `getUser()` (token
 * validado no Supabase Auth — `getSession()` só decodifica o cookie e não serve para autorizar) e
 * compara com a allowlist. Fora da lista, ou sem sessão: `notFound()` — 404 igual ao de uma rota
 * inexistente, sem revelar que a área existe (nem redirecionar para o login).
 *
 * `cache()`: layout e página da mesma requisição pagam uma única ida ao Auth. Layouts não
 * re-renderizam entre rotas irmãs, então cada página/ação chama este guard também.
 */
export const requireAdmin = cache(async (): Promise<{ user: User }> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !isAdminUserId(user.id)) {
    notFound();
  }
  return { user };
});
