/**
 * Destino pós-login — função PURA (sem server-only) para ser testável. A decisão de QUEM é admin
 * vem do servidor (`isAdminUserId`); aqui só se escolhe o destino. Coaches e alunos comuns seguem
 * exatamente o `home` de `resolveHomeForCurrentUser`.
 */

/** `next` só vale se for um caminho interno do app (nada de URL externa, `//host` ou `\`). */
export function safeInternalPath(next: string | null | undefined): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  return next;
}

export function postLoginDestination(args: {
  isAdmin: boolean;
  home: "/coach" | "/portal" | null;
  next?: string | null;
}): string | null {
  if (!args.isAdmin) return args.home;
  return safeInternalPath(args.next) ?? "/admin";
}
