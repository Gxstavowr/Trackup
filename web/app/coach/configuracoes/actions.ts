"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteClientCompletely } from "@/lib/privacy/client-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveCoach } from "../require-coach";

/**
 * Ações LGPD do coach — ele é o CONTROLADOR dos dados dos alunos (Termos, seção 3) e é quem
 * responde aos pedidos deles. Pedidos do próprio coach são atendidos pelo Trackly fora do app.
 */

const PATH = "/coach/configuracoes";

function fail(code: string): never {
  redirect(`${PATH}?secao=privacidade&erro=${code}`);
}

/** Muda o status de um pedido de aluno (em andamento / concluído / recusado com motivo). */
export async function resolvePrivacyRequestAction(formData: FormData): Promise<void> {
  await requireActiveCoach();
  const id = String(formData.get("requestId") || "");
  const status = String(formData.get("status") || "");
  const response = String(formData.get("response") || "").trim().slice(0, 2000);
  if (!id) fail("pedido");
  if (status === "rejected" && !response) fail("motivo");

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_data_subject_request", {
    p_id: id,
    p_status: status,
    p_response: response || null,
  });
  if (error) {
    console.error("Falha ao atualizar pedido LGPD:", error.message);
    fail("pedido");
  }
  revalidatePath(PATH);
}

/**
 * Exclusão DEFINITIVA de um aluno (banco + fotos + login) atendendo um pedido. O pedido é
 * marcado como concluído na mesma ação — é ele que fica como prova de que a exclusão ocorreu.
 */
export async function deleteStudentForRequestAction(formData: FormData): Promise<void> {
  await requireActiveCoach();
  const requestId = String(formData.get("requestId") || "");
  const clientId = String(formData.get("clientId") || "");
  if (!requestId || !clientId) fail("pedido");
  if (formData.get("confirm") !== "on") fail("confirmar");

  const supabase = await createClient();
  try {
    await deleteClientCompletely(supabase, clientId);
  } catch (err) {
    console.error(err);
    fail("exclusao");
  }

  const { error } = await supabase.rpc("resolve_data_subject_request", {
    p_id: requestId,
    p_status: "completed",
    p_response: `Todos os dados foram excluídos em ${new Date().toLocaleDateString("pt-BR")}.`,
  });
  if (error) console.error("Aluno excluído, mas o pedido não foi fechado:", error.message);

  revalidatePath(PATH);
  revalidatePath("/coach", "layout");
  redirect(`${PATH}?secao=privacidade&excluido=1`);
}

/** Pedido de encerramento da conta do próprio coach (atendido pelo Trackly). */
export async function requestAccountDeletionAction(formData: FormData): Promise<void> {
  await requireActiveCoach();
  if (formData.get("confirm") !== "on") fail("confirmar");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_data_subject_request", {
    p_type: "deletion",
    p_details: "Encerramento da conta do profissional e exclusão de todos os dados da conta.",
  });
  if (error) {
    console.error("Falha ao registrar pedido de encerramento:", error.message);
    fail("pedido");
  }
  revalidatePath(PATH);
}

export type SettingsFormState = { ok?: string; error?: string } | null;

function clean(value: FormDataEntryValue | null, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Perfil profissional: nome do coach (`coach_users.name`) e nome/nicho da conta (`accounts`).
 * Essas tabelas só têm SELECT pela RLS, então a escrita usa o admin client — restrita à linha do
 * PRÓPRIO coach (id = usuário da sessão verificada por `requireActiveCoach`) e à conta que essa linha
 * referencia (lida com o client da sessão). Nenhum id vem do formulário.
 */
export async function updateProfileAction(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const { user } = await requireActiveCoach();
  const name = clean(formData.get("name"), 80);
  const accountName = clean(formData.get("accountName"), 80);
  const niche = clean(formData.get("niche"), 60);
  if (name.length < 2) return { error: "Informe seu nome (mínimo 2 letras)." };
  if (accountName.length < 2) return { error: "Informe o nome da sua marca ou consultoria." };

  const supabase = await createClient();
  const { data: own } = await supabase
    .from("coach_users")
    .select("id, account_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!own || own.id !== user.id) return { error: "Não foi possível confirmar sua conta." };

  const admin = createAdminClient();
  const { error: nameError } = await admin.from("coach_users").update({ name }).eq("id", user.id);
  const { error: accountError } = await admin
    .from("accounts")
    .update({ name: accountName, niche: niche || null })
    .eq("id", own.account_id);
  if (nameError || accountError) {
    console.error("Falha ao salvar perfil:", nameError?.message ?? accountError?.message);
    return { error: "Não foi possível salvar. Tente novamente." };
  }

  revalidatePath("/coach", "layout");
  return { ok: "Perfil salvo." };
}

/** Troca a senha do coach logado (sessão atual; o Supabase Auth valida e aplica). */
export async function changePasswordAction(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  await requireActiveCoach();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "A nova senha precisa ter pelo menos 8 caracteres." };
  if (password.length > 72) return { error: "A senha pode ter no máximo 72 caracteres." };
  if (password !== confirm) return { error: "As duas senhas não são iguais." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("Falha ao trocar senha:", error.message);
    return { error: "Não foi possível trocar a senha. Entre novamente e tente de novo." };
  }
  return { ok: "Senha alterada." };
}
