"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailRateLimitError, EMAIL_RATE_LIMIT_MESSAGE } from "@/lib/supabase/errors";
import { getOrigin } from "@/lib/site-url";
import { LEGAL_VERSION } from "@/lib/legal/documents";
import { getRequestEvidence } from "@/lib/legal/consent";

export type SignupState = {
  error?: string;
  success?: boolean;
  message?: string;
} | null;

/**
 * Cadastro do coach (item 3 do TODO).
 *
 * 1. `supabase.auth.signUp` cria o usuário em `auth.users` via o client normal (sessão
 *    ainda não existe, mas não precisa — `signUp` é uma chamada pública da API de Auth).
 * 2. Bootstrap de `accounts` + `coach_users` via service role: `accounts` só tem policy
 *    de SELECT (`accounts_coach_read`) e `coach_users` só tem policy de SELECT
 *    (`coach_users_self_read`) — não existe policy de INSERT pra usuário comum em
 *    nenhuma das duas, de propósito (criar a própria conta/perfil pela primeira vez é
 *    exatamente o tipo de operação que não deveria ficar liberada via RLS pra qualquer
 *    usuário autenticado). Por isso esse passo específico usa
 *    `createAdminClient()` (service role) — nunca exposta ao browser.
 * 3. Se o projeto Supabase tiver "Confirm email" desligado, `signUp` já devolve uma
 *    sessão ativa (cookies setados pelo client de servidor) e o coach vai direto pra
 *    `/coach`. Se tiver confirmação de e-mail ligada, não existe sessão ainda — o
 *    perfil já foi criado (pra existir assim que o coach confirmar e logar), mas a tela
 *    mostra "verifique seu e-mail" em vez de redirecionar.
 */
export async function signupCoach(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!name || !email || !password) {
    return { error: "Preencha nome, e-mail e senha." };
  }
  if (password.length < 8) {
    return { error: "A senha precisa ter pelo menos 8 caracteres." };
  }
  if (formData.get("accept_terms") !== "on") {
    return { error: "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade." };
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/coach`,
    },
  });

  if (signUpError) {
    if (isEmailRateLimitError(signUpError)) {
      return { error: EMAIL_RATE_LIMIT_MESSAGE };
    }
    if (/already registered|already exists/i.test(signUpError.message)) {
      return {
        error: "Esse e-mail já está cadastrado. Faça login ou recupere sua senha.",
      };
    }
    return { error: "Não foi possível criar a conta. Tente novamente." };
  }

  const user = data.user;
  if (!user) {
    return { error: "Não foi possível criar a conta. Tente novamente." };
  }

  // Supabase devolve um "usuário" sem identidades quando o e-mail já existe e a
  // confirmação de e-mail está ligada (proteção contra enumeração de e-mail) — é assim
  // que se detecta duplicidade nesse modo, já que não vem `error` nesse caso.
  if (user.identities && user.identities.length === 0) {
    return {
      error: "Esse e-mail já está cadastrado. Faça login ou recupere sua senha.",
    };
  }

  const admin = createAdminClient();

  const { data: account, error: accountError } = await admin
    .from("accounts")
    .insert({ name })
    .select("id")
    .single();

  if (accountError || !account) {
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    return { error: "Não foi possível criar a conta. Tente novamente." };
  }

  const { error: coachError } = await admin.from("coach_users").insert({
    id: user.id,
    account_id: account.id,
    name,
    email,
  });

  if (coachError) {
    try {
      await admin.from("accounts").delete().eq("id", account.id);
    } catch {
      // best-effort cleanup — segue pro deleteUser abaixo mesmo se isso falhar.
    }
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    return { error: "Não foi possível criar seu perfil de coach. Tente novamente." };
  }

  // Prova do aceite dos Termos + Política (LGPD art. 8º, §2º — ônus da prova é de quem trata).
  // Via service role porque aqui ainda pode não existir sessão (confirmação de e-mail ligada),
  // então a RPC `record_consent` não teria `auth.uid()`. Best-effort: se falhar, o gate de
  // `requireCoach` pede o aceite de novo em `/consentimento` no primeiro acesso.
  const evidence = await getRequestEvidence();
  const { error: consentError } = await admin.from("consent_records").insert(
    (["terms_of_use", "privacy_policy"] as const).map((purpose) => ({
      user_id: user.id,
      subject_role: "coach",
      account_id: account.id,
      purpose,
      document_version: LEGAL_VERSION,
      action: "granted",
      ip_address: evidence.ip,
      user_agent: evidence.userAgent,
    }))
  );
  if (consentError) {
    console.error("Falha ao registrar aceite dos termos no cadastro:", consentError.message);
  }

  // Seed do template padrão de check-in (próxima fatia do item 4 do TODO). Decisão: fazer
  // isso direto aqui, dentro da mesma Server Action, em vez de um mecanismo de seed
  // separado — é criado exatamente uma vez, no exato momento em que a conta nasce, e já
  // temos o client admin em mãos (não existe policy de INSERT pra usuário comum em
  // `checkin_templates`/`checkin_questions`, mesmo motivo do bootstrap de accounts/coach_users
  // acima). Deliberadamente BEST-EFFORT (não desfaz a conta se isso falhar): ao contrário de
  // accounts/coach_users, o template de check-in não é necessário pro coach logar e usar
  // `/coach` — é dado suplementar que `lib/repository.ts` (`getTemplateWithQuestions`) já
  // trata como ausente sem quebrar (aluno só não vê perguntas). Travar a criação da conta por
  // causa disso tornaria o cadastro mais frágil por uma feature não essencial nesse instante.
  const { data: template, error: templateError } = await admin
    .from("checkin_templates")
    .insert({ account_id: account.id, name: "Padrão" })
    .select("id")
    .single();

  if (!templateError && template) {
    const { error: questionsError } = await admin.from("checkin_questions").insert([
      {
        template_id: template.id,
        key: "weight_kg",
        label: "Peso (kg)",
        type: "number",
        unit: "kg",
        required: true,
        sort_order: 0,
      },
      {
        template_id: template.id,
        key: "adherence_pct",
        label: "Como foi sua aderência à dieta e ao treino essa semana?",
        type: "scale",
        required: true,
        sort_order: 1,
      },
      {
        template_id: template.id,
        key: "energy",
        label: "Nível de energia",
        type: "scale",
        required: false,
        sort_order: 2,
      },
      {
        template_id: template.id,
        key: "notes",
        label: "Observações (opcional)",
        type: "text",
        required: false,
        sort_order: 3,
      },
    ]);
    if (questionsError) {
      console.error("Falha ao semear perguntas do check-in padrão:", questionsError.message);
    }
  } else if (templateError) {
    console.error("Falha ao semear template de check-in padrão:", templateError.message);
  }

  if (data.session) {
    redirect("/coach");
  }

  return {
    success: true,
    message:
      "Conta criada! Confirme seu e-mail (verifique a caixa de entrada) e depois faça login.",
  };
}
