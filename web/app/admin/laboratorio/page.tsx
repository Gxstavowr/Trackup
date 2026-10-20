import type { Metadata } from "next";
import { Badge, Icon } from "@/components/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { listLabProfiles, readLabCookie } from "@/lib/admin/lab";
import { PageHeader, Unavailable } from "../_components/parts";
import { LAB_PROFILE_META, type LabProfileKey } from "./_lib/cookie";
import { ResetForm, SwitchProfileForm } from "./lab-forms";

export const metadata: Metadata = {
  title: "Trackly · Laboratório de demonstração",
  robots: { index: false, follow: false },
};

/**
 * Laboratório de demonstração (itens 26–28 do TODO V5). Matriz Coach demo / Aluno demo × "Demo
 * preenchida" / "Começar do zero". Só o proprietário vê (`requireAdmin` → 404) e só os logins da lista
 * fechada `demo_lab_profiles` podem ser assumidos. Cada troca e reset vai para `admin_audit_events`.
 */

const ROWS: { role: "coach" | "student"; title: string; icon: "users" | "user"; keys: [LabProfileKey, LabProfileKey] }[] = [
  { role: "coach", title: "Coach demo", icon: "users", keys: ["coach_filled", "coach_empty"] },
  { role: "student", title: "Aluno demo", icon: "user", keys: ["student_filled", "student_fresh"] },
];

const DESCRIPTION: Record<LabProfileKey, string> = {
  coach_filled: "Alunos fictícios com histórico, check-ins, avaliações, orientações, fotos, planos e financeiro de demonstração.",
  coach_empty: "Conta nova: sem alunos, sem avaliações e sem protocolos. Pode ser resetada a qualquer momento.",
  student_filled: "Aluno com pacote Híbrido, histórico de check-ins, treino e nutrição publicados.",
  student_fresh: "Aluno recém-ativado com pacote Híbrido: começa pelo questionário inicial.",
};

export default async function LabPage() {
  await requireAdmin();
  const [result, labCookie] = await Promise.all([listLabProfiles(), readLabCookie()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Laboratório de demonstração" />

      <div role="note" className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-brand/40 bg-brand-tint p-4">
        <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-brand" />
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <p className="font-semibold text-ink">Tudo aqui é demonstração.</p>
          <p className="text-ink-muted">
            Os perfis usam só contas marcadas como demo e logins <code>@trackly.test</code>. Convites viram envio
            simulado, nenhuma cobrança real é iniciada e esses números não entram nos indicadores do painel. O
            laboratório não acessa contas de usuários reais.
          </p>
        </div>
      </div>

      <section aria-labelledby="perfil-em-uso" className="card flex flex-col gap-2 p-4 md:p-5">
        <h2 id="perfil-em-uso" className="text-sm font-semibold text-ink">
          Perfil em uso
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent" dot>
            {labCookie ? labCookie.label : "Proprietário (sua sessão de admin)"}
          </Badge>
          <span className="text-xs text-ink-muted">
            Ao entrar num perfil demo, uma faixa amarela aparece no topo com o botão &ldquo;Voltar ao painel
            admin&rdquo;. A volta vale por 2 horas; depois disso, entre de novo pelo login.
          </span>
        </div>
      </section>

      {!result.ok ? (
        <Unavailable what="Laboratório" />
      ) : (
        ROWS.map((row) => (
          <section key={row.role} aria-labelledby={`lab-${row.role}`} className="flex flex-col gap-3">
            <h2 id={`lab-${row.role}`} className="flex items-center gap-2 t-subtitle text-ink">
              <Icon name={row.icon} size={18} className="text-brand" />
              {row.title}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {row.keys.map((key) => {
                const meta = LAB_PROFILE_META[key];
                const profile = result.profiles[key];
                const configured = Boolean(profile && (meta.role === "coach" || profile.clientId));
                return (
                  <article key={key} className="card flex min-w-0 flex-col gap-3 p-4 md:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-ink">{meta.scenarioLabel}</h3>
                      {configured ? (
                        <Badge tone="success" dot>
                          Pronto
                        </Badge>
                      ) : (
                        <Badge tone="warning" dot>
                          Não configurado
                        </Badge>
                      )}
                      {labCookie?.profileKey === key && <Badge tone="accent">Em uso</Badge>}
                    </div>
                    <p className="text-sm text-ink-muted">{DESCRIPTION[key]}</p>
                    {!configured && (
                      <p className="text-xs text-ink-faint">
                        Rode o seed de demonstração (<code>node scripts/seed-demo.mjs</code>) depois das migrações.
                      </p>
                    )}
                    <div className="mt-auto flex flex-col gap-3">
                      <SwitchProfileForm
                        profileKey={key}
                        label={`Entrar como ${meta.roleLabel.toLowerCase()}`}
                        disabled={!configured}
                      />
                      {key === "coach_empty" && (
                        <ResetForm
                          kind="empty"
                          label="Resetar cenário vazio"
                          confirmText="Apaga alunos, protocolos e preços criados na conta demo “Começar do zero”. Nenhuma outra conta é afetada."
                          disabled={!configured}
                        />
                      )}
                      {key === "student_fresh" && (
                        <ResetForm
                          kind="fresh"
                          label="Recomeçar aluno do zero"
                          confirmText="Recria o aluno demo do zero (mesmo login): questionário, planos e check-ins dele são apagados. Nada mais é afetado."
                          disabled={!configured}
                        />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
