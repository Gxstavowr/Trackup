import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayDateSP } from "@/lib/portal-today";
import { createNotification } from "@/lib/repository";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Callback PKCE padrão do Supabase Auth (item 6 do TODO) — todo link de e-mail (magic
 * link do aluno, convite aceito, reset de senha do coach) volta pra cá com `?code=...`,
 * essa rota troca o código por uma sessão de verdade via
 * `supabase.auth.exchangeCodeForSession` e só então redireciona pra `next`.
 *
 * Depois de trocar o código, se o link veio de um convite (`?invite=<client_id>`) e o e-mail
 * confirmado é o do cadastro convidado, ativa o vínculo: `auth_user_id`,
 * `invite_status = 'active'`, `activated_at`. Isso usa
 * o service role porque não existe (de propósito) uma policy de UPDATE que deixe o
 * próprio aluno alterar sua linha em `clients` — só o coach da conta ou o backend têm
 * esse poder. Login comum (magic link da tela de login, reset de senha do coach) não leva
 * `invite` e nunca ativa nada.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/portal";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Ativação do convite: SÓ o cadastro do convite aceito (`invite`, gravado em
      // `app/convite/actions.ts`) e só se o e-mail confirmado for o dele. Antes, o vínculo era
      // "toda linha de `clients` com este e-mail, em qualquer conta" — um coach que cadastrasse
      // o e-mail de um aluno de outra conta conseguia sequestrar/travar a ativação dele.
      const inviteId = searchParams.get("invite");
      if (user?.email && inviteId && UUID_RE.test(inviteId)) {
        const admin = createAdminClient();
        const { data: invited } = await admin
          .from("clients")
          .select("id, email")
          .eq("id", inviteId)
          .is("auth_user_id", null)
          .in("invite_status", ["pending", "invited"])
          .maybeSingle();

        const emailMatches =
          !!invited?.email && invited.email.trim().toLowerCase() === user.email.toLowerCase();

        const { data: activatedClients } = emailMatches
          ? await admin
              .from("clients")
              .update({
                auth_user_id: user.id,
                invite_status: "active",
                activated_at: new Date().toISOString(),
                // Mesmo comportamento do protótipo (prototype/assets/js/data.js, acceptInvite,
                // ~linha 1769): a semana 1 do aluno começa no dia em que o convite é aceito. Sem
                // isso, `lib/repository.ts` (getCurrentCheckin/getClientsWithCheckinStatus) não
                // tem como calcular a semana atual pra nenhum check-in.
                start_date: todayDateSP(),
              })
              .eq("id", invited!.id)
              .is("auth_user_id", null)
              .select("id, name")
          : { data: [] };

        // LGPD: vincula ao login (agora com e-mail confirmado) o aceite que o aluno marcou na
        // tela de convite (`app/convite/actions.ts`, migration 0011).
        const activatedIds = ((activatedClients ?? []) as { id: string }[]).map((c) => c.id);
        if (activatedIds.length > 0) {
          const { error: linkError } = await admin
            .from("consent_records")
            .update({ user_id: user.id })
            .in("client_id", activatedIds)
            .is("user_id", null);
          if (linkError) console.error("Não foi possível vincular o consentimento:", linkError.message);
        }

        // Best-effort: notifica o COACH que o aluno aceitou o convite (`event_type` reaproveita
        // `'checkin_received'` — não existe um "invite_accepted" no CHECK constraint).
        for (const activated of (activatedClients ?? []) as { id: string; name: string }[]) {
          try {
            await createNotification(activated.id, {
              event_type: "checkin_received",
              recipient: "coach",
              message: `${activated.name} aceitou o convite e ativou a conta.`,
            });
          } catch (err) {
            console.error("Não foi possível criar a notificação de convite aceito:", err);
          }
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
