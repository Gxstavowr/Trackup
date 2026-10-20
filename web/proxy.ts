import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildContentSecurityPolicy, createNonce } from "@/lib/csp";
import { BILLING_PATH_HEADER } from "@/lib/billing/path-header";

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
 *  4. Repassa o caminho pedido (`BILLING_PATH_HEADER`) pra renderização: o bloqueio de plano
 *     suspenso (`app/coach/require-coach.ts`) precisa saber se a rota é a da assinatura. O valor
 *     do cliente é sempre sobrescrito aqui (vazio fora de GET/HEAD). O matcher tem uma entrada
 *     extra `/coach/:path*` pra que nenhum caminho do coach (nem um terminado em .png) escape do
 *     Proxy com o header falsificado.
 *
 * Fora do matcher: `/api/webhooks/*` (chamadas servidor-a-servidor, sem sessão — o webhook da
 * SyncPay tem 5s de timeout e não deve pagar a ida ao Supabase Auth).
 */

const PROTECTED_PREFIXES = ["/coach", "/portal"];

export async function proxy(request: NextRequest) {
  const csp = buildContentSecurityPolicy(createNonce());
  // O valor vindo do cliente é SEMPRE descartado (sobrescrito). Só renderização de página (GET/HEAD)
  // recebe o caminho; POST (Server Actions, inclusive formulário sem JS) recebe vazio = nunca é
  // liberado pela exceção do plano suspenso.
  const isPageRender = request.method === "GET" || request.method === "HEAD";
  const { response, user } = await updateSession(request, {
    "Content-Security-Policy": csp,
    [BILLING_PATH_HEADER]: isPageRender ? request.nextUrl.pathname + request.nextUrl.search : "",
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
    // Todo /coach/* passa pelo Proxy, mesmo com extensão de imagem: senão o `BILLING_PATH_HEADER`
    // mandado pelo cliente chegaria intacto numa rota dinâmica (ex.: /coach/alunos/x.png).
    "/coach/:path*",
    "/((?!_next/static|_next/image|api/webhooks/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
