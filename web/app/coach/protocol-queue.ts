import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/onboarding/db-error";
import { isPackageId, packageLabel } from "@/lib/onboarding/packages";
import { deriveOnboardingStage } from "@/lib/onboarding/stage";
import type { OnboardingRow } from "./alunos/student-situation";

/**
 * Fila de protocolos a preparar (V5, itens 4/12/17): alunos que já enviaram o questionário inicial
 * e ainda não têm o protocolo completo. Lê a view `client_onboarding_status` (0022,
 * `security_invoker`) com o cliente do usuário — a RLS limita aos alunos da conta — e NUNCA as
 * respostas do questionário. Sem a view (migração pendente) devolve lista vazia (legado); qualquer outro
 * erro devolve `available: false` para a tela dizer "não foi possível carregar" em vez de "nenhum".
 */
export type ProtocolPendingStudent = {
  clientId: string;
  name: string;
  /** Pacote contratado (ex.: "Treino", "Nutrição", "Híbrido"). */
  packageLabel: string;
  /** Quando o questionário foi recebido (ISO). */
  receivedAt: string;
  /** Prazo previsto de entrega do protocolo (ISO), gravado no envio (envio + 3 dias). */
  dueAt: string;
  /** Prazo vencido e protocolo ainda não concluído. */
  overdue: boolean;
};

const VIEW_COLUMNS =
  "client_id, name, has_account, onboarding_required, invite_status, package, questionnaire_id, " +
  "questionnaire_status, questionnaire_opened_at, questionnaire_submitted_at, protocol_due_at, " +
  "training_published, nutrition_published, training_draft, nutrition_draft, " +
  "invite_last_sent_at, invite_last_failed_at, invite_accepted_at";

type ViewRow = OnboardingRow & { name: string };

export type OnboardingRowsResult = { available: boolean; rows: ViewRow[] };

/**
 * Todas as linhas da view visíveis ao coach logado. `cache()` evita ir duas vezes ao banco na
 * mesma requisição (Alunos + Acompanhamento). View inexistente -> `{ available: true, rows: [] }`
 * (legado); outro erro -> `{ available: false, rows: [] }`.
 */
export const getOnboardingRows = cache(async (): Promise<OnboardingRowsResult> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("client_onboarding_status").select(VIEW_COLUMNS);
    if (error) {
      if (isMissingSchemaError(error)) return { available: true, rows: [] };
      console.error("getOnboardingRows falhou:", error.code);
      return { available: false, rows: [] };
    }
    if (!Array.isArray(data)) return { available: false, rows: [] };
    return {
      available: true,
      rows: (data as unknown as ViewRow[]).map((row) => ({
        ...row,
        package: isPackageId(row.package) ? row.package : null,
      })),
    };
  } catch (err) {
    console.error("getOnboardingRows falhou:", err);
    return { available: false, rows: [] };
  }
});

/** Linha da view de um único aluno (aba "Questionário" do perfil). `null` sem a view, sem linha ou com erro. */
export const getClientOnboardingRow = cache(async (clientId: string): Promise<ViewRow | null> => {
  const { rows } = await getOnboardingRows();
  return rows.find((r) => r.client_id === clientId) ?? null;
});

const AWAITING_PROTOCOL = new Set(["questionnaire_submitted", "protocol_preparing", "protocol_partial"]);

export async function getProtocolPendingStudents(): Promise<{ available: boolean; students: ProtocolPendingStudent[] }> {
  const { available, rows } = await getOnboardingRows();
  const now = new Date();
  const out: ProtocolPendingStudent[] = [];
  for (const row of rows) {
    const info = deriveOnboardingStage(row, now);
    if (!AWAITING_PROTOCOL.has(info.stage)) continue;
    if (!info.dueAt || !row.questionnaire_submitted_at) continue;
    out.push({
      clientId: row.client_id,
      name: row.name,
      packageLabel: packageLabel(row.package),
      receivedAt: new Date(row.questionnaire_submitted_at).toISOString(),
      dueAt: info.dueAt.toISOString(),
      overdue: info.isOverdue,
    });
  }
  // Prazo mais próximo (ou já vencido) primeiro.
  out.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.name.localeCompare(b.name, "pt-BR"));
  return { available, students: out };
}
