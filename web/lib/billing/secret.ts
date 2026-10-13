import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Segredo do path do webhook da SyncPay: comparação em tempo constante (via hash, então nem o
 * tamanho do segredo vaza). Sem segredo configurado nada casa (rota responde 404).
 */
export function secretMatches(given: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
