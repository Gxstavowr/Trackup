"use server";

import { revalidatePath } from "next/cache";
import {
  createClient as createClientRecord,
  sendInvite as sendInviteRecord,
} from "@/lib/repository";
import { actionErrorMessage } from "@/lib/action-errors";
import { getOrigin } from "@/lib/site-url";
import { isCurrentCoachDemo } from "@/lib/demo";
import { getCoachServicePrices, isBillingPeriod, parsePriceToCents } from "@/lib/onboarding/prices";
import { isPackageId, PACKAGE_IDS, type BillingPeriod, type PackageId } from "@/lib/onboarding/packages";
import {
  createInvitedClient,
  findClientByEmail,
  getInviteStatus,
  recordInviteLinkCopied,
  sendInviteEmail,
  type ExistingClientRef,
  type InviteStatusInfo,
  type SendInviteResult,
} from "@/lib/onboarding/invites";
import { requireActiveCoach, requireCoach } from "../require-coach";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function revalidateStudents(clientId?: string) {
  revalidatePath("/coach/alunos");
  revalidatePath("/coach");
  if (clientId) revalidatePath(`/coach/alunos/${clientId}`);
}

async function inviteUrlFor(clientId: string): Promise<string> {
  return `${await getOrigin()}/convite?id=${clientId}`;
}

// ---------------------------------------------------------------------------
// Opções do formulário "Adicionar aluno"
// ---------------------------------------------------------------------------

export type PackagePriceOption = { priceCents: number; billingPeriod: BillingPeriod } | null;

export type AddClientOptions = {
  /** `v5` = pacotes + convite por e-mail (0022 aplicada); `legacy` = criação antiga (só contato). */
  flow: "v5" | "legacy";
  prices: Record<PackageId, PackagePriceOption>;
  isDemo: boolean;
};

/** Preços padrão do coach e qual fluxo está disponível — lidos ao abrir o formulário. */
export async function getAddClientOptionsAction(): Promise<AddClientOptions> {
  await requireCoach();
  const [{ prices, available }, isDemo] = await Promise.all([getCoachServicePrices(), isCurrentCoachDemo()]);
  const byPackage = Object.fromEntries(
    PACKAGE_IDS.map((id) => {
      const p = prices[id];
      return [id, p ? { priceCents: p.priceCents, billingPeriod: p.billingPeriod } : null];
    })
  ) as Record<PackageId, PackagePriceOption>;
  return { flow: available ? "v5" : "legacy", prices: byPackage, isDemo };
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export type DuplicateClient = ExistingClientRef & { inviteUrl: string };

export type CreateClientState =
  | null
  | { status: "error"; error: string }
  | { status: "duplicate"; error: string; existing: DuplicateClient | null }
  | {
      status: "created";
      clientId: string;
      name: string;
      inviteUrl: string;
      /** `null` = fluxo antigo (sem envio por e-mail: o coach copia o link). */
      invite: SendInviteResult | null;
    };

async function duplicateState(existing: ExistingClientRef | null): Promise<CreateClientState> {
  return {
    status: "duplicate",
    error: existing
      ? `Já existe um aluno com esse e-mail: ${existing.name}.`
      : "Já existe um aluno com esse e-mail na sua conta.",
    existing: existing ? { ...existing, inviteUrl: await inviteUrlFor(existing.id) } : null,
  };
}

function isDuplicateKeyMessage(message: string): boolean {
  return /23505|duplicate key|clients_account_email_uidx/i.test(message);
}

/** Fluxo antigo (0022 não aplicada): cria só com os dados de contato, sem pacote e sem e-mail. */
async function createLegacy(input: { name: string; email: string; phone: string }): Promise<CreateClientState> {
  if (input.email) {
    const existing = await findClientByEmail(input.email);
    if (existing) return duplicateState(existing);
  }
  try {
    const created = await createClientRecord({
      name: input.name,
      email: input.email || undefined,
      phone: input.phone || undefined,
    });
    revalidateStudents();
    return { status: "created", clientId: created.id, name: created.name, inviteUrl: await inviteUrlFor(created.id), invite: null };
  } catch (err) {
    if (err instanceof Error && isDuplicateKeyMessage(err.message)) {
      return duplicateState(input.email ? await findClientByEmail(input.email) : null);
    }
    return { status: "error", error: actionErrorMessage(err, "Não foi possível criar o aluno.") };
  }
}

/**
 * Server Action do formulário compacto "Adicionar aluno" (itens 7–8 do TODO V5): nome, e-mail,
 * telefone e pacote. Cria o aluno com o contrato inicial (RPC `create_invited_client`) e em seguida
 * envia o convite por e-mail. O resultado do envio é devolvido como veio: a tela só diz "Convite
 * enviado" quando o envio deu certo. O protocolo NÃO é ativado aqui (o aluno ainda vai responder o
 * questionário e o coach publicar os planos). Sem a migração 0022, cai no fluxo antigo.
 */
export async function createClientAction(
  _prevState: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  await requireActiveCoach();

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();

  if (name.length < 2) return { status: "error", error: "Informe o nome do aluno." };
  if (name.length > 80) return { status: "error", error: "O nome está longo demais (até 80 caracteres)." };
  if (email && (!EMAIL_RE.test(email) || email.length > 320)) {
    return { status: "error", error: "Informe um e-mail válido." };
  }
  if (phone.length > 25) return { status: "error", error: "Informe um telefone válido." };

  // A tela pode ter carregado antes da migração: o servidor decide de novo qual fluxo vale.
  const { prices, available } = await getCoachServicePrices();
  if (!available) return createLegacy({ name, email, phone });

  if (!email) return { status: "error", error: "Informe o e-mail do aluno: é para ele que o convite vai." };
  const pkg = String(formData.get("package") || "");
  if (!isPackageId(pkg)) return { status: "error", error: "Escolha o pacote do aluno: Treino, Nutrição ou Híbrido." };

  // Preço: o padrão configurado vale (relido aqui, nunca o que veio do navegador). Sem padrão, o coach
  // define o valor no próprio formulário e pode salvá-lo como padrão do pacote.
  let priceCents: number;
  let billingPeriod: BillingPeriod;
  let saveAsDefault = false;
  const configured = prices[pkg];
  if (configured) {
    priceCents = configured.priceCents;
    billingPeriod = configured.billingPeriod;
  } else {
    const parsed = parsePriceToCents(String(formData.get("price") || ""));
    if (parsed === null) {
      return { status: "error", error: "Defina o valor do pacote (ex.: 250 ou 1.250,00)." };
    }
    const period = String(formData.get("billingPeriod") || "monthly");
    if (!isBillingPeriod(period)) return { status: "error", error: "Escolha um período de cobrança válido." };
    priceCents = parsed;
    billingPeriod = period;
    saveAsDefault = formData.get("saveAsDefault") === "on";
  }

  const created = await createInvitedClient({ name, email, phone, package: pkg, priceCents, billingPeriod, saveAsDefault });
  if (!created.ok) {
    if (created.reason === "unavailable") return createLegacy({ name, email, phone });
    if (created.reason === "duplicate") return duplicateState(created.existing);
    return { status: "error", error: created.error };
  }

  const invite = await sendInviteEmail(created.clientId);
  revalidateStudents(created.clientId);
  if (saveAsDefault) revalidatePath("/coach/configuracoes");
  return { status: "created", clientId: created.clientId, name, inviteUrl: await inviteUrlFor(created.clientId), invite };
}

// ---------------------------------------------------------------------------
// Convite: reenviar, copiar, situação
// ---------------------------------------------------------------------------

/** Envia/reenvia o convite por e-mail (retomar um convite pendente). */
export async function resendInviteAction(clientId: string): Promise<SendInviteResult> {
  await requireActiveCoach();
  const result = await sendInviteEmail(String(clientId || ""));
  revalidateStudents(clientId);
  return result;
}

/** Registra a cópia do link do convite na trilha (best-effort). */
export async function recordInviteCopiedAction(clientId: string): Promise<void> {
  await requireActiveCoach();
  await recordInviteLinkCopied(String(clientId || ""));
}

/** Situação do convite para o perfil do aluno. */
export async function getInviteStatusAction(clientId: string): Promise<InviteStatusInfo | null> {
  await requireCoach();
  return getInviteStatus(String(clientId || ""));
}

/**
 * Marca o convite como enviado (coach confirmando que copiou/mandou o link manualmente —
 * ver `sendInvite` em `lib/repository.ts`). Usada num `<form action={...}>` simples com
 * `clientId` num input escondido, mesmo padrão do `acceptInvite` em `app/convite/actions.ts`.
 */
export async function sendInviteAction(formData: FormData): Promise<void> {
  await requireActiveCoach();
  const clientId = String(formData.get("clientId") || "");
  if (!clientId) return;

  await sendInviteRecord(clientId);
  revalidatePath("/coach/alunos");
  revalidatePath("/coach");
}
