# 0003 — Matriz de RLS (quem pode o quê)

Companheiro de `0003_training_nutrition_extensions_and_student_rls.sql`. Cada linha foi conferida contra um
Postgres 18.4 real (ver "Como foi verificado" no fim). Legenda: **S** = SELECT, **I** = INSERT, **U** = UPDATE,
**D** = DELETE, **—** = nada (RLS nega; SELECT devolve 0 linhas, escrita dá erro de RLS ou afeta 0 linhas).

Atores:

- **Coach dono** — coach autenticado da MESMA conta do aluno/linha.
- **Coach outra conta** — coach autenticado de OUTRA conta.
- **Aluno próprio** — aluno autenticado, dono do `client_id` da linha.
- **Outro aluno** — qualquer outro aluno (da mesma conta ou de outra).
- Anônimo (`anon`) e o service_role não estão nas tabelas: `anon` não tem nenhuma policy (0 linhas em tudo);
  service_role bypassa RLS (e o trigger de `checkin_instances`), como sempre.

Funções auxiliares novas (schema `private`, `security definer`, `stable`, `set search_path = public`):
`current_client_account_id()`, `is_coach_of_client(uuid)`, `client_can_write_metric(uuid, int, text)`,
`client_visible_exercise_ids()`, `client_visible_food_ids()`; e a de trigger `guard_checkin_instance_update()`.

## 1. Tabelas NOVAS (RLS habilitado + policies + GRANTs explícitos)

| Tabela | Coach dono | Coach outra conta | Aluno próprio | Outro aluno |
|---|---|---|---|---|
| `workout_sessions` | S I U D | — | S I U (sem D). `plan_id`/`day_id` precisam ser do mesmo aluno | — |
| `plan_change_logs` (append-only) | S I (autor = ele mesmo; `client_id` da conta) | — | — | — |
| `food_equivalences` | S I U D (só com alimentos da própria conta) | — | S, só entre alimentos que ele já vê no plano publicado | — |
| `meal_logs` | S I U D | — | S I U D. `meal_id` precisa ser de plano dele; `storage_path` sob `account_id/client_id/` | — |
| `water_logs` | S I U D | — | S I U (sem D; zerar = `amount_ml = 0`) | — |

Policies: `workout_sessions_{coach_full_access, client_read, client_insert, client_update}`,
`plan_change_logs_{coach_read, coach_insert}`, `food_equivalences_{coach_full_access, client_read}`,
`meal_logs_{coach_full_access, client_read, client_insert, client_update, client_delete}`,
`water_logs_{coach_full_access, client_read, client_insert, client_update}`.

Reforço em GRANT: `plan_change_logs` não dá UPDATE/DELETE/TRUNCATE nem ao `authenticated` (além de não ter
policy); `anon` perde acesso às 5 tabelas novas.

## 2. Lacunas de leitura FECHADAS (aluno lê sem client admin)

| Tabela | Coach dono | Coach outra conta | Aluno próprio | Outro aluno |
|---|---|---|---|---|
| `exercises` | S I U D (`exercises_by_account`, 0001) | — | **S** só exercícios (e substitutos) dos planos PUBLICADOS dele, da conta dele — `exercises_client_read` | — (outra conta: nada; mesma conta sem uso no plano dele: nada) |
| `foods` | S I U D (0001) | — | **S** só itens/alternativas/equivalentes do plano de nutrição PUBLICADO dele — `foods_client_read` | — |
| `checkin_templates` | S I U D (0001) | — | **S** os da conta dele — `checkin_templates_client_read` | S só os da conta DELE (nunca de outra) |
| `checkin_questions` | S I U D (0001) | — | **S** as dos templates da conta dele — `checkin_questions_client_read` | idem |

Rascunho não vaza: `is_draft = true` fica fora de `client_visible_exercise_ids/food_ids`.

## 3. Policies SUBSTITUÍDAS (escrita indevida do aluno fechada)

Todas as policies antigas eram `for all` via `private.can_access_client`, que liberava também o aluno.
Cada uma foi derrubada (`drop policy if exists`) e recriada de forma explícita, como o 0002 fez em `notifications`.

| Tabela (policy antiga derrubada) | Coach dono | Coach outra conta | Aluno próprio | Outro aluno |
|---|---|---|---|---|
| `orientations` (`orientations_by_client`) | S I U D | — | **S** só `is_draft = false` E `sent_at is not null`. Sem I/U/D | — |
| `goals` (`goals_by_client`) | S I U D | — | **S** só. Sem I/U/D | — |
| `history_events` (`history_events_by_client`) | S I U D | — | **S** só. Sem I/U/D | — |
| `metrics` (`metrics_by_client`) | S I U D | — | **S** + **I/U estreito**: só as 10 chaves vindas do check-in (`weight_kg, waist_cm, hip_cm, body_fat_pct, workouts_count, cardio_count, water_l, sleep_h, energy, hunger`) e só na semana de um check-in `pending/late/submitted` (nunca `reviewed`). Sem D | — |
| `checkin_instances` (`checkin_instances_coach_access`) | S I U D | — | **S**; **I** só `status='pending'` sem `submitted_at/reviewed_at/review_opened_at`; **U** só `pending/late -> submitted` (policy + trigger). Sem D | — |
| `checkin_answers` (`checkin_answers_by_instance`) | S I U D | — | **S**; **I/U** só enquanto o check-in dele está `pending/late`. Sem D | — |

Detalhe do `checkin_instances` (o que o trigger `checkin_instances_guard_update` faz por cima da policy): pra
quem NÃO é coach da conta e tem `auth.uid()` (ou seja, aluno), o UPDATE só passa se `old.status in
('pending','late')`, `new.status = 'submitted'` e nada mais mudou (id, client_id, week_number, period_start/end,
template_id, created_at, reviewed_at, review_opened_at); `submitted_at` é sempre sobrescrito por `now()`. Coach
da conta, service_role e SQL Editor (`auth.uid()` nulo) passam livres.

Orientation: `orientations_coach_full_access` (all) + `orientations_client_read_sent` (select).
Demais: `<tabela>_coach_full_access` + `<tabela>_client_read` (+ `_client_insert/_client_update/_client_submit`
onde descrito). Escolha deliberada em `metrics`: ver "Decisões" no relatório da migration (o aluno grava métricas
com a própria sessão em `submitCheckin`; SELECT-only quebraria isso em silêncio).

**Limitação conhecida — `orientations.coach_note`:** RLS é por linha. Numa orientação ENVIADA o aluno ainda lê
`coach_note` e `author_id` se pedir `select=*` direto na REST. Fechar exige mover `coach_note` pra tabela
só-do-coach (migration futura). Até lá o app deve selecionar só colunas seguras (`week_number, text,
focus_override, sent_at`).

## 4. Templates de treino/dieta (só coach dono)

Aditivas; convivem por OR com as policies por aluno do 0001 (que negam linha com `client_id` nulo).

| Tabela | Coach dono | Coach outra conta | Aluno próprio | Outro aluno |
|---|---|---|---|---|
| `workout_plans` onde `is_template` | S I U D (`workout_plans_template_by_account`) | — | — | — |
| `workout_days`, `workout_exercises` de template | S I U D (`*_template_by_account`) | — | — | — |
| `nutrition_plans` onde `is_template` | S I U D | — | — | — |
| `meals`, `meal_items`, `meal_substitutions` de template | S I U D | — | — | — |

CHECK `*_template_shape_check`: template ⇒ `client_id is null and account_id is not null`; não-template ⇒
`client_id is not null`. Um aluno não consegue promover o próprio plano a template (exigiria `client_id` nulo, que a
policy dele nega).

## 5. Tabelas existentes SEM policy nova (só ganham colunas)

| Tabela | Situação |
|---|---|
| `workout_logs` | `workout_logs_by_client` (0001, all via `can_access_client`) já deixa aluno E coach escreverem; colunas novas (`session_id`, `workout_exercise_id`, `set_number`, `perceived_rir`, `student_note`) herdam. FK composta `(session_id, client_id) -> workout_sessions(id, client_id)` impede apontar pra sessão de outro aluno. |
| `workout_exercises`, `meals`, `meal_items`, `meal_substitutions`, `nutrition_plans`, `workout_plans`, `foods`, `exercises` | Só colunas novas; policies do 0001 intactas. |
| `photos` | Policy do 0001 intacta. Unique `(client_id, week_number, angle)` criado só se não houver duplicata (senão NOTICE). |

## 6. Brechas de MESMA CLASSE que continuam abertas (fora do escopo pedido — sugestão de 0004)

Ainda são `for all` via `can_access_client`, ou seja, o ALUNO consegue escrever nelas via REST com o próprio token:

| Tabela | Risco | Escrita legítima do aluno hoje? |
|---|---|---|
| `subscriptions`, `payments`, `payment_events` | **Alto**: aluno pode marcar a própria cobrança como `paid`, mudar valor/plano, apagar cobrança | Não há no app atual (só o coach registra) — conferir se alguma tela nova de pagamento do portal foi adicionada antes de restringir |
| `workout_plans`, `workout_days`, `workout_exercises` | Aluno reescreve o próprio plano (inclusive `is_draft`) | Não |
| `nutrition_plans`, `meals`, `meal_items`, `meal_substitutions` | Idem | Não |
| `photos` | Aluno grava `storage_path` arbitrário (o app já mitiga com `isOwnedPhotoPath`); pode alterar foto de check-in já enviado | Sim (upload no check-in) — restringir por status do check-in |
| `workout_logs` | Aluno apaga/edita logs, inclusive os que o coach lançou | Sim (insert); update/delete provavelmente não |
| `notifications` | INSERT liberado aos dois lados por desenho do 0002 | Sim |

Padrão de correção: derrubar a policy `for all` e recriar como "coach full via `private.is_coach_of_client` +
aluno só SELECT", como feito aqui em `goals`/`history_events`.

> **Nota (0004):** `0004_student_write_lockdown.sql` fecha as brechas listadas acima (pagamentos/assinaturas/eventos,
> planos de treino/nutrição e filhos — aluno só lê o PUBLICADO —, `photos` com caminho canônico e check-in aberto,
> `workout_logs` sem DELETE), a leitura de `orientations` pelo aluno (`coach_note`), o INSERT de check-in de semana
> forjada e o `markMealRealized` (ponte temporária em `history_events`). `notifications` (INSERT cruzado) segue como
> desenho do 0002. Rodar a 0004 SEMPRE depois da 0003 e não reexecutar a 0003 depois dela (recriaria as duas policies
> que a 0004 substitui).

## 7. Como foi verificado

Postgres 18.4 real (binários `embedded-postgres`, instalado só no scratchpad), com stubs no estilo Supabase
(`auth.users`, `auth.uid()` lendo `request.jwt.claim.sub`, roles `anon/authenticated/service_role` com os default
privileges de `public`, schema `private` SEM `usage` pro `authenticated`, pra reproduzir o pior caso). Aplicadas
0001 → 0002 → dados pré-existentes → 0003, depois 0003 de novo (idempotência). 190 asserções de RLS como
`authenticated` (coach A, coach B, alunos A1/A2/B1), `anon` e `service_role`: 0 falhas. Cenários extras: banco
vazio; banco com duplicatas em `photos`/`orientations` (a migration passa, emite NOTICE e não cria o unique; após
limpar as duplicatas e rodar de novo, cria). NÃO coberto: PostgREST/GoTrue reais, versão 15/17 do Postgres de
produção (nenhuma sintaxe exclusiva do 16+/18 foi usada), storage.objects.
