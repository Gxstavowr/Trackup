import { after, type NextRequest } from "next/server";
import { secretMatches } from "@/lib/billing/secret";
import { processSyncPayWebhook } from "@/lib/billing/webhook";

/**
 * Webhook da SyncPay (assinatura mensal do COACH com o Trackly).
 *
 * A SyncPay não documenta assinatura de webhook, então a URL cadastrada lá leva um segmento
 * secreto (SYNCPAY_WEBHOOK_SECRET): comparação em tempo constante e 404 se não bater (nem revela
 * que a rota existe). Com credenciais da API, o status aplicado vem da própria SyncPay
 * (`lib/billing/webhook.ts`). Excluída do Proxy (`proxy.ts`): não tem sessão nem página.
 */

const MAX_BODY_BYTES = 64 * 1024;

const notFound = () => new Response("Not Found", { status: 404 });

export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhooks/syncpay/[secret]">) {
  const { secret } = await ctx.params;
  if (!secretMatches(secret, process.env.SYNCPAY_WEBHOOK_SECRET)) return notFound();

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await processSyncPayWebhook(payload);
    // Troca de forma de pagamento: cancelar a assinatura antiga não segura a resposta (timeout 5s).
    if (result.followUp) {
      const followUp = result.followUp;
      after(async () => {
        try {
          await followUp();
        } catch (err) {
          console.error("[syncpay] pós-webhook (troca de forma de pagamento) falhou:", (err as Error).message);
        }
      });
    }
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[syncpay] erro inesperado no webhook:", (err as Error).message);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
