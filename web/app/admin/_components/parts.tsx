import type { ReactNode } from "react";
import { Badge, Icon, type IconName } from "@/components/ui";
import type { BillingStatus } from "@/lib/billing/state";
import { ADMIN_BILLING_STATUS_LABEL, BILLING_STATUS_TONE } from "../_lib/logic";

/** Peças visuais locais do painel (sem editar os componentes compartilhados). */

export function PageHeader({ title, eyebrow = "Trackly · Proprietário", children }: { title: string; eyebrow?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <span className="t-label text-ink-faint">{eyebrow}</span>
        <h1 className="t-title text-ink">{title}</h1>
      </div>
      {children}
    </header>
  );
}

/**
 * Leitura falhou (ex.: migração 0023 ainda não aplicada). Diz o que houve sem estimar nada.
 */
export function Unavailable({ what }: { what: string }) {
  return (
    <div role="status" className="card flex flex-col items-start gap-2 border-dashed p-5">
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon name="alert" size={16} className="text-warning" />
        {what}: dados indisponíveis
      </span>
      <p className="text-sm text-ink-muted">
        Não foi possível ler esses dados agora. Se as migrações 0022 e 0023 ainda não foram aplicadas no
        banco, esta área passa a funcionar depois delas. Nenhum número foi estimado no lugar.
      </p>
    </div>
  );
}

/** Cabeçalho de uma área do painel, com selo que diferencia receita do Trackly x serviço do coach. */
export function AreaHeader({
  id,
  icon,
  title,
  tag,
  tagTone,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  tag: string;
  tagTone: "accent" | "info";
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name={icon} size={18} className={tagTone === "accent" ? "text-brand" : "text-info"} />
        <h2 id={id} className="t-subtitle text-ink">
          {title}
        </h2>
        <Badge tone={tagTone}>{tag}</Badge>
      </div>
      {children && <p className="max-w-2xl text-sm text-ink-muted">{children}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: BillingStatus }) {
  const tone = BILLING_STATUS_TONE[status];
  return (
    <Badge tone={tone} dot>
      {ADMIN_BILLING_STATUS_LABEL[status]}
    </Badge>
  );
}
