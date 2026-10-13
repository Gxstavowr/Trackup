-- Trackly — 0017: quatro ângulos de foto no check-in (frente, lateral esquerda, lateral direita, costas)
--
-- APLICAR DEPOIS da 0016. Reexecutável. Não altera nem apaga nenhuma linha existente.
-- Rode ANTES (ou junto) do deploy do app que pede as 4 fotos — sem ela, o banco recusa as fotos
-- 'left'/'right' e o aluno vê erro no envio dessas duas posições.
--
-- POR QUE EXISTE (V3, tarefa 3)
--   A regra do produto passou a ser "peso + quatro fotos obrigatórios". A 0001 criou
--   `photos.angle` com um CHECK inline que só aceita ('front','back','side'). Agora o check-in
--   novo grava 'front', 'left', 'right' e 'back'.
--
-- LEGADO
--   'side' continua VÁLIDO: as fotos antigas ("Lateral (registro anterior)") ficam como estão —
--   nada é reclassificado como esquerda/direita e nenhuma linha é reescrita ou apagada.
--
-- O QUE NÃO MUDA
--   * `private.client_can_write_photo` (0004) monta o path com `p_angle` sem lista de ângulos.
--   * O unique `photos_client_week_angle_uidx` (0003) independe dos valores.

-- O CHECK da 0001 é inline, então o nome foi gerado pelo Postgres (normalmente
-- `photos_angle_check`). Para não depender do nome, remove QUALQUER CHECK de `photos` cuja
-- definição cite a coluna `angle` e recria com nome fixo.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.photos'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%angle%'
  loop
    execute format('alter table public.photos drop constraint %I', c.conname);
  end loop;

  alter table public.photos
    add constraint photos_angle_check
    check (angle in ('front', 'left', 'right', 'back', 'side'));
end $$;

-- CONFERÊNCIA (só leitura):
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.photos'::regclass and contype = 'c';
-- select angle, count(*) from photos group by angle;
