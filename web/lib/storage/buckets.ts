import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Storage real das fotos de check-in (item 5 do master TODO).
 *
 * Um único bucket PRIVADO (`public: false`) com o `account_id` como primeiro segmento do
 * path — `{account_id}/{client_id}/week-{n}/{front|back|side}.jpg`. Um bucket por conta
 * (como o ARCHITECTURE.md descreve) seria criar/gerenciar N buckets sem ganho: o isolamento
 * vem do prefixo `account_id/` (e é exatamente esse prefixo que uma policy futura de
 * `storage.objects` usaria via `storage.foldername(name)`).
 *
 * MODELO DE ACESSO (importante): hoje NÃO existe policy de RLS em `storage.objects` (a
 * migration de storage ainda não foi aplicada) e o bucket é privado, então NINGUÉM além da
 * service role consegue ler/escrever objetos direto. Todo acesso passa por
 * `lib/storage/checkin-photos.ts`, que verifica sessão + vínculo (aluno -> próprio
 * registro / coach -> aluno da própria conta) ANTES de usar o client admin pra subir o
 * arquivo ou assinar a URL. Mesmo padrão de uso pontual do admin já documentado em
 * `lib/repository.ts` (`getTemplateWithQuestions`) e `app/auth/callback/route.ts`.
 */
export const CHECKIN_PHOTOS_BUCKET = "checkin-photos";

/** Teto por objeto no bucket (defesa em profundidade — a action já limita a ~1MB). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type PhotoAngle = "front" | "back" | "side";
export const PHOTO_ANGLES: readonly PhotoAngle[] = ["front", "back", "side"];

export function isPhotoAngle(value: unknown): value is PhotoAngle {
  return typeof value === "string" && (PHOTO_ANGLES as readonly string[]).includes(value);
}

/** Path canônico do objeto no bucket. Sempre gerado no servidor, nunca vem do cliente. */
export function buildPhotoPath(
  accountId: string,
  clientId: string,
  weekNumber: number,
  angle: PhotoAngle
): string {
  return `${accountId}/${clientId}/week-${weekNumber}/${angle}.jpg`;
}

/**
 * `true` só se `storagePath` tem exatamente o formato canônico E pertence à conta/aluno
 * informados. Necessário porque a policy `photos_by_client` deixa o próprio aluno gravar
 * qualquer `storage_path` na tabela `photos` (via API REST com o token dele) — sem essa
 * checagem, assinar o path que veio do banco poderia vazar a foto de outro aluno/conta.
 */
export function isOwnedPhotoPath(
  storagePath: string,
  accountId: string,
  clientId: string
): boolean {
  const prefix = `${accountId}/${clientId}/`;
  if (!storagePath.startsWith(prefix)) return false;
  return /^week-\d+\/(front|back|side)\.jpg$/.test(storagePath.slice(prefix.length));
}

let ensuredBucket: Promise<void> | null = null;

/**
 * Garante (idempotente) que o bucket privado existe. Cria via client admin na primeira
 * necessidade — o usuário não precisa criar nada no painel. Se o bucket já existir mas
 * estiver público por engano, é forçado de volta pra privado. Memoizado por processo; em
 * caso de falha o cache é descartado pra tentar de novo na próxima chamada.
 */
export function ensureCheckinPhotosBucket(): Promise<void> {
  if (!ensuredBucket) {
    ensuredBucket = doEnsureBucket().catch((err) => {
      ensuredBucket = null;
      throw err;
    });
  }
  return ensuredBucket;
}

async function doEnsureBucket(): Promise<void> {
  const admin = createAdminClient();
  const options = {
    public: false,
    fileSizeLimit: MAX_PHOTO_BYTES,
    allowedMimeTypes: ["image/jpeg"],
  };

  const { data: existing } = await admin.storage.getBucket(CHECKIN_PHOTOS_BUCKET);

  if (existing) {
    if (existing.public) {
      const { error } = await admin.storage.updateBucket(CHECKIN_PHOTOS_BUCKET, options);
      if (error) throw new Error(`Não foi possível tornar o bucket privado: ${error.message}`);
    }
    return;
  }

  const { error } = await admin.storage.createBucket(CHECKIN_PHOTOS_BUCKET, options);
  // Corrida entre duas requisições criando ao mesmo tempo -> o segundo recebe "já existe".
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Não foi possível criar o bucket de fotos: ${error.message}`);
  }
}
