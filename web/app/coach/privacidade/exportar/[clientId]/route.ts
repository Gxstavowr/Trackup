import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildClientExport } from "@/lib/privacy/client-data";
import { requireCoach } from "../../../require-coach";

/**
 * Exportação dos dados de um aluno pelo COACH (controlador), pra atender pedidos de acesso/
 * portabilidade ou antes de uma exclusão. O RLS do client autenticado limita aos alunos da conta.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/coach/privacidade/exportar/[clientId]">) {
  await requireCoach();
  const { clientId } = await ctx.params;
  const supabase = await createClient();
  const data = await buildClientExport(supabase, clientId);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="trackly-aluno-${clientId.slice(0, 8)}-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
