import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHECKIN_PHOTOS_BUCKET, isOwnedPhotoPath } from "@/lib/storage/buckets";
import { isOwnedMealPhotoPath } from "@/lib/storage/meal-photos";
import { LEGAL_VERSION } from "@/lib/legal/documents";

/**
 * Direitos do titular sobre os dados de UM aluno (LGPD art. 18, II, V e VI):
 *  - `buildClientExport`: tudo que existe sobre o aluno, em JSON estruturado (acesso +
 *    portabilidade). Lê SEMPRE com o client autenticado de quem pede — o RLS é quem garante que
 *    o aluno só exporta a si mesmo e o coach só exporta alunos da própria conta.
 *  - `deleteClientCompletely`: exclusão definitiva (banco + fotos no Storage + login do aluno).
 *
 * Mantenha `EXPORT_TABLES` em sincronia com toda tabela nova que guarde dado do aluno
 * (`docs/lgpd.md`, inventário).
 */

const EXPORT_TABLES: { key: string; table: string; select: string }[] = [
  { key: "checkins", table: "checkin_instances", select: "*, checkin_answers(*)" },
  { key: "photos", table: "photos", select: "*" },
  { key: "metrics", table: "metrics", select: "*" },
  { key: "metric_settings", table: "client_metric_settings", select: "*" },
  { key: "metric_setting_changes", table: "client_metric_setting_changes", select: "*" },
  { key: "goals", table: "goals", select: "*" },
  { key: "orientations", table: "orientations", select: "*" },
  { key: "history", table: "history_events", select: "*" },
  { key: "workout_plans", table: "workout_plans", select: "*, workout_days(*, workout_exercises(*))" },
  { key: "workout_sessions", table: "workout_sessions", select: "*" },
  { key: "workout_logs", table: "workout_logs", select: "*" },
  {
    key: "nutrition_plans",
    table: "nutrition_plans",
    select: "*, meals(*, meal_items(*, meal_substitutions(*)))",
  },
  { key: "meal_logs", table: "meal_logs", select: "*" },
  { key: "water_logs", table: "water_logs", select: "*" },
  { key: "subscriptions", table: "subscriptions", select: "*, payments(*, payment_events(*))" },
  { key: "notifications", table: "notifications", select: "*" },
  { key: "consents", table: "consent_records", select: "*" },
  { key: "privacy_requests", table: "data_subject_requests", select: "*" },
];

/** Validade dos links das fotos dentro do arquivo exportado. */
const EXPORT_PHOTO_TTL_SECONDS = 60 * 60;

export async function buildClientExport(
  supabase: SupabaseClient,
  clientId: string
): Promise<Record<string, unknown> | null> {
  const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (!client) return null;

  const sections: Record<string, unknown> = {};
  const errors: string[] = [];

  await Promise.all(
    EXPORT_TABLES.map(async ({ key, table, select }) => {
      const { data, error } = await supabase.from(table).select(select).eq("client_id", clientId);
      if (error) {
        errors.push(`${table}: ${error.message}`);
        sections[key] = [];
      } else {
        sections[key] = data ?? [];
      }
    })
  );

  // Fotos: o arquivo leva links assinados de 1h pra cada imagem (só paths que passam na mesma
  // checagem de posse usada pra exibir — nunca assina um path arbitrário vindo do banco).
  const accountId = client.account_id as string;
  const paths = [
    ...((sections.photos as { storage_path: string }[]) ?? [])
      .map((p) => p.storage_path)
      .filter((p) => isOwnedPhotoPath(p, accountId, clientId)),
    ...((sections.meal_logs as { storage_path: string | null }[]) ?? [])
      .map((m) => m.storage_path)
      .filter((p): p is string => !!p && isOwnedMealPhotoPath(p, accountId, clientId)),
  ];
  let photoLinks: { path: string; url: string | null }[] = [];
  if (paths.length > 0) {
    const { data } = await createAdminClient()
      .storage.from(CHECKIN_PHOTOS_BUCKET)
      .createSignedUrls(paths, EXPORT_PHOTO_TTL_SECONDS);
    photoLinks = (data ?? []).map((d) => ({ path: d.path ?? "", url: d.signedUrl ?? null }));
  }

  return {
    format: "trackly-export/v1",
    generated_at: new Date().toISOString(),
    legal_basis_note:
      "Exportação dos dados pessoais do titular (LGPD art. 18, II e V). Links de fotos expiram em 1 hora.",
    policy_version: LEGAL_VERSION,
    profile: client,
    ...sections,
    photo_files: photoLinks,
    ...(errors.length > 0 ? { incomplete_sections: errors } : {}),
  };
}

/** Lista recursiva (até 4 níveis) de objetos sob um prefixo do bucket. */
async function listObjects(admin: SupabaseClient, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const { data, error } = await admin.storage
    .from(CHECKIN_PHOTOS_BUCKET)
    .list(prefix, { limit: 1000 });
  if (error) throw new Error(`Não foi possível listar fotos: ${error.message}`);

  const out: string[] = [];
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    // Pastas no Storage vêm sem `id`.
    if (entry.id) out.push(path);
    else out.push(...(await listObjects(admin, path, depth + 1)));
  }
  return out;
}

/**
 * Exclusão definitiva de um aluno, executada pelo COACH (controlador). A posse é confirmada com o
 * client AUTENTICADO do coach (RLS `clients_coach_full_access`) antes de qualquer uso do admin.
 * Ordem: fotos no Storage -> linha em `clients` (cascade apaga todo dado de negócio) -> login
 * do aluno em auth.users. `consent_records`/`data_subject_requests` ficam (sem FK, de propósito)
 * como prova de que o consentimento existiu e de que a exclusão foi atendida.
 */
export async function deleteClientCompletely(
  supabase: SupabaseClient,
  clientId: string
): Promise<void> {
  const { data: client } = await supabase
    .from("clients")
    .select("id, account_id, auth_user_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) throw new Error("Aluno não encontrado nesta conta.");

  const admin = createAdminClient();
  const objects = await listObjects(admin, `${client.account_id}/${client.id}`);
  for (let i = 0; i < objects.length; i += 100) {
    const { error } = await admin.storage.from(CHECKIN_PHOTOS_BUCKET).remove(objects.slice(i, i + 100));
    if (error) throw new Error(`Não foi possível apagar as fotos: ${error.message}`);
  }

  const { error: deleteError } = await supabase.from("clients").delete().eq("id", client.id);
  if (deleteError) throw new Error(`Não foi possível apagar o aluno: ${deleteError.message}`);

  if (client.auth_user_id) {
    const { error } = await admin.auth.admin.deleteUser(client.auth_user_id);
    if (error) console.error("Aluno apagado, mas o login não foi removido:", error.message);
  }
}
