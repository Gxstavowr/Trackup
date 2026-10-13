-- Trackly — 0021: assinatura MENSAL do coach (Trackly cobra o coach via SyncPay)
--
-- APLICAR DEPOIS da 0020, pelo runner (`node scripts/migrate.mjs apply`, a partir de web/), que já
-- envolve o arquivo numa transação junto com o registro no histórico — por isso este arquivo NÃO
-- tem begin/commit próprios. ADITIVA e reexecutável (create ... if not exists, drop policy if
-- exists). Não toca em nenhuma tabela existente.
--
-- POR QUE EXISTE
--   O coach paga o Trackly todo mês no checkout hospedado da SyncPay (cartão recorrente ou Pix
--   Automático). Dado de cartão NUNCA passa pelo Trackly. A SyncPay faz as retentativas e suspende
--   depois do grace period; o Trackly só ESPELHA o estado (via webhook) pra avisar o coach
--   (estilo Netflix) e bloquear a área do coach quando suspenso/cancelado.
--
-- O QUE FAZ
--   1) `coach_billing_subscriptions`: UMA linha por conta (accounts.id). Sem linha = comportamento
--      de hoje (nenhum aviso, nenhum bloqueio) — todas as contas atuais e o coach demo.
--   2) `coach_billing_events`: todo webhook recebido (payload cru), com chave de idempotência
--      (event + subscription_token + occurred_at). Eventos sem conta casada ficam guardados mas
--      não são aplicados.
--   3) RLS: o coach só LÊ a própria linha de assinatura; ninguém escreve pelo cliente (só service
--      role, no servidor). Eventos: nenhum acesso pelo cliente.

-- ============================================================================
-- 1) Assinatura do coach
-- ============================================================================

create table if not exists public.coach_billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  syncpay_subscription_token text unique,
  status text not null default 'none'
    check (status in ('none', 'pending_first_payment', 'active', 'overdue', 'suspended', 'cancelled')),
  -- Momento da PRIMEIRA falha da inadimplência atual; limpo quando o pagamento entra.
  payment_failed_at timestamptz,
  next_charge_at timestamptz,
  subscriber_email text,
  -- Só dígitos (CPF/CNPJ), usado pra casar webhook -> conta quando o e-mail não bate.
  subscriber_document text,
  -- true = mostrar "Pagamento confirmado" uma vez; o app limpa ao exibir.
  confirmation_pending boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_billing_subscriptions_document_idx
  on public.coach_billing_subscriptions(subscriber_document)
  where subscriber_document is not null;

create or replace function private.coach_billing_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists coach_billing_subscriptions_touch on public.coach_billing_subscriptions;
create trigger coach_billing_subscriptions_touch
  before update on public.coach_billing_subscriptions
  for each row execute function private.coach_billing_touch_updated_at();

alter table public.coach_billing_subscriptions enable row level security;

drop policy if exists coach_billing_subscriptions_own_read on public.coach_billing_subscriptions;
create policy coach_billing_subscriptions_own_read on public.coach_billing_subscriptions
  for select to authenticated
  using (account_id = private.current_account_id());

-- Defesa em profundidade além do RLS: o cliente só tem SELECT.
revoke all on public.coach_billing_subscriptions from anon, authenticated;
grant select on public.coach_billing_subscriptions to authenticated;

-- ============================================================================
-- 2) Eventos de webhook (log cru + idempotência)
-- ============================================================================

create table if not exists public.coach_billing_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  subscription_token text,
  occurred_at timestamptz,
  payload jsonb not null,
  account_id uuid references public.accounts(id) on delete set null,
  -- true quando o status aplicado veio da API da SyncPay (não do corpo do webhook).
  verified boolean not null default false,
  received_at timestamptz not null default now(),
  -- nulo enquanto não foi aplicado (sem conta casada, evento só-registro ou falha a reprocessar).
  processed_at timestamptz,
  constraint coach_billing_events_idempotency
    unique nulls not distinct (event, subscription_token, occurred_at)
);

create index if not exists coach_billing_events_token_idx
  on public.coach_billing_events(subscription_token);

alter table public.coach_billing_events enable row level security;
-- Sem policy nenhuma: só a service role (que ignora RLS) lê/escreve.
revoke all on public.coach_billing_events from anon, authenticated;
