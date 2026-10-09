import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildContentSecurityPolicy, createNonce } from "@/lib/csp";

/**
 * Item 1 do TODO ("middleware de sessão"), implementado como `proxy.ts` — no Next.js 16 o
 * arquivo `middleware.ts` foi renomeado pra `proxy.ts` (mesma funcionalidade, ver
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 * `middleware.ts` ainda funcionaria (só deprecado), mas `web/AGENTS.md` pede pra seguir
 * os avisos de depreciação desta versão em vez do nome "clássico".
 *
 * Duas responsabilidades:
 *  1. Renovar a sessão do Supabase Auth em todo request (`updateSession`) — sem isso o
 *     cookie de sessão expira silenciosamente.
 *  2. Checagem OTIMISTA de acesso: sem sessão nenhuma, `/coach` e `/portal` redirecionam
 *     direto pro login (evita renderizar a página só pra redirecionar depois). A checagem
 *     de ROLE (coach vs. aluno) continua só no servidor, dentro de cada page.tsx — Proxy
 *     roda em runtime de borda/otimista e não deve ser a única linha de defesa (doc de
 *     autenticação do próprio Next.js recomenda exatamente isso).
 *  3. Content Security Policy com nonce novo por request (`lib/csp.ts`): vai no header da
 *     request (o Next.js aplica o nonce nos próprios scripts a partir dele) e da response.
 */

const PROTECTED_PREFIXES = ["/coach", "/portal"];

export async function proxy(request: NextRequest) {
  const csp = buildContentSecurityPolicy(createNonce());
  const { response, user } = await updateSession(request, {
    "Content-Security-Policy": csp,
  });

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
