/**
 * Regra PURA da exceção de rota do plano suspenso (testada em `exempt-path.test.ts`).
 *
 * Com a assinatura suspensa/cancelada, só RENDERIZAR estas páginas continua liberado: a tela de
 * suspensão, "Minha assinatura" e a escolha da forma de pagamento. Server Actions nunca usam esta
 * exceção (`requireActiveCoach` em `app/coach/require-coach.ts`): numa ação o caminho que chega é o
 * da página de origem, então uma ação disparada de `/coach/assinatura` passaria como liberada.
 */

export const SUSPENDED_PATH = "/coach/suspenso";
/** "Assinar o Trackly / Forma de pagamento" (Pix Automático ou cartão recorrente). */
export const PAYMENT_METHOD_PATH = "/coach/assinatura";

export type ExemptRouteInput = {
  /** Caminho + query repassado pelo `proxy.ts` (`BILLING_PATH_HEADER`). */
  path: string | null | undefined;
  /** Requisição de Server Action (header `next-action` presente). */
  isServerAction?: boolean;
};

export function isBillingExemptRoute({ path, isServerAction = false }: ExemptRouteInput): boolean {
  if (isServerAction || !path || !path.startsWith("/")) return false;
  let url: URL;
  try {
    url = new URL(path, "http://local");
  } catch {
    return false;
  }
  if (url.origin !== "http://local") return false;
  if (url.pathname === SUSPENDED_PATH || url.pathname === PAYMENT_METHOD_PATH) return true;
  return url.pathname === "/coach/configuracoes" && url.searchParams.get("secao") === "assinatura";
}
