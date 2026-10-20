"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { resetEmptyScenario, resetFreshStudent, switchToLabProfile } from "@/lib/admin/lab";

/**
 * Server Actions do Laboratório. Cada uma chama `requireAdmin()` (Server Action é um endpoint POST
 * público — o guard do layout não a protege). O perfil vem do formulário só como CHAVE da lista
 * fechada; quem resolve login/conta é `lib/admin/lab.ts`, no servidor.
 */

export type LabFormState = { error?: string; success?: string } | null;

export async function switchProfileAction(_prev: LabFormState, formData: FormData): Promise<LabFormState> {
  await requireAdmin();
  // Sucesso redireciona para /coach ou /portal (não volta aqui).
  const result = await switchToLabProfile(String(formData.get("profile") ?? ""));
  return { error: result.error };
}

export async function resetEmptyScenarioAction(): Promise<LabFormState> {
  await requireAdmin();
  const result = await resetEmptyScenario();
  revalidatePath("/admin/laboratorio");
  return result.ok ? { success: result.message } : { error: result.error };
}

export async function resetFreshStudentAction(): Promise<LabFormState> {
  await requireAdmin();
  const result = await resetFreshStudent();
  revalidatePath("/admin/laboratorio");
  return result.ok ? { success: result.message } : { error: result.error };
}
