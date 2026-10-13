-- Trackly — 0019: texto de ajuda por pergunta do check-in + pergunta Sim/Não criada pelo coach
--
-- APLICAR DEPOIS da 0018. Reexecutável. Aditiva: não altera nem apaga nenhuma linha existente.
-- Rode ANTES (ou junto) do deploy do app que lê/grava `checkin_questions.help_text` — a tela de
-- Configurações seleciona a coluna explicitamente.
--
-- O QUE FAZ
--   1. `checkin_questions.help_text text` (nullable): ajuda curta que o aluno vê abaixo da
--      pergunta. Nulo = sem ajuda própria (perguntas do catálogo continuam com a ajuda do
--      catálogo, lib/checkin-catalog.ts). Limite de 200 caracteres e nunca string vazia.
--   2. Tipo Sim/Não: o app usa o valor 'boolean', que a 0001 JÁ aceita no CHECK inline de
--      `type` (é o tipo da pergunta do sistema `substances_use`). Para não depender do nome
--      gerado pelo Postgres, o CHECK é recriado com nome fixo e EXATAMENTE o mesmo conjunto de
--      valores (nenhuma linha existente pode violar; nada é reescrito). As respostas continuam
--      em `checkin_answers.value` como 'yes'/'no' (mesma regra do catálogo).
--
-- O QUE NÃO MUDA (RLS)
--   * `checkin_questions_by_template` (0001, FOR ALL do coach da conta) já cobre ler/escrever a
--     coluna nova; `checkin_questions_client_read` (0003, SELECT do aluno) já deixa o aluno ler.
--     Não há policy por coluna, então nenhuma policy nova é necessária.
--   * Regras de perguntas sensíveis (hormônios, ciclo…) moram no catálogo do app, por `key`.

-- 1) Texto de ajuda -----------------------------------------------------------------------------
alter table public.checkin_questions
  add column if not exists help_text text;

alter table public.checkin_questions
  drop constraint if exists checkin_questions_help_text_check;
alter table public.checkin_questions
  add constraint checkin_questions_help_text_check
  check (help_text is null or char_length(help_text) between 1 and 200);

comment on column public.checkin_questions.help_text is
  'Ajuda curta (até 200 caracteres) exibida ao aluno abaixo da pergunta. Nulo = sem ajuda própria.';

-- 2) Tipo Sim/Não ('boolean') garantido no CHECK de `type`, com nome fixo ----------------------
-- Remove QUALQUER CHECK de checkin_questions cuja definição cite a coluna `type` (o da 0001 é
-- inline, nome gerado — normalmente `checkin_questions_type_check`) e recria com o mesmo conjunto.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.checkin_questions'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~ '\mtype\M'
  loop
    execute format('alter table public.checkin_questions drop constraint %I', c.conname);
  end loop;

  alter table public.checkin_questions
    add constraint checkin_questions_type_check
    check (type in ('number', 'scale', 'boolean', 'select', 'text', 'photos', 'scale+text', 'number+text', 'stepper'));
end $$;

-- CONFERÊNCIA (só leitura):
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.checkin_questions'::regclass and contype = 'c';
-- select type, count(*), count(help_text) from checkin_questions group by type;
