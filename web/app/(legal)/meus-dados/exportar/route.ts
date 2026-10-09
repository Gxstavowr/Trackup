import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildClientExport } from "@/lib/privacy/client-data";
import { requireClientSession } from "@/app/portal/require-client";

/**
 * Download dos dados do próprio aluno em JSON (LGPD art. 18, II e V — acesso e portabilidade,
 * atendidos na hora, sem depender do coach).
 */
export async function GET() {
  const { client } = await requireClientSession();
  const supabase = await createClient();
  const data = await buildClientExport(supabase, client.id);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="trackly-meus-dados-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
