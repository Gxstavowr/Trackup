-- Trackly — 0016: data do cancelamento da assinatura
--
-- APLICAR DEPOIS da 0015. Reexecutável. Não altera nem apaga nenhuma linha existente.
-- O app (Financeiro e aba Pagamentos do aluno) passa a LER esta coluna — rode junto com o deploy.
--
-- POR QUE EXISTE (decisão de 09/10)
--   O card "Cancelamentos" do Financeiro mostrava só o total acumulado, porque não havia data do
--   cancelamento. Agora ele abre mostrando os cancelamentos do mês e segue o seletor de mês da
--   tela. O coach cancela/reativa na aba Pagamentos do aluno; o app grava `cancelled_at`.
--
-- Assinaturas que já estavam canceladas antes desta migration ficam com `cancelled_at` nulo
-- (contam no total, mas em nenhum mês) — hoje só há dados de teste.

alter table subscriptions add column if not exists cancelled_at timestamptz;

-- Só assinatura cancelada pode ter data de cancelamento (reativar limpa a data).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_cancelled_at_check') then
    alter table subscriptions
      add constraint subscriptions_cancelled_at_check check (cancelled_at is null or status = 'cancelled');
  end if;
end $$;

-- CONFERÊNCIA (só leitura):
-- select status, count(*), count(cancelled_at) from subscriptions group by status;
