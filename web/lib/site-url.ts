import "server-only";
import { headers } from "next/headers";

/**
 * Origem (protocolo + host) da request atual — usada para montar `redirectTo`/
 * `emailRedirectTo` do Supabase Auth (reset de senha, magic link) sem hardcodar a porta
 * 8791 do dev server nem depender de uma env var extra em produção.
 */
export async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  if (host) {
    const proto =
      h.get("x-forwarded-proto") ??
      (process.env.NODE_ENV === "development" ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8791";
}
