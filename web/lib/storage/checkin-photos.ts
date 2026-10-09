import "server-only";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHECKIN_PHOTOS_BUCKET,
  MAX_PHOTO_BYTES,
  buildPhotoPath,
  ensureCheckinPhotosBucket,
  isOwnedPhotoPath,
  isPhotoAngle,
  type PhotoAngle,
} from "./buckets";

/**
 * Fotos de check-in: upload (aluno) e leitura assinada (aluno + coach dono).
 *
 * CONTROLE DE ACESSO — feito AQUI, no servidor, ANTES de qualquer operação de Storage:
 *  1. A sessão é validada com `auth.getUser()` (valida o JWT no Auth server).
 *  2. Toda leitura de linha de negócio (`clients`, `checkin_instances`, `photos`) usa o
 *     client AUTENTICADO (RLS ligado) — o Postgres já garante o isolamento por conta/aluno.
 *  3. Só depois disso o client ADMIN (service role) é usado, e SOMENTE pra falar com o
 *     Storage (subir o objeto / assinar a URL), porque ainda não há policy em
 *     `storage.objects`. O admin nunca lê nem escreve tabela de negócio aqui.
 * Uma URL assinada é uma capability: quem a tem, lê o objeto até ela expirar. Por isso o
 * TTL é curto (`SIGNED_URL_TTL_SECONDS`) e ela só é gerada depois das checagens acima.
 */

/** Validade da URL assinada. Curta de propósito; a página gera URLs novas a cada render. */
export const SIGNED_URL_TTL_SECONDS = 600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CheckinPhoto = {
  id: string;
  week_number: number;
  angle: PhotoAngle;
  created_at: string;
  /** URL assinada de curta duração; `null` se o objeto não existe mais no bucket. */
  url: string | null;
};

type ClientRow = {
  id: string;
  account_id: string;
  coach_id: string;
  auth_user_id: string | null;
};

type Viewer = "client" | "coach";

/**
 * Resolve quem está pedindo e se tem direito às fotos do `clientId`:
 *  - "client": a linha do aluno tem `auth_user_id` = usuário logado (só a PRÓPRIA foto).
 *  - "coach": usuário tem linha em `coach_users` na MESMA conta do aluno E é o coach dono
 *    (`clients.coach_id`) ou `admin` da conta. Isso é um pouco mais estrito que o RLS de
 *    `clients` (que libera a conta inteira), de propósito: foto corporal é o dado mais
 *    sensível do app.
 * `null` = sem acesso (inclui "não existe" — não distingue, pra não vazar existência).
 */
async function resolveAccess(
  clientId: string
): Promise<{ viewer: Viewer; client: ClientRow; userId: string } | null> {
  if (!UUID_RE.test(clientId)) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS (`clients_coach_full_access` / `clients_self_read`): só devolve a linha se o
  // usuário for coach da conta ou o próprio aluno.
  const { data: client } = await supabase
    .from("clients")
    .select("id, account_id, coach_id, auth_user_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return null;
  const row = client as ClientRow;

  if (row.auth_user_id && row.auth_user_id === user.id) {
    return { viewer: "client", client: row, userId: user.id };
  }

  const { data: coach } = await supabase
    .from("coach_users")
    .select("id, account_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (
    coach &&
    coach.account_id === row.account_id &&
    (row.coach_id === user.id || coach.role === "admin")
  ) {
    return { viewer: "coach", client: row, userId: user.id };
  }

  return null;
}

/** Assina (em lote) os paths já validados; devolve mapa path -> URL assinada. */
async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;

  await ensureCheckinPhotosBucket();
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(CHECKIN_PHOTOS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) {
    throw new Error(`Não foi possível gerar as URLs das fotos: ${error.message}`);
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) result.set(item.path, item.signedUrl);
  }
  return result;
}

/**
 * Lista as fotos de um aluno (opcionalmente só de uma semana) com URLs assinadas.
 * Devolve `null` quando o chamador não tem acesso ao aluno (a UI trata como 404).
 */
export async function listClientPhotos(
  clientId: string,
  opts: { weekNumber?: number } = {}
): Promise<CheckinPhoto[] | null> {
  const access = await resolveAccess(clientId);
  if (!access) return null;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("photos")
    .select("id, week_number, angle, storage_path, created_at")
    .eq("client_id", clientId)
    .order("week_number", { ascending: false });
  if (opts.weekNumber !== undefined) query = query.eq("week_number", opts.weekNumber);

  const { data, error } = await query;
  if (error) throw new Error(`Não foi possível carregar as fotos: ${error.message}`);

  const rows = (data ?? []) as {
    id: string;
    week_number: number;
    angle: PhotoAngle;
    storage_path: string;
    created_at: string;
  }[];

  // Só assina o que segue o formato canônico e pertence a este aluno (ver isOwnedPhotoPath).
  const owned = rows.filter((r) =>
    isOwnedPhotoPath(r.storage_path, access.client.account_id, access.client.id)
  );
  const signed = await signPaths(owned.map((r) => r.storage_path));

  return owned.map((r) => ({
    id: r.id,
    week_number: r.week_number,
    angle: r.angle,
    created_at: r.created_at,
    url: signed.get(r.storage_path) ?? null,
  }));
}

/** Fotos da semana de um check-in específico (usado pelo formulário do aluno). */
export async function listPhotosForCheckin(checkinId: string): Promise<CheckinPhoto[] | null> {
  if (!UUID_RE.test(checkinId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data: instance } = await supabase
    .from("checkin_instances")
    .select("client_id, week_number")
    .eq("id", checkinId)
    .maybeSingle();
  if (!instance) return null;
  return listClientPhotos(instance.client_id, { weekNumber: instance.week_number });
}

export type UploadPhotoResult = { photo: CheckinPhoto };

/** Bytes iniciais de um JPEG (SOI + marcador). */
function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Upload de UMA foto pelo ALUNO dentro do check-in semanal. Só o próprio aluno, só na
 * própria instância de check-in, e só enquanto ela não foi enviada (`pending`/`late`).
 * Reenviar o mesmo ângulo substitui a foto (mesmo path, `upsert`) — sem duplicar linhas.
 * Lança `Error` com mensagem em português pra UI mostrar.
 */
export async function uploadCheckinPhoto(input: {
  checkinId: string;
  angle: unknown;
  file: File | null;
}): Promise<UploadPhotoResult> {
  const { checkinId, file } = input;
  if (!isPhotoAngle(input.angle)) throw new Error("Posição da foto inválida.");
  const angle = input.angle;
  if (!UUID_RE.test(checkinId)) throw new Error("Check-in inválido.");
  if (!file || file.size === 0) throw new Error("Nenhuma foto enviada.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("A foto é grande demais.");

  const supabase = await createSupabaseServerClient();

  // O check-in precisa ser visível pra sessão (RLS) — e o dono precisa ser o PRÓPRIO aluno
  // (o coach também enxerga a instância via RLS, mas não sobe foto em nome do aluno).
  const { data: instance } = await supabase
    .from("checkin_instances")
    .select("id, client_id, week_number, status")
    .eq("id", checkinId)
    .maybeSingle();
  if (!instance) throw new Error("Check-in inválido.");

  const access = await resolveAccess(instance.client_id);
  if (!access || access.viewer !== "client") {
    throw new Error("Você não tem permissão para enviar fotos neste check-in.");
  }
  if (instance.status !== "pending" && instance.status !== "late") {
    throw new Error("Este check-in já foi enviado — não dá mais para trocar as fotos.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeJpeg(bytes)) throw new Error("Formato inválido — envie uma imagem JPEG.");

  const { account_id: accountId, id: clientId } = access.client;
  const path = buildPhotoPath(accountId, clientId, instance.week_number, angle);

  await ensureCheckinPhotosBucket();
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(CHECKIN_PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (uploadError) throw new Error(`Não foi possível salvar a foto: ${uploadError.message}`);

  // Linha em `photos` (client autenticado, RLS `photos_by_client`). Não há unique em
  // (client_id, week_number, angle), então "upsert" é feito na mão: atualiza a existente
  // (e apaga eventuais duplicatas de corrida) ou insere.
  const { data: existing, error: existingError } = await supabase
    .from("photos")
    .select("id")
    .eq("client_id", clientId)
    .eq("week_number", instance.week_number)
    .eq("angle", angle)
    .order("created_at", { ascending: true });
  if (existingError) throw new Error(`Não foi possível registrar a foto: ${existingError.message}`);

  const now = new Date().toISOString();
  let photoId: string;
  let createdAt = now;

  if (existing && existing.length > 0) {
    photoId = existing[0].id;
    const { error } = await supabase
      .from("photos")
      .update({ checkin_id: instance.id, storage_path: path, created_at: now })
      .eq("id", photoId);
    if (error) throw new Error(`Não foi possível registrar a foto: ${error.message}`);
    if (existing.length > 1) {
      await supabase
        .from("photos")
        .delete()
        .in(
          "id",
          existing.slice(1).map((r) => r.id)
        );
    }
  } else {
    const { data: inserted, error } = await supabase
      .from("photos")
      .insert({
        client_id: clientId,
        checkin_id: instance.id,
        week_number: instance.week_number,
        angle,
        storage_path: path,
      })
      .select("id, created_at")
      .single();
    if (error || !inserted) {
      // Não deixa objeto órfão no bucket se o registro falhou (best-effort).
      await admin.storage.from(CHECKIN_PHOTOS_BUCKET).remove([path]);
      throw new Error(`Não foi possível registrar a foto: ${error?.message ?? "erro desconhecido"}`);
    }
    photoId = inserted.id;
    createdAt = inserted.created_at;
  }

  const signed = await signPaths([path]);
  return {
    photo: {
      id: photoId,
      week_number: instance.week_number,
      angle,
      created_at: createdAt,
      url: signed.get(path) ?? null,
    },
  };
}
