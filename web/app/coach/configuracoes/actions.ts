"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteClientCompletely } from "@/lib/privacy/client-data";
import { requireCoach } from "../require-coach";

/**
 * Ações LGPD do coach — ele é o CONTROLADOR dos dados dos alunos (Termos, seção 3) e é quem
 * responde aos pedidos deles. Pedidos do próprio coach são atendidos pelo Trackly fora do app.
 */

const PATH = "/coach/configuracoes";

function fail(code: string): never {
  redirect(`${PATH}?erro=${code}`);
}

/** Muda o status de um pedido de aluno (em andamento / concluído / recusado com motivo). */
export async function resolvePrivacyRequestAction(formData: FormData): Promise<void> {
  await requireCoach();
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
  await requireCoach();
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
  redirect(`${PATH}?excluido=1`);
}

/** Pedido de encerramento da conta do próprio coach (atendido pelo Trackly). */
export async function requestAccountDeletionAction(formData: FormData): Promise<void> {
  await requireCoach();
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
