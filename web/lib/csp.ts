/**
 * Content Security Policy do app (definida pelo Gustavo). Montada a cada request pelo
 * `proxy.ts`, com um nonce novo — o Next.js lê o header CSP da request e aplica o nonce
 * sozinho nos scripts que ele mesmo injeta (ver
 * `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`).
 *
 * Desvios mínimos da política pedida, só pra não quebrar o que já existe:
 *  - `script-src` ganha `'strict-dynamic'` (scripts carregados por um script com nonce
 *    continuam valendo — é assim que os chunks do Next carregam) e, SÓ em desenvolvimento,
 *    `'unsafe-eval'` (o React usa eval no modo dev; nunca em produção).
 *  - `img-src` ganha `blob:` — a prévia da foto no check-in e no registro de refeição usa
 *    `URL.createObjectURL`.
 *  - `connect-src` aponta pro projeto Supabase (o "sua-api.com" da política).
 */
export function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    `connect-src 'self' ${supabaseUrl}`.trim(),
    // Endurecimento extra (aprovado pelo Gustavo): sem plugins (<object>/<embed>), o app não
    // pode ser embutido em outro site (clickjacking), <base> e formulários só pro próprio app.
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
