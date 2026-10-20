import type { Metadata } from "next";
import Link from "next/link";
import Brand from "@/components/brand";
import { Icon } from "@/components/ui";
import { logout } from "@/lib/actions/logout";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "./admin-nav";

export const metadata: Metadata = {
  title: "Trackly · Painel do proprietário",
  robots: { index: false, follow: false },
};

/**
 * Casca do painel do proprietário (`/admin/*`) — itens 21–24 do TODO V5. Mesma identidade visual
 * do coach (moldura `--paper`, painel grafite `bg-canvas`, cartões `--surface`), mas navegação
 * própria e nenhum vínculo com a área do coach ou do aluno.
 *
 * `requireAdmin()` aqui E em cada página/Server Action: layouts não re-renderizam entre rotas
 * irmãs. Quem não está na allowlist recebe 404 (a área não "existe" para ele).
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user } = await requireAdmin();
  const email = user.email ?? "Proprietário";
  // O proprietário pode ter também um perfil de coach (RLS: só enxerga a própria linha).
  const { data: coachRow } = await (await createClient())
    .from("coach_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  const hasCoachProfile = !!coachRow;

  return (
    <div className="flex flex-1 flex-col bg-paper md:flex-row">
      <aside className="sticky top-0 z-30 shrink-0 bg-paper md:flex md:flex-col md:h-screen md:w-[var(--sidebar-w)] md:self-start md:px-3 md:pb-4 md:pt-5">
        <div className="flex h-14 items-center gap-2 px-4 md:h-auto md:flex-col md:items-stretch md:gap-7 md:px-0">
          <Link
            href="/admin"
            aria-label="Trackly — Painel do proprietário"
            className="flex min-h-11 items-center gap-2 rounded-[10px] focus-visible:outline-2 focus-visible:outline-brand md:px-3"
          >
            <Brand variant="compact" />
            <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand">
              Admin
            </span>
          </Link>

          <AdminNav variant="sidebar" hasCoachProfile={hasCoachProfile} />

          <form action={logout} className="ml-auto md:hidden">
            <button
              type="submit"
              aria-label="Sair da conta"
              className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Icon name="logout" size={20} />
            </button>
          </form>
        </div>

        <AdminNav variant="top" hasCoachProfile={hasCoachProfile} />

        <div className="hidden md:mt-auto md:flex md:items-center md:gap-2.5 md:rounded-[14px] md:border md:border-line md:bg-surface md:px-2.5 md:py-2">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-raised font-display text-sm font-bold text-brand"
          >
            {(email.trim().charAt(0) || "A").toLocaleUpperCase("pt-BR")}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={email}>
            {email}
          </span>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Sair da conta"
              title="Sair"
              className="flex size-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Icon name="logout" size={18} />
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 rounded-t-[var(--radius-xl)] bg-canvas px-4 pb-16 pt-6 md:my-3 md:mr-3 md:min-h-[calc(100vh-1.5rem)] md:rounded-[var(--radius-xl)] md:px-8 md:pb-12 md:pt-9 xl:px-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
