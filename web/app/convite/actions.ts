"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/site-url";
import { isEmailRateLimitError, EMAIL_RATE_LIMIT_MESSAGE } from "@/lib/supabase/errors";
import { LEGAL_VERSION, REQUIRED_PURPOSES } from "@/lib/legal/documents";
import { getRequestEvidence } from "@/lib/legal/consent";

export type AcceptInviteState = {
  success?: boolean;
  message?: string;
  error?: string;
} | null;

/**
 * Aceitar convite (item 6 do TODO) — o produto usa "email/senha + magic link"
 * (ARCHITECTURE.md), então aceitar o convite dispara um magic link pro e-mail que o
 * coach já cadastrou em `clients.email`, em vez de pedir uma senha nessa tela.
 *
 * Usa o service role só pra ler o e-mail do cliente (ainda não existe sessão — é
 * exatamente o mesmo motivo do preview em `page.tsx`) e pra marcar `invite_status =
 * 'invited'` (o convite foi clicado, mas a ativação de verdade só acontece quando o
 * aluno clicar no link do e-mail — ver `app/auth/callback/route.ts`, que é quem grava
 * `invite_status = 'active'`).
 */
export async function acceptInvite(
  _prevState: AcceptInviteState,
  formData: FormData
): Promise<AcceptInviteState> {
  const clientId = String(formData.get("clientId") || "");
  if (!clientId) {
    return { error: "Convite inválido." };
  }
  if (REQUIRED_PURPOSES.client.some((purpose) => formData.get(purpose) !== "on")) {
    return { error: "Para aceitar o convite, marque as duas confirmações." };
  }

  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("id, account_id, email, invite_status")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) {
    return { error: "Convite não encontrado." };
  }
  if (!client.email) {
    return {
      error:
        "Seu coach ainda não cadastrou um e-mail para você. Peça pra ele adicionar antes de aceitar o convite.",
    };
  }
  if (client.invite_status === "active") {
    return { error: "Esse convite já foi utilizado. Faça login." };
  }

  if (client.invite_status === "pending") {
    await admin
      .from("clients")
      .update({ invite_status: "invited", invited_at: new Date().toISOString() })
      .eq("id", clientId);
  }

  // LGPD: o aceite é registrado AQUI, junto da criação da conta (não numa tela depois). Ainda
  // não existe login do aluno, então nasce só com `client_id`; o callback do magic link vincula
  // o `user_id` quando o e-mail é confirmado (migration 0011). Sem registro, não segue.
  const evidence = await getRequestEvidence();
  const { error: consentError } = await admin.from("consent_records").insert(
    REQUIRED_PURPOSES.client.map((purpose) => ({
      user_id: null,
      subject_role: "client",
      account_id: client.account_id,
      client_id: client.id,
      purpose,
      document_version: LEGAL_VERSION,
      action: "granted",
      ip_address: evidence.ip,
      user_agent: evidence.userAgent,
    }))
  );
  if (consentError) {
    console.error("Falha ao registrar consentimento no convite:", consentError.message);
    return { error: "Não foi possível registrar seu aceite. Tente novamente." };
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email: client.email,
    options: {
      // `invite` diz ao callback QUAL cadastro ativar — nunca "qualquer um com este e-mail".
      emailRedirectTo: `${origin}/auth/callback?next=/portal&invite=${client.id}`,
    },
  });

  if (error) {
    if (isEmailRateLimitError(error)) {
      return { error: EMAIL_RATE_LIMIT_MESSAGE };
    }
    return { error: "Não foi possível enviar o link. Tente novamente." };
  }

  return {
    success: true,
    message: `Enviamos um link de acesso para ${client.email}. Abra seu e-mail para ativar sua conta.`,
  };
}
