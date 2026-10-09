import { createAdminClient } from "@/lib/supabase/admin";

export type InvitePreview = {
  id: string;
  name: string;
  initials: string;
  inviteStatus: "pending" | "invited" | "active";
  coachName: string;
};

function initialsFor(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}

/**
 * Lê só o necessário pra exibir o convite (item 6 do TODO) — via service role porque ainda
 * não existe sessão autenticada nesse ponto (o link `/convite?id=<clientId>` costuma ser
 * aberto direto do WhatsApp/e-mail, sem login prévio). Devolve um DTO mínimo pro Client
 * Component (`AcceptInviteForm`), nunca a linha inteira de `clients` (que tem telefone,
 * e-mail, objetivo etc.).
 *
 * Fica fora de `lib/repository.ts` de propósito: aquele arquivo documenta como invariante
 * "nunca usar o client admin" (o isolamento por `account_id` depende do RLS do client de
 * sessão) — misturar uma função admin ali quebraria essa garantia pra quem lê o arquivo.
 * Mesmo padrão de `lib/evaluations.ts`/`lib/storage/*`: módulo irmão dedicado, chamado a
 * partir do Server Component (`app/convite/page.tsx`) em vez de embutir a query ali.
 */
export async function getInvitePreview(clientId: string): Promise<InvitePreview | null> {
  const admin = createAdminClient();

  const { data: client } = await admin
    .from("clients")
    .select("id, name, invite_status, coach_id")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) return null;

  const { data: coach } = await admin
    .from("coach_users")
    .select("name")
    .eq("id", client.coach_id)
    .maybeSingle();

  return {
    id: client.id,
    name: client.name,
    initials: initialsFor(client.name),
    inviteStatus: client.invite_status as InvitePreview["inviteStatus"],
    coachName: coach?.name ?? "seu coach",
  };
}
