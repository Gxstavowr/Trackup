-- Trackly — 0018: o aluno edita o próprio perfil básico e escolhe quais avisos recebe
--
-- APLICAR DEPOIS da 0017, pelo runner (`node scripts/migrate.mjs apply`, a partir de web/), que
-- já envolve o arquivo numa transação junto com o registro no histórico — por isso este arquivo
-- NÃO tem begin/commit próprios. Reexecutável (create ... if not exists / create or replace /
-- drop policy if exists). Não altera nem apaga nenhuma linha existente.
--
-- POR QUE EXISTE (feature (a), aprovada pelo dono)
--   /portal/conta mostrava os dados do aluno só para leitura ("fale com seu coach") e dizia que
--   escolher avisos "ainda não está disponível". Agora o aluno pode:
--     * corrigir o NOME de exibição e o TELEFONE/WhatsApp da própria linha de `clients`;
--     * desligar as notificações in-app que o coach dispara para ele (orientação da semana,
--       treino atualizado, plano de nutrição atualizado).
--
-- O QUE CONTINUA FECHADO (lockdown da 0004 / matriz da 0003 intactos)
--   * Nenhuma policy nova de UPDATE em `clients`: o aluno continua só com `clients_self_read`.
--     A escrita passa por UMA função SECURITY DEFINER que só toca `name` e `phone` da linha cujo
--     `auth_user_id = auth.uid()`. E-mail (é o login), coach, conta, status, convite, sexo (gatilho
--     das perguntas condicionais, controlado pelo coach), idade, altura, objetivo, início, cor e
--     tudo de cobrança ficam fora — não há parâmetro para eles.
--   * Preferências: tabela nova SÓ COM SELECT para `authenticated` (dono e coach da conta leem);
--     a escrita é outra função SECURITY DEFINER que deriva o aluno de auth.uid(). Não existe
--     parâmetro de client_id em nenhuma das duas — não dá para mirar a linha de outra pessoa.
--   * `anon` não executa nem lê nada daqui (mesma regra da 0012).
--
-- CANAIS: só o in-app existe de verdade. WhatsApp é o coach abrindo `wa.me` manualmente (nada é
-- enviado sozinho) e e-mail/push nunca são disparados (`channel_email`/`channel_push` ficam
-- 'declared'), então não há preferência para eles — seria um botão que não faz nada.

-- ============================================================================
-- 1) Preferências de notificação do aluno
-- ============================================================================

create table if not exists public.client_notification_preferences (
  client_id uuid primary key references public.clients(id) on delete cascade,
  orientation_ready boolean not null default true,
  workout_updated boolean not null default true,
  nutrition_updated boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.client_notification_preferences enable row level security;

-- Só leitura pela API; a escrita é exclusivamente pela função da seção 3.
revoke all on table public.client_notification_preferences from public, anon, authenticated;
grant select on table public.client_notification_preferences to authenticated;

drop policy if exists client_notification_preferences_client_read on public.client_notification_preferences;
create policy client_notification_preferences_client_read on public.client_notification_preferences
  for select to authenticated
  using (client_id = (select private.current_client_id()));

-- O coach lê para respeitar a escolha ao notificar (lib/repository.ts → createNotification).
drop policy if exists client_notification_preferences_coach_read on public.client_notification_preferences;
create policy client_notification_preferences_coach_read on public.client_notification_preferences
  for select to authenticated
  using (private.is_coach_of_client(client_id));

-- ============================================================================
-- 2) update_my_profile: nome e telefone da PRÓPRIA linha de clients
-- ============================================================================
-- Regras espelhadas em web/lib/student-profile.ts (validateProfileInput — testada):
--   nome: espaços aparados e colapsados, 2..80 caracteres, sem caractere de controle;
--   telefone: opcional (vazio = null); até 25 caracteres, só dígitos, espaço e + ( ) - . ;
--             10 a 15 dígitos (mesma faixa que o app aceita para montar o link do WhatsApp).

create or replace function public.update_my_profile(p_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_name text;
  v_phone text;
  v_digits int;
begin
  if (select auth.uid()) is null then
    raise exception 'trackly:not_authenticated' using errcode = '42501';
  end if;

  select c.id into v_client_id
    from public.clients c
   where c.auth_user_id = (select auth.uid());
  if v_client_id is null then
    raise exception 'trackly:no_client' using errcode = '42501';
  end if;

  -- Colapsa QUALQUER espaço (\s: inclui tab/quebra de linha) antes de aparar — btrim só tira ' '.
  v_name := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if pg_catalog.char_length(v_name) < 2
     or pg_catalog.char_length(v_name) > 80
     or v_name ~ '[[:cntrl:]]' then
    raise exception 'trackly:invalid_name' using errcode = '22023';
  end if;

  v_phone := nullif(pg_catalog.btrim(coalesce(p_phone, ''), E' \t\r\n'), '');
  if v_phone is not null then
    v_digits := pg_catalog.char_length(pg_catalog.regexp_replace(v_phone, '[^0-9]', '', 'g'));
    if pg_catalog.char_length(v_phone) > 25
       or v_phone !~ '^[0-9 +().-]+$'
       or v_digits < 10 or v_digits > 15 then
      raise exception 'trackly:invalid_phone' using errcode = '22023';
    end if;
  end if;

  update public.clients
     set name = v_name,
         phone = v_phone
   where id = v_client_id;
end;
$$;

-- ============================================================================
-- 3) set_my_notification_preferences: upsert da linha de preferências do próprio aluno
-- ============================================================================

create or replace function public.set_my_notification_preferences(
  p_orientation_ready boolean,
  p_workout_updated boolean,
  p_nutrition_updated boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'trackly:not_authenticated' using errcode = '42501';
  end if;

  select c.id into v_client_id
    from public.clients c
   where c.auth_user_id = (select auth.uid());
  if v_client_id is null then
    raise exception 'trackly:no_client' using errcode = '42501';
  end if;

  if p_orientation_ready is null or p_workout_updated is null or p_nutrition_updated is null then
    raise exception 'trackly:invalid_preferences' using errcode = '22023';
  end if;

  insert into public.client_notification_preferences
    (client_id, orientation_ready, workout_updated, nutrition_updated, updated_at)
  values
    (v_client_id, p_orientation_ready, p_workout_updated, p_nutrition_updated, pg_catalog.now())
  on conflict (client_id) do update
    set orientation_ready = excluded.orientation_ready,
        workout_updated = excluded.workout_updated,
        nutrition_updated = excluded.nutrition_updated,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.update_my_profile(text, text) from public, anon;
revoke all on function public.set_my_notification_preferences(boolean, boolean, boolean) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.set_my_notification_preferences(boolean, boolean, boolean) to authenticated;

-- ============================================================================
-- CONFERÊNCIA (rodar depois, separadamente — só leitura)
-- ============================================================================
-- 1) As duas funções com search_path fixo ('') e SECURITY DEFINER:
-- select p.proname, p.prosecdef, p.proconfig from pg_proc p
--  where p.oid in ('public.update_my_profile(text,text)'::regprocedure,
--                  'public.set_my_notification_preferences(boolean,boolean,boolean)'::regprocedure);
-- 2) anon não executa (deve voltar false, false):
-- select has_function_privilege('anon', 'public.update_my_profile(text,text)', 'execute'),
--        has_function_privilege('anon', 'public.set_my_notification_preferences(boolean,boolean,boolean)', 'execute');
-- 3) authenticated só tem SELECT na tabela de preferências:
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_name = 'client_notification_preferences' and grantee in ('anon', 'authenticated');
-- 4) clients continua sem policy de UPDATE para o aluno (só clients_coach_full_access e clients_self_read):
-- select policyname, cmd from pg_policies where tablename = 'clients';
