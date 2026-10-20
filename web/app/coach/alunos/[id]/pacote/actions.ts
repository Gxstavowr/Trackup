"use server";

import { revalidatePath } from "next/cache";
import { getClient } from "@/lib/repository";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import {
  changeContract,
  getClientContracts,
  setInitialContract,
  voidScheduledChange,
} from "@/lib/onboarding/contracts";
import { requireActiveCoach } from "../../../require-coach";
import { deriveContractState, REASON_MAX, validateChangeInput, validateInitialInput } from "./contract-logic";

/**
 * Server Actions da tela "Pacote do aluno". Autorização no servidor em duas camadas: `requireActiveCoach`
 * + `getClient` (RLS: aluno de outra conta = null) aqui, e `is_coach_of_client` dentro das RPCs
 * `security definer` da 0022. A validação local só dá a mensagem certa; o banco impõe as regras.
 * Nenhuma delas toca `subscriptions`/`payments` nem a mensalidade do coach ao Trackly.
 */

export type PackageActionState = { ok?: boolean; error?: string; doneAt?: number } | null;

function pathFor(clientId: string) {
  return `/coach/alunos/${clientId}/pacote`;
}

function revalidateStudent(clientId: string) {
  revalidatePath(pathFor(clientId));
  // O pacote muda o que o perfil e o portal mostram (módulos liberados).
  revalidatePath(`/coach/alunos/${clientId}`, "layout");
}

async function ownedClientId(formData: FormData): Promise<string | null> {
  await requireActiveCoach();
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return null;
  const client = await getClient(clientId);
  return client ? clientId : null;
}

/** Aluno legado (sem contrato) ganha o primeiro pacote, vigente hoje. */
export async function setInitialContractAction(
  _prev: PackageActionState,
  formData: FormData
): Promise<PackageActionState> {
  const clientId = await ownedClientId(formData);
  if (!clientId) return { error: "Aluno não encontrado." };
  if (formData.get("confirmed") !== "yes") return { error: "Revise e confirme antes de gravar." };

  const parsed = validateInitialInput({
    package: String(formData.get("package") ?? ""),
    price: String(formData.get("price") ?? ""),
    billingPeriod: String(formData.get("billingPeriod") ?? ""),
  });
  if (!parsed.ok) return { error: parsed.error };

  const result = await setInitialContract({ clientId, ...parsed.value });
  if (!result.ok) return { error: result.error };

  revalidateStudent(clientId);
  return { ok: true, doneAt: Date.now() };
}

/** Mudança explícita de pacote/valor, com vigência, motivo e "acordado com o aluno". */
export async function changeContractAction(
  _prev: PackageActionState,
  formData: FormData
): Promise<PackageActionState> {
  const clientId = await ownedClientId(formData);
  if (!clientId) return { error: "Aluno não encontrado." };
  if (formData.get("confirmed") !== "yes") return { error: "Revise e confirme antes de gravar." };

  let contracts;
  try {
    contracts = await getClientContracts(clientId);
  } catch {
    return { error: "Não foi possível carregar o pacote atual. Tente de novo." };
  }
  if (!contracts.available) return { error: "O registro de pacotes ainda não está disponível neste ambiente." };

  const today = todayInSaoPaulo();
  const { current, scheduled } = deriveContractState(contracts.contracts, today);
  if (scheduled) return { error: "Já existe uma mudança agendada. Anule-a antes de registrar outra." };

  const parsed = validateChangeInput(
    {
      package: String(formData.get("package") ?? ""),
      price: String(formData.get("price") ?? ""),
      billingPeriod: String(formData.get("billingPeriod") ?? ""),
      effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      agreedWithClient: formData.get("agreedWithClient") === "on",
      requireClientConfirmation: formData.get("requireClientConfirmation") === "on",
    },
    current,
    today
  );
  if (!parsed.ok) return { error: parsed.error };

  const result = await changeContract({ clientId, ...parsed.value });
  if (!result.ok) return { error: result.error };

  revalidateStudent(clientId);
  return { ok: true, doneAt: Date.now() };
}

/** Anula a mudança agendada (ainda não vigente). */
export async function voidScheduledChangeAction(
  _prev: PackageActionState,
  formData: FormData
): Promise<PackageActionState> {
  const clientId = await ownedClientId(formData);
  if (!clientId) return { error: "Aluno não encontrado." };
  const contractId = String(formData.get("contractId") ?? "");
  if (!contractId) return { error: "Mudança inválida." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length > REASON_MAX) return { error: `O motivo pode ter no máximo ${REASON_MAX} caracteres.` };

  const result = await voidScheduledChange({ contractId, reason: reason || null });
  if (!result.ok) return { error: result.error };

  revalidateStudent(clientId);
  return { ok: true, doneAt: Date.now() };
}
