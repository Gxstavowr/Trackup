import "server-only";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHECKIN_PHOTOS_BUCKET, MAX_PHOTO_BYTES, ensureCheckinPhotosBucket } from "./buckets";

/**
 * Foto de refeição do aluno (item 21 do master TODO — "enviar foto/refeição quando
 * habilitado"). Reaproveita o MESMO bucket privado das fotos de check-in (`checkin-photos`,
 * `lib/storage/buckets.ts` — lido, nunca editado), com um prefixo de path próprio:
 * `{account_id}/{client_id}/meals/{log_date}/{meal_id}.jpg`. Criar um bucket novo exigiria
 * chamar `admin.storage.createBucket` fora do fluxo normal da aplicação; reaproveitar o
 * existente é só código de aplicação (nenhum script ad-hoc, nenhuma chamada nova de
 * infraestrutura). "Quando habilitado": o schema não tem uma coluna de config pra ligar/
 * desligar esse recurso por plano — a foto é sempre opcional pro aluno (`storage_path`
 * nullable em `meal_logs`, 0003 B.3); não existe hoje um botão do coach pra exigi-la ou
 * escondê-la, então "habilitado" = "disponível", sempre.
 *
 * MODELO DE ACESSO — mesmo padrão de `lib/storage/checkin-photos.ts` (lido como referência,
 * nunca editado): a sessão é validada e o vínculo aluno -> `clientId` é confirmado com o
 * client AUTENTICADO (RLS) ANTES de qualquer chamada ao client ADMIN — o admin aqui só fala
 * com o Storage (subir o objeto / assinar a URL), nunca lê/escreve tabela de negócio.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validade da URL assinada — curta de propósito, mesma escolha do check-in. */
export const MEAL_PHOTO_TTL_SECONDS = 600;

export function buildMealPhotoPath(accountId: string, clientId: string, logDate: string, mealId: string): string {
  return `${accountId}/${clientId}/meals/${logDate}/${mealId}.jpg`;
}

/** `true` só se `storagePath` segue exatamente o formato canônico E pertence à
 * conta/aluno informados — mesma defesa em profundidade de `isOwnedPhotoPath` (check-in):
 * a policy de `meal_logs` deixa o próprio aluno gravar qualquer `storage_path` sob o prefixo
 * `account_id/client_id/`, então antes de assinar um path que veio do banco é preciso
 * confirmar que ele é mesmo uma foto de refeição válida, não outra coisa qualquer sob o
 * mesmo prefixo. */
export function isOwnedMealPhotoPath(storagePath: string, accountId: string, clientId: string): boolean {
  const prefix = `${accountId}/${clientId}/meals/`;
  if (!storagePath.startsWith(prefix)) return false;
  return /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg$/i.test(storagePath.slice(prefix.length));
}

/** Bytes iniciais de um JPEG (SOI + marcador) — mesma checagem do check-in. */
function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Confirma que o usuário autenticado É o aluno `clientId` — nunca confia no valor recebido
 * do FormData sem checar contra a sessão real. `null` = sem acesso (inclui "não existe"). */
async function resolveOwnClient(clientId: string): Promise<{ accountId: string } | null> {
  if (!UUID_RE.test(clientId)) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("id, account_id, auth_user_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || client.auth_user_id !== user.id) return null;

  return { accountId: client.account_id as string };
}

export type UploadMealPhotoResult = { storagePath: string; url: string | null };

/**
 * Upload de UMA foto de refeição pelo próprio aluno. Reenviar a mesma refeição/dia substitui
 * a foto (mesmo path, `upsert`) — sem objeto órfão. Lança `Error` com mensagem em português
 * pra UI mostrar; quem grava `storage_path` em `meal_logs` é o chamador (Server Action), esta
 * função só cuida do Storage.
 */
export async function uploadMealPhoto(input: {
  clientId: string;
  mealId: string;
  logDate: string;
  file: File | null;
}): Promise<UploadMealPhotoResult> {
  const { clientId, mealId, logDate, file } = input;
  if (!UUID_RE.test(mealId)) throw new Error("Refeição inválida.");
  if (!DATE_RE.test(logDate)) throw new Error("Data inválida.");
  if (!file || file.size === 0) throw new Error("Nenhuma foto enviada.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("A foto é grande demais.");

  const access = await resolveOwnClient(clientId);
  if (!access) throw new Error("Você não tem permissão para enviar essa foto.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeJpeg(bytes)) throw new Error("Formato inválido — envie uma imagem JPEG.");

  const path = buildMealPhotoPath(access.accountId, clientId, logDate, mealId);

  await ensureCheckinPhotosBucket();
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(CHECKIN_PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (uploadError) throw new Error(`Não foi possível salvar a foto: ${uploadError.message}`);

  const { data: signedData, error: signError } = await admin.storage
    .from(CHECKIN_PHOTOS_BUCKET)
    .createSignedUrl(path, MEAL_PHOTO_TTL_SECONDS);
  if (signError) {
    // A foto já subiu — não falha a operação por causa disso, só não devolve preview agora.
    return { storagePath: path, url: null };
  }

  return { storagePath: path, url: signedData?.signedUrl ?? null };
}

/** URL assinada de uma foto de refeição já registrada (`meal_logs.storage_path`) — usada só
 * pra o aluno confirmar visualmente o que já enviou. `storagePath` sempre vem do banco, nunca
 * do cliente; ainda assim é revalidado contra o formato canônico antes de assinar. */
export async function getMealPhotoUrl(clientId: string, storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null;
  const access = await resolveOwnClient(clientId);
  if (!access) return null;
  if (!isOwnedMealPhotoPath(storagePath, access.accountId, clientId)) return null;

  await ensureCheckinPhotosBucket();
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(CHECKIN_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, MEAL_PHOTO_TTL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
}
