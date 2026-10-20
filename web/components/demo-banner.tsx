import "server-only";
import { Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentCoachDemo } from "@/lib/demo";
import { readLabCookie, returnToAdmin } from "@/lib/admin/lab";

/**
 * Faixa "Modo demonstração — Laboratório" (item 28 do TODO V5) no topo das áreas do coach e do aluno.
 * Só aparece em conta `accounts.is_demo` (0023). Com o cookie do laboratório válido, mostra o perfil em
 * uso e o botão "Voltar ao painel admin" (a volta é validada no servidor por `returnToAdmin`).
 *
 * Nunca quebra a página: sem a coluna `is_demo` (0023 pendente) ou com erro de leitura, não renderiza.
 */

/** Conta do aluno logado é demo? O aluno não lê `accounts` pela RLS: lê a própria linha em `clients`
 * com a sessão (RLS) e consulta só o `is_demo` daquela conta pela service role. */
async function isCurrentStudentDemo(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: client } = await supabase.from("clients").select("account_id").eq("auth_user_id", user.id).maybeSingle();
    if (!client?.account_id) return false;
    const { data, error } = await createAdminClient()
      .from("accounts")
      .select("is_demo")
      .eq("id", client.account_id as string)
      .maybeSingle();
    if (error) return false;
    return (data as { is_demo?: boolean } | null)?.is_demo === true;
  } catch {
    return false;
  }
}

export default async function DemoBanner({ area }: { area: "coach" | "portal" }) {
  const isDemo = area === "coach" ? await isCurrentCoachDemo() : await isCurrentStudentDemo();
  if (!isDemo) return null;
  const lab = await readLabCookie();

  async function backToAdmin() {
    "use server";
    await returnToAdmin();
  }

  return (
    <div
      role="status"
      className="relative z-40 flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 bg-brand px-4 py-2 text-sm text-on-accent"
    >
      <Icon name="alert" size={16} className="shrink-0" />
      <p className="min-w-0 flex-1 font-semibold">
        Modo demonstração — Laboratório
        <span className="font-normal">
          {lab ? ` · ${lab.label}` : ""}
          {/* No celular a faixa fica em 2–3 linhas: o aviso longo só aparece a partir de `sm`. */}
          <span className="hidden sm:inline"> · dados fictícios, nada é enviado nem cobrado de verdade.</span>
          <span className="sm:hidden"> · dados fictícios</span>
        </span>
      </p>
      {lab && (
        <form action={backToAdmin}>
          <button
            type="submit"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-paper px-3 text-xs font-semibold text-brand transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
          >
            Voltar ao painel admin
          </button>
        </form>
      )}
    </div>
  );
}
