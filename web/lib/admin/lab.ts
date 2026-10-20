import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUserId, requireAdmin } from "./auth";
import { recordAdminEvent } from "./audit";
import {
  decodeLabCookie,
  encodeLabCookie,
  isLabProfileKey,
  isReservedDemoEmail,
  LAB_COOKIE_TTL_SECONDS,
  LAB_ENTRY_PATH,
  LAB_PROFILE_META,
  labProfileLabel,
  type LabProfileKey,
} from "@/app/admin/laboratorio/_lib/cookie";

/**
 * Laboratório de demonstração (itens 26–28 do TODO V5, §10 do plano de dados).
 *
 * Troca de perfil SEM logout manual, só para o proprietário (allowlist `TRACKLY_ADMIN_USER_IDS`) e só
 * para os logins da lista FECHADA `demo_lab_profiles` (conta `is_demo`, e-mail `.test`). Nunca assume
 * um usuário real nem outro admin — o laboratório não serve para contornar permissões.
 *
 * Como funciona:
 * 1. `switchToLabProfile`: gera um magic link no servidor (service role, NENHUM e-mail é enviado) e
 *    troca a sessão com `verifyOtp`. Antes, guarda o refresh token da sessão do admin, CIFRADO, no
 *    cookie `trackly_lab` (httpOnly, sameSite=strict, 2 h, assinado por HMAC).
 * 2. `returnToAdmin`: valida assinatura e validade do cookie, encerra a sessão demo e restaura a
 *    sessão ORIGINAL do admin com aquele refresh token — quem valida o token é o Supabase Auth. Depois
 *    confere que o usuário restaurado é exatamente o `adminUserId` do cookie e continua na allowlist.
 *    Qualquer falha (cookie inválido/vencido, token revogado, UID diferente): sessão encerrada e o
 *    admin volta pelo login normal. O cookie sozinho nunca vira sessão de admin.
 *
 * Segredo: `TRACKLY_LAB_SECRET` (≥ 32 caracteres) se existir; senão uma chave DERIVADA (HMAC com rótulo
 * fixo) de `SUPABASE_SERVICE_ROLE_KEY` — o valor da service role nunca é usado diretamente nem sai do
 * servidor. Trocar qualquer um dos dois invalida os cookies do laboratório em uso (o admin faz login).
 */

export const LAB_COOKIE = "trackly_lab";

function labSecret(): string {
  const explicit = process.env.TRACKLY_LAB_SECRET;
  if (explicit && explicit.length >= 32) return explicit;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Sem segredo para o cookie do laboratório.");
  return createHmac("sha256", serviceKey).update("trackly-lab-secret/v1").digest("hex");
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

export type LabCookieInfo = {
  adminUserId: string;
  profileKey: LabProfileKey;
  label: string;
  expiresAt: string;
};

/**
 * Cookie do laboratório válido (assinatura, validade e admin ainda na allowlist)? Só leitura — serve
 * para a faixa "Voltar ao painel admin". Nunca devolve o token guardado.
 */
export async function readLabCookie(): Promise<LabCookieInfo | null> {
  try {
    const store = await cookies();
    const decoded = decodeLabCookie(store.get(LAB_COOKIE)?.value, labSecret(), nowSeconds());
    if (!decoded || !isAdminUserId(decoded.adminUserId)) return null;
    return {
      adminUserId: decoded.adminUserId,
      profileKey: decoded.profileKey,
      label: labProfileLabel(decoded.profileKey),
      expiresAt: new Date(decoded.expiresAt * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

export type LabProfileRow = {
  key: LabProfileKey;
  userId: string;
  accountId: string;
  clientId: string | null;
  label: string;
};

export type LabProfilesResult = { ok: true; profiles: Partial<Record<LabProfileKey, LabProfileRow>> } | { ok: false };

/** Perfis registrados (para a tela do laboratório). `ok: false` = tabela indisponível (0023 pendente). */
export async function listLabProfiles(): Promise<LabProfilesResult> {
  await requireAdmin();
  const { data, error } = await createAdminClient()
    .from("demo_lab_profiles")
    .select("key, user_id, account_id, client_id, label");
  if (error || !data) return { ok: false };
  const profiles: Partial<Record<LabProfileKey, LabProfileRow>> = {};
  for (const row of data) {
    if (!isLabProfileKey(row.key)) continue;
    profiles[row.key] = {
      key: row.key,
      userId: row.user_id as string,
      accountId: row.account_id as string,
      clientId: (row.client_id as string | null) ?? null,
      label: row.label as string,
    };
  }
  return { ok: true, profiles };
}

type Resolved = { profile: LabProfileRow; email: string };

/**
 * Confere de novo, no servidor, tudo o que o trigger da 0023 já garante: conta `is_demo` no cenário
 * certo, coerência coach/aluno ↔ conta ↔ login, e-mail `.test`, e que o alvo não é um admin.
 */
async function resolveLabProfile(key: LabProfileKey): Promise<Resolved | { error: string }> {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("demo_lab_profiles")
    .select("key, user_id, account_id, client_id, label")
    .eq("key", key)
    .maybeSingle();
  if (error) return { error: "Laboratório indisponível (migração 0023 pendente?)." };
  if (!row) return { error: "Perfil ainda não configurado. Rode o seed de demonstração." };

  const profile: LabProfileRow = {
    key,
    userId: row.user_id as string,
    accountId: row.account_id as string,
    clientId: (row.client_id as string | null) ?? null,
    label: row.label as string,
  };
  const meta = LAB_PROFILE_META[key];

  if (isAdminUserId(profile.userId)) return { error: "Este perfil não pode ser assumido." };

  const { data: account } = await admin
    .from("accounts")
    .select("is_demo, demo_scenario")
    .eq("id", profile.accountId)
    .maybeSingle();
  if (!account || account.is_demo !== true || account.demo_scenario !== meta.scenario) {
    return { error: "Conta não é de demonstração — troca recusada." };
  }

  if (meta.role === "coach") {
    const { data: coach } = await admin
      .from("coach_users")
      .select("account_id")
      .eq("id", profile.userId)
      .maybeSingle();
    if (!coach || coach.account_id !== profile.accountId) return { error: "Perfil incoerente — troca recusada." };
  } else {
    if (!profile.clientId) return { error: "Aluno demo não configurado. Rode o seed ou resete o cenário." };
    const { data: client } = await admin
      .from("clients")
      .select("account_id, auth_user_id")
      .eq("id", profile.clientId)
      .maybeSingle();
    if (!client || client.account_id !== profile.accountId || client.auth_user_id !== profile.userId) {
      return { error: "Perfil incoerente — troca recusada." };
    }
  }

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(profile.userId);
  const email = authUser?.user?.email ?? "";
  if (authErr || !isReservedDemoEmail(email)) return { error: "Login fora do domínio de demonstração — troca recusada." };

  return { profile, email };
}

export type LabActionResult = { ok: false; error: string };

/**
 * Assume um perfil demo. Só admin; só perfis de `demo_lab_profiles`. Em caso de sucesso redireciona
 * para a área do perfil (`/coach` ou `/portal`); em erro devolve a mensagem (sessão do admin intacta).
 *
 * O redirect passa pela página-ponte `/laboratorio/entrando`, que abre o destino com navegação
 * COMPLETA. Motivo: o redirect de Server Action é "soft" — o Next renderiza o destino dentro da
 * própria resposta da action, e quando esse destino redireciona de novo durante a renderização
 * (aluno "do zero": `/portal` → `/portal/onboarding` pelo gate de `requireClient`) o roteador do
 * cliente entra num laço de refetch do RSC (tela preta "Rendering…" até um reload). A carga
 * completa também descarta o cache do roteador montado com a sessão do admin.
 */
export async function switchToLabProfile(key: string): Promise<LabActionResult> {
  const { user } = await requireAdmin();
  if (!isLabProfileKey(key)) return { ok: false, error: "Perfil inválido." };

  const resolved = await resolveLabProfile(key);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const { profile, email } = resolved;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  // `requireAdmin` já validou o usuário com `getUser()`; a sessão do cookie tem de ser a mesma.
  if (!session?.refresh_token || session.user.id !== user.id) {
    return { ok: false, error: "Sessão do admin não encontrada. Entre de novo." };
  }

  let cookieValue: string;
  try {
    cookieValue = encodeLabCookie(
      { adminUserId: user.id, profileKey: key, adminRefreshToken: session.refresh_token },
      labSecret(),
      nowSeconds()
    );
  } catch {
    return { ok: false, error: "Laboratório sem segredo configurado no servidor." };
  }

  // Magic link gerado no servidor: devolve o hash do token, NÃO envia e-mail.
  const { data: link, error: linkErr } = await createAdminClient().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) return { ok: false, error: "Não foi possível preparar o acesso demo agora." };

  // Auditoria é obrigatória: sem trilha, sem troca.
  const audited = await recordAdminEvent({
    action: "lab_switch",
    targetUserId: profile.userId,
    targetAccountId: profile.accountId,
    labProfile: key,
  });
  if (!audited) return { ok: false, error: "Falha ao registrar a auditoria — troca cancelada." };

  const { error: otpErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (otpErr) return { ok: false, error: "Não foi possível entrar no perfil demo agora." };

  (await cookies()).set(LAB_COOKIE, cookieValue, { ...COOKIE_OPTIONS, maxAge: LAB_COOKIE_TTL_SECONDS });
  redirect(`${LAB_ENTRY_PATH}?para=${encodeURIComponent(LAB_PROFILE_META[key].home)}`);
}

async function endSessionAndGoToLogin(): Promise<never> {
  const store = await cookies();
  store.delete(LAB_COOKIE);
  try {
    await (await createClient()).auth.signOut({ scope: "local" });
  } catch {
    // segue para o login mesmo assim
  }
  redirect("/login");
}

/**
 * "Voltar ao painel admin". Valida o cookie e restaura a sessão ORIGINAL do admin (refresh token
 * guardado, validado pelo Supabase); confere o UID e a allowlist. Qualquer falha → login normal.
 */
export async function returnToAdmin(): Promise<never> {
  const store = await cookies();
  let decoded: ReturnType<typeof decodeLabCookie> = null;
  try {
    decoded = decodeLabCookie(store.get(LAB_COOKIE)?.value, labSecret(), nowSeconds());
  } catch {
    decoded = null;
  }
  if (!decoded || !isAdminUserId(decoded.adminUserId)) return endSessionAndGoToLogin();

  const supabase = await createClient();
  // Encerra SÓ a sessão demo deste navegador (scope local).
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  store.delete(LAB_COOKIE);

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: decoded.adminRefreshToken });
  const accessToken = data.session?.access_token;
  if (error || !accessToken) return endSessionAndGoToLogin();

  // Confirma no Auth (não só pelo retorno do refresh) quem é o dono da sessão restaurada.
  const admin = createAdminClient();
  const { data: check } = await admin.auth.getUser(accessToken);
  const restoredId = check?.user?.id;
  if (!restoredId || restoredId !== decoded.adminUserId || !isAdminUserId(restoredId)) {
    return endSessionAndGoToLogin();
  }

  // Trilha gravada direto (o `requireAdmin` em cache desta requisição pode não ver os cookies novos).
  const { error: auditErr } = await admin.from("admin_audit_events").insert({
    actor_user_id: restoredId,
    action: "lab_return",
    lab_profile: decoded.profileKey,
    detail: {},
  });
  if (auditErr) console.error("[lab] falha ao gravar auditoria de retorno:", auditErr.code, auditErr.message);

  redirect("/admin/laboratorio");
}

export type ResetResult = { ok: true; message: string } | { ok: false; error: string };

const CHECKIN_PHOTOS_BUCKET = "checkin-photos";

/** Remove os arquivos de foto sob `prefix` (estrutura `{account}/{client}/week-{n}/{angle}.jpg`). */
async function removePhotoPrefix(prefix: string): Promise<void> {
  const storage = createAdminClient().storage.from(CHECKIN_PHOTOS_BUCKET);
  const paths: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storage.list(dir, { limit: 100, offset });
      if (error || !data) return;
      for (const item of data) {
        const full = `${dir}/${item.name}`;
        if (item.id) paths.push(full);
        else if (depth < 3) await walk(full, depth + 1);
      }
      if (data.length < 100) return;
    }
  };
  try {
    await walk(prefix, 0);
    for (let i = 0; i < paths.length; i += 100) await storage.remove(paths.slice(i, i + 100));
  } catch (err) {
    console.error("[lab] falha ao limpar fotos demo:", err);
  }
}

/** Apaga logins de aluno órfãos da conta demo — só se não forem coach nem aluno em outra conta. */
async function deleteOrphanLogins(ids: string[]): Promise<number> {
  const admin = createAdminClient();
  let deleted = 0;
  for (const id of ids) {
    if (isAdminUserId(id)) continue;
    const [{ data: coach }, { data: client }] = await Promise.all([
      admin.from("coach_users").select("id").eq("id", id).maybeSingle(),
      admin.from("clients").select("id").eq("auth_user_id", id).limit(1).maybeSingle(),
    ]);
    if (coach || client) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) deleted++;
  }
  return deleted;
}

/**
 * Volta a conta coach "Começar do zero" ao estado inicial. A RPC `lab_reset_demo_account` só aceita
 * conta `is_demo` com cenário `empty` (recusa conta real) e só roda pela service role.
 */
export async function resetEmptyScenario(): Promise<ResetResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("demo_lab_profiles")
    .select("account_id")
    .eq("key", "coach_empty")
    .maybeSingle();
  if (!profile?.account_id) return { ok: false, error: "Cenário vazio não configurado. Rode o seed de demonstração." };
  const accountId = profile.account_id as string;

  const { data, error } = await admin.rpc("lab_reset_demo_account", { p_account_id: accountId });
  if (error) {
    return {
      ok: false,
      error: /not_demo_empty_account/.test(error.message)
        ? "Recusado: a conta não é a demonstração vazia."
        : "Não foi possível resetar agora. Nada foi alterado.",
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { deleted_clients?: number; orphan_auth_user_ids?: string[] } | null;
  await deleteOrphanLogins(row?.orphan_auth_user_ids ?? []);
  await removePhotoPrefix(accountId);

  const audited = await recordAdminEvent({
    action: "lab_reset_account",
    targetAccountId: accountId,
    labProfile: "coach_empty",
    detail: { deleted_clients: row?.deleted_clients ?? 0 },
  });
  return {
    ok: true,
    message: `Cenário "Começar do zero" restaurado (${row?.deleted_clients ?? 0} aluno(s) removido(s)).${audited ? "" : " A auditoria falhou — veja os logs."}`,
  };
}

/**
 * Recria o aluno "Começar do zero" (mesmo login, questionário e planos zerados). A RPC
 * `lab_reset_demo_student` só aceita o aluno registrado como `student_fresh` em conta demo.
 */
export async function resetFreshStudent(): Promise<ResetResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("demo_lab_profiles")
    .select("account_id, client_id, user_id")
    .eq("key", "student_fresh")
    .maybeSingle();
  if (!profile?.client_id) return { ok: false, error: "Aluno do zero não configurado. Rode o seed de demonstração." };
  const oldClientId = profile.client_id as string;

  const { data: newId, error } = await admin.rpc("lab_reset_demo_student", { p_client_id: oldClientId });
  if (error) {
    return {
      ok: false,
      error: /not_demo_account|not_fresh_demo_student/.test(error.message)
        ? "Recusado: o aluno não é o aluno demo do zero."
        : "Não foi possível resetar agora. Nada foi alterado.",
    };
  }
  await removePhotoPrefix(`${profile.account_id as string}/${oldClientId}`);

  const audited = await recordAdminEvent({
    action: "lab_reset_student",
    targetUserId: profile.user_id as string,
    targetAccountId: profile.account_id as string,
    labProfile: "student_fresh",
    detail: { client_id: typeof newId === "string" ? newId : null },
  });
  return {
    ok: true,
    message: `Aluno "Começar do zero" recriado — começa pelo questionário inicial.${audited ? "" : " A auditoria falhou — veja os logs."}`,
  };
}
