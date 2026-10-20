import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Lógica pura do cookie do laboratório (`trackly_lab`) — itens 26–28 do TODO V5, §10 do plano.
 * Sem `server-only` para poder ser testada com `node --test`; só é importada por `lib/admin/lab.ts`.
 *
 * Formato: `v1.<payload>.<cofre>.<mac>` (base64url).
 * - payload: `{ u: adminUserId, p: perfil, iat, exp }` (segundos) — sem nada sensível.
 * - cofre: refresh token da sessão ORIGINAL do admin, cifrado com AES-256-GCM. Sem ele não há como
 *   restaurar a sessão: o cookie sozinho NÃO dá acesso de admin — quem valida o token é o Supabase
 *   Auth, e o servidor ainda confere que o usuário restaurado é o `adminUserId` e está na allowlist.
 * - mac: HMAC-SHA256 de `v1.<payload>.<cofre>` — qualquer alteração invalida o cookie.
 * As chaves de cifra e de MAC são derivadas (HMAC) do segredo do servidor, com rótulos distintos.
 */

export const LAB_PROFILE_KEYS = ["coach_filled", "student_filled", "coach_empty", "student_fresh"] as const;
export type LabProfileKey = (typeof LAB_PROFILE_KEYS)[number];

export const LAB_PROFILE_META: Record<
  LabProfileKey,
  { role: "coach" | "student"; scenario: "filled" | "empty"; roleLabel: string; scenarioLabel: string; home: "/coach" | "/portal" }
> = {
  coach_filled: { role: "coach", scenario: "filled", roleLabel: "Coach demo", scenarioLabel: "Demo preenchida", home: "/coach" },
  student_filled: { role: "student", scenario: "filled", roleLabel: "Aluno demo", scenarioLabel: "Demo preenchida", home: "/portal" },
  coach_empty: { role: "coach", scenario: "empty", roleLabel: "Coach demo", scenarioLabel: "Começar do zero", home: "/coach" },
  // O aluno "do zero" vive na conta PREENCHIDA (decisão do §11): é a experiência que está vazia.
  student_fresh: { role: "student", scenario: "filled", roleLabel: "Aluno demo", scenarioLabel: "Começar do zero", home: "/portal" },
};

/**
 * Página-ponte da troca de perfil (`app/(auth)/laboratorio/entrando`): recebe o destino em `?para=`
 * e abre com navegação completa. Ver `switchToLabProfile` em `lib/admin/lab.ts`.
 */
export const LAB_ENTRY_PATH = "/laboratorio/entrando";

/** Destino aceito pela página-ponte: só as áreas dos perfis (`/coach`, `/portal`); o resto vira `null`. */
export function labEntryDestination(value: unknown): "/coach" | "/portal" | null {
  const homes = Object.values(LAB_PROFILE_META).map((m) => m.home);
  return homes.find((home) => home === value) ?? null;
}

export function isLabProfileKey(value: unknown): value is LabProfileKey {
  return typeof value === "string" && (LAB_PROFILE_KEYS as readonly string[]).includes(value);
}

export function labProfileLabel(key: LabProfileKey): string {
  const meta = LAB_PROFILE_META[key];
  return `${meta.roleLabel} · ${meta.scenarioLabel}`;
}

/** Login de demonstração: só domínio reservado `.test` (RFC 6761) — nunca um e-mail real. */
export function isReservedDemoEmail(email: string | null | undefined): boolean {
  return /^[^@\s]+@[^@\s]+\.test$/i.test(String(email ?? "").trim());
}

/** Tempo de vida curto: depois disso "Voltar ao painel" pede login normal. */
export const LAB_COOKIE_TTL_SECONDS = 2 * 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = "v1";

function deriveKey(secret: string, label: string): Buffer {
  return createHmac("sha256", secret).update(`trackly-lab-cookie/${label}/v1`).digest();
}

function b64(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function mac(secret: string, data: string): Buffer {
  return createHmac("sha256", deriveKey(secret, "mac")).update(data).digest();
}

export type LabCookiePayload = {
  adminUserId: string;
  profileKey: LabProfileKey;
  issuedAt: number;
  expiresAt: number;
};

export type LabCookieContents = LabCookiePayload & { adminRefreshToken: string };

export function encodeLabCookie(
  input: { adminUserId: string; profileKey: LabProfileKey; adminRefreshToken: string },
  secret: string,
  nowSeconds: number,
  ttlSeconds: number = LAB_COOKIE_TTL_SECONDS
): string {
  if (!secret || secret.length < 32) throw new Error("Segredo do laboratório ausente ou curto demais.");
  if (!UUID_RE.test(input.adminUserId)) throw new Error("adminUserId inválido.");
  if (!isLabProfileKey(input.profileKey)) throw new Error("Perfil do laboratório inválido.");
  if (!input.adminRefreshToken) throw new Error("Sessão do admin ausente.");

  const payload = b64(
    JSON.stringify({ u: input.adminUserId, p: input.profileKey, iat: nowSeconds, exp: nowSeconds + ttlSeconds })
  );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, "enc"), iv);
  cipher.setAAD(Buffer.from(payload));
  const ct = Buffer.concat([cipher.update(input.adminRefreshToken, "utf8"), cipher.final()]);
  const vault = b64(Buffer.concat([iv, cipher.getAuthTag(), ct]));
  const body = `${VERSION}.${payload}.${vault}`;
  return `${body}.${b64(mac(secret, body))}`;
}

/** Valida assinatura, formato e validade. Qualquer falha → `null` (nunca lança). */
export function decodeLabCookie(value: string | null | undefined, secret: string, nowSeconds: number): LabCookieContents | null {
  try {
    if (!value || !secret || secret.length < 32 || value.length > 4096) return null;
    const parts = value.split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) return null;
    const [version, payload, vault, sig] = parts;

    const expected = mac(secret, `${version}.${payload}.${vault}`);
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const u = data.u;
    const p = data.p;
    const iat = data.iat;
    const exp = data.exp;
    if (typeof u !== "string" || !UUID_RE.test(u) || !isLabProfileKey(p)) return null;
    if (typeof iat !== "number" || typeof exp !== "number") return null;
    if (exp <= nowSeconds || iat > nowSeconds + 60 || exp - iat > LAB_COOKIE_TTL_SECONDS) return null;

    const raw = Buffer.from(vault, "base64url");
    if (raw.length < 12 + 16 + 1) return null;
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, "enc"), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(payload));
    decipher.setAuthTag(raw.subarray(12, 28));
    const token = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    if (!token) return null;

    return { adminUserId: u, profileKey: p, issuedAt: iat, expiresAt: exp, adminRefreshToken: token };
  } catch {
    return null;
  }
}
