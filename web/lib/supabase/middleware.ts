import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

/**
 * Atualiza/renova a sessão do Supabase Auth a cada request (chamado pelo Proxy —
 * `web/proxy.ts`). Sem isso a sessão expira silenciosamente: o cookie de refresh token
 * nunca seria trocado por um novo access token porque nenhuma Server Action/Route Handler
 * roda em toda navegação (ex.: um simples link clicado).
 *
 * Padrão oficial do `@supabase/ssr` para Proxy/Middleware: criar um client passando
 * `getAll`/`setAll` ligados ao par request/response do Proxy, e chamar
 * `supabase.auth.getUser()` — a chamada de rede força o SDK a validar/renovar o token e
 * a persistir o cookie atualizado via `setAll`.
 */
export async function updateSession(
  request: NextRequest,
  extraRequestHeaders: Record<string, string> = {}
): Promise<{ response: NextResponse; user: User | null }> {
  // `extraRequestHeaders` deixa o Proxy repassar headers pra renderização (ex.: o CSP com
  // nonce, que o Next.js precisa ver na request pra aplicar o nonce nos próprios scripts).
  // Montado a partir de `request.headers` a cada chamada, pra levar junto o cookie renovado.
  const next = () => {
    const headers = new Headers(request.headers);
    Object.entries(extraRequestHeaders).forEach(([key, value]) => headers.set(key, value));
    return NextResponse.next({ request: { headers } });
  };
  let supabaseResponse = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = next();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Nunca trocar por `getSession()` aqui: `getUser()` valida o token contra o servidor
  // do Supabase Auth (não só decodifica o JWT local), e é essa validação que dispara o
  // refresh do cookie quando o access token expirou.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, user };
}
