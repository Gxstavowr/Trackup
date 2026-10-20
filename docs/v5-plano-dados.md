# Trackly V5 — Plano de dados das Fases 2 a 6

Escopo: itens 7–28 de `docs/todo-v5-original.md` (convite simplificado, questionário inicial,
"protocolo em preparação", jornada do onboarding, pacotes e preços, mudança de pacote, bloqueio de
módulos, fila de novos alunos, publicação por módulo, painel do proprietário, laboratório demo).

Migrações deste plano (escritas, **não aplicadas**; dry-run OK contra o banco real):

| Arquivo | Conteúdo |
|---|---|
| `supabase/migrations/0022_v5_onboarding_packages.sql` | pacotes, preços padrão, contrato com histórico, questionário, eventos do onboarding, view de status, RLS de módulo nos planos, novos tipos de notificação |
| `supabase/migrations/0023_v5_admin_demo_lab.sql` | `accounts.is_demo`, preço da mensalidade do Trackly, registro do laboratório, auditoria do admin, reset de demo e indicadores (só service role) |

Aplicar com `node scripts/migrate.mjs apply` (a partir de `web/`), **antes** do deploy do código que
as usa. As duas são aditivas e não reescrevem nenhuma linha existente.

---

## 1. Decisões principais

1. **Nada de sistema paralelo.** O cadastro do aluno continua sendo uma linha em `clients`. O convite
   continua com `clients.invite_status` (`pending` → `invited` → `active`), `/convite?id=` e
   `/auth/callback?invite=`. O V5 só **acrescenta** coisas: contrato, questionário e trilha de eventos.
2. **Alunos atuais = legado, nada muda pra eles.** `clients.onboarding_required` vale `false` por
   padrão. Só quem for criado pelo novo formulário (`create_invited_client`) recebe `true` e passa pelo
   questionário. Quem não tem contrato é tratado como **legado**: todos os módulos liberados como hoje
   (a regra é "publicado = visível").
3. **O estado do onboarding é derivado, não gravado.** Nenhuma coluna `onboarding_status` precisa ser
   mantida em sincronia. O estágio sai de fatos que já existem ou que o V5 grava: login vinculado,
   questionário, planos publicados e eventos. Assim a tela não consegue mostrar "protocolo concluído"
   com o plano ainda em rascunho (item 35). A trilha `client_onboarding_events` guarda o **histórico**
   (item 12, "preservar o histórico dos eventos") e as datas, mas não é a fonte do estado atual.
4. **O contrato é append-only.** Uma linha por acordo (inicial ou mudança). Toda escrita passa por
   funções `security definer` com checagem explícita. A API não tem INSERT/UPDATE/DELETE direto. Mudar
   preço padrão nunca toca contrato existente (o contrato guarda uma cópia do valor).
5. **Pacote do aluno ≠ mensalidade do coach.** O contrato do aluno (`client_service_contracts`) fica
   separado de `coach_billing_*` (0021) e de `subscriptions`/`payments` (o controle financeiro manual do
   coach). Nenhum indicador do Trackly usa valores de contrato de aluno.
6. **Estrutura do questionário em código, respostas no banco.** Mesmo padrão já usado no check-in
   (`lib/checkin-catalog.ts`). O catálogo fica em `web/lib/onboarding/questionnaire-catalog.ts`,
   versionado (`catalog_version`). Quando chegar o formulário original do coach, basta trocar o
   catálogo e subir a versão; as respostas antigas continuam legíveis pela versão gravada.
7. **Respostas sensíveis numa coluna separada.** Ficam em `sensitive_answers`, não em `answers`. A fila,
   os dashboards e o admin nunca selecionam nenhuma das duas colunas. A view
   `client_onboarding_status` não as expõe.
8. **Admin por allowlist no servidor** (`TRACKLY_ADMIN_USER_IDS`). `coach_users.role = 'admin'` existe
   desde a 0001, mas é um papel *dentro de uma conta de coach* e o app não usa. Por isso **não serve**
   para identificar o proprietário. As tabelas do admin só são acessíveis pela service role.
9. **A demo é isolada por dado, não por convenção de e-mail.** `accounts.is_demo` e `demo_scenario` mais
   o registro `demo_lab_profiles`. As funções de reset recusam qualquer conta que não seja demo. Os
   indicadores do admin excluem as contas demo.
10. **A RLS reforça o bloqueio de módulo.** O aluno só lê o plano publicado **se o módulo estiver no
    pacote**. O app também esconde, mas mesmo uma chamada REST direta não devolve a dieta de quem
    contratou só Treino (item 15, "não expor dados reais").

---

## 2. O que já existe e é reaproveitado

| Já existe | Como o V5 usa |
|---|---|
| `clients` (`invite_status`, `invited_at`, `activated_at`, `auth_user_id`, `start_date`) | Fonte de "convite enviado/aceito" e "conta criada". Novas colunas: `onboarding_required` e `birth_date` |
| `/convite?id=<client_id>` → `acceptInvite` (consentimento LGPD + magic link) → `/auth/callback?invite=` (vincula o login) | Continua igual. O V5 só registra eventos (`invite_accepted`, e `account_activated` por trigger) |
| `workout_plans` / `nutrition_plans`: rascunho (`is_draft`), publicado ativo (`not is_draft and archived_at is null`), versão anterior (`archived_at`), templates (`is_template`). RPCs `publish_workout_plan` / `publish_nutrition_plan` (0007/0008) | **É** a publicação por módulo. Não há tabela "protocolo": protocolo concluído = todos os módulos do pacote com plano publicado ativo. Um trigger registra `module_published` e `protocol_completed` |
| RLS 0003/0004 (`is_coach_of_client`, `current_client_id`, "aluno só lê publicado") | Base das policies novas. Na 0022 as policies `*_plans_client_read` são recriadas com a condição de módulo |
| `subscriptions` / `payments` (coach registra cobrança do aluno à mão) | Não muda. O contrato é o **acordo**; cobranças antigas mantêm o `amount_cents` delas (item 14: "não alterar retroativamente") |
| `coach_billing_subscriptions` / `coach_billing_events` (0021) | Fonte única do painel do proprietário. Nada de segundo fluxo SyncPay |
| `consent_records` (por `user_id`, sem FK para `clients`) | Inalterado. O consentimento de dados de saúde já cobre o questionário |
| `notifications` | O CHECK de `event_type` ganha `invite_accepted`, `questionnaire_submitted`, `protocol_ready` e `package_changed`. Hoje o callback usa `checkin_received` para avisar convite aceito, por falta de opção |
| `app/coach/protocol-queue.ts` (ponto de extensão da Fase 1, devolve `[]`) | Passa a ler a view `client_onboarding_status` |
| `scripts/seed-demo.mjs` (conta `coach.teste@trackly.test` e logins `@trackly.test`) | Ganha a marcação `is_demo`/`filled`, a conta vazia, o aluno "do zero" e o preenchimento de `demo_lab_profiles` |

---

## 3. Tabelas e colunas novas ou alteradas

### 3.1 `clients` (alterada — 0022)

| Coluna | Tipo | Motivo |
|---|---|---|
| `onboarding_required` | `boolean not null default false` | Separa o fluxo V5 (questionário obrigatório) do legado. Gravada por `create_invited_client`. O gate do portal só redireciona quando é `true` e ainda não há questionário enviado |
| `birth_date` | `date` (CHECK ≥ 1900-01-01) | O questionário pede a data de nascimento, e não a idade, porque idade envelhece. `age` continua existindo e é preenchida no envio se estiver vazia |
| índice `clients_account_email_uidx` | único `(account_id, lower(btrim(email)))` | Item 8: "evitar contas duplicadas ao repetir convite". **Só é criado se hoje não houver duplicata**; se houver, a migração emite NOTICE e segue. Conferir depois de aplicar: `select indexname from pg_indexes where indexname='clients_account_email_uidx'` |

### 3.2 `coach_service_prices` (nova — 0022)

Preço **padrão** do coach por pacote. PK `(account_id, package)`.

| Coluna | Observação |
|---|---|
| `package` | `training` \| `nutrition` \| `hybrid` |
| `price_cents` | > 0 |
| `billing_period` | `monthly` \| `quarterly` \| `semiannual` \| `annual` (mesmo domínio de `subscriptions.period`) |
| `updated_by`, `created_at`, `updated_at` | `updated_at` atualizado por trigger (reaproveita `private.coach_billing_touch_updated_at`) |

RLS: o coach da conta tem acesso total. O aluno não tem acesso.
Sem linha para o pacote significa "preço não configurado". O formulário de convite deixa o coach
definir o preço na hora (`p_save_as_default`).

### 3.3 `client_service_contracts` (nova — 0022)

Contrato do aluno, **append-only**.

| Coluna | Observação |
|---|---|
| `kind` | `initial` \| `change` |
| `package`, `price_cents` (≥ 0, cortesia permitida), `billing_period` | O acordo |
| `price_source` | `coach_default` (igual ao padrão no momento) \| `custom` (negociado). Calculado pela função |
| `effective_from` | Data de vigência (calendário America/Sao_Paulo) |
| `previous_contract_id`, `previous_package`, `previous_price_cents`, `previous_billing_period` | Cópia do contrato anterior (item 14: "registrar valor anterior") |
| `change_reason` (≤ 500), `agreed_with_client` | Item 14: motivo, e se foi discutido e acordado com o aluno |
| `client_confirmation` | `not_required` \| `pending` \| `confirmed` \| `declined`, mais `client_responded_at`. Etapa de confirmação pelo aluno **preparada**: por padrão não bloqueia a vigência (ver §11) |
| `voided_at`, `voided_by`, `void_reason` | Anula **só** uma mudança ainda não vigente |
| `created_by`, `created_at` | Autor |

Regras:
- **Contrato vigente** = linha não anulada com o maior `effective_from` ≤ hoje
  (`private.client_current_contract_id`).
- No máximo uma linha não anulada por `(client_id, effective_from)` (índice único parcial).
- No máximo **uma mudança agendada** por vez: `change_client_contract` recusa com
  `trackly:change_already_scheduled`.
- Mudança nunca é retroativa (`effective_from >= hoje`; `trackly:retroactive_change`).
- RLS: o coach da conta lê (SELECT). Ninguém escreve pela API (`revoke insert/update/delete`). O aluno
  lê o próprio pacote só por `get_my_service_package()`, que não devolve motivo nem autor.

### 3.4 `onboarding_questionnaires` (nova — 0022)

| Coluna | Observação |
|---|---|
| `catalog_version` | Versão do catálogo em código usada no preenchimento |
| `package`, `sections` | Cópia do pacote no momento da abertura e seções exibidas (`common` sempre; `training` e/ou `nutrition`). Null = legado |
| `status` | `draft` \| `submitted` (CHECK de forma: `submitted` ⇔ `submitted_at` e `protocol_due_at` preenchidos) |
| `answers` (≤ 64 KB) / `sensitive_answers` (≤ 32 KB) | jsonb `{chave: valor}`. Chaves sensíveis definidas no catálogo |
| `current_step` | Etapa onde o aluno parou (retomar) |
| `started_at`, `updated_at`, `submitted_at` | |
| `protocol_due_at` | **`submitted_at + 3 dias`, gravado no envio.** Nunca é recalculado nem fixo no código (item 11) |
| `coach_opened_at` | Primeira abertura pelo coach. Distingue "questionário enviado" de "protocolo em preparação" |

Regras: no máximo 1 rascunho por aluno (índice único parcial). Linhas enviadas nunca são editadas e
ficam como histórico. Um novo questionário depois do envio exige uma ação futura do coach ("pedir
atualização"), que não faz parte deste escopo. RLS: o coach da conta lê; o aluno lê os próprios
(item 11, "consultar os dados enviados"). Escrita só por RPC.

### 3.5 `client_onboarding_events` (nova — 0022)

Trilha append-only. `event` ∈ `invite_created`, `invite_sent`, `invite_send_failed`,
`invite_link_copied`, `invite_accepted`, `account_activated`, `questionnaire_started`,
`questionnaire_submitted`, `questionnaire_opened`, `package_set`, `package_change_scheduled`,
`package_change_voided`, `package_change_responded`, `module_published`, `protocol_completed`.

Colunas extras: `module`, `actor` (`coach` \| `client` \| `system`), `actor_user_id` (sem FK, é auditoria),
`sent_to` (e-mail de destino do convite), `simulated` (laboratório: nada saiu de verdade) e `detail`
(jsonb ≤ 4 KB, **nunca** com respostas).

Quem grava:
- **Triggers:** `invite_created` (INSERT em `clients`), `account_activated` (vínculo de
  `auth_user_id`), `module_published` e `protocol_completed` (publicação em `workout_plans` /
  `nutrition_plans`, este último uma vez só por aluno).
- **RPCs:** `package_*`, `questionnaire_*`.
- **Coach via INSERT direto** (policy estreita): só `invite_sent`, `invite_send_failed` e
  `invite_link_copied`, como ele mesmo e na própria conta.
- **Service role:** `invite_accepted` (em `app/convite/actions.ts`, que já usa admin).

RLS: o coach da conta lê. O aluno não lê (vê só o estágio derivado).

### 3.6 View `client_onboarding_status` (nova — 0022, `security_invoker = true`)

Uma linha por aluno visível a quem consulta, com: dados básicos do convite, `has_account`,
`onboarding_required`, `package`, `package_since`, último questionário (`questionnaire_status`,
`*_started_at`, `*_submitted_at`, `protocol_due_at`, `questionnaire_opened_at`),
`training_published`, `nutrition_published`, `training_draft`, `nutrition_draft`,
`invite_last_sent_at`, `invite_last_failed_at`, `invite_accepted_at` e `protocol_completed_at`.
**Sem respostas.** Como coach, vêm os alunos da conta com tudo. Como aluno, só a própria linha, com
pacote, rascunhos e eventos nulos ou false.

### 3.7 `notifications.event_type` (alterada — 0022)

O CHECK é recriado como superconjunto: + `invite_accepted`, `questionnaire_submitted`, `protocol_ready`,
`package_changed`. O envio do questionário já cria a notificação para o coach, na mesma transação.

### 3.8 `accounts` (alterada — 0023)

`is_demo boolean not null default false` e `demo_scenario` (`filled` \| `empty`, só com `is_demo`). O coach
não consegue alterar: `accounts` só tem policy de SELECT.

### 3.9 Tabelas só do admin (0023 — RLS ligado, sem policy, sem GRANT para `authenticated`)

| Tabela | Motivo |
|---|---|
| `platform_plan_prices` (`plan_code='coach_monthly'`, `amount_cents`, `effective_from`, `note`) | Item 23: "configuração centralizada e explícita, sem inventar preço". Sem linha, o MRR previsto fica `null` ("preço não configurado") |
| `demo_lab_profiles` (`key` ∈ `coach_filled`, `student_filled`, `coach_empty`, `student_fresh`; `user_id`, `account_id`, `client_id`) | Lista **fechada** de logins que o laboratório pode assumir. Um trigger exige conta `is_demo` e coerência entre coach/aluno, conta e login |
| `admin_audit_events` | Trilha do proprietário: `lab_switch`, `lab_return`, `lab_reset_*`, `platform_price_set`, `admin_login` |

---

## 4. Máquina de estados do onboarding

Derivada em código puro (`web/lib/onboarding/stage.ts`, testável) a partir de uma linha de
`client_onboarding_status`. Nada é gravado como "estado"; os eventos dão as datas e o histórico.

```
convite_nao_enviado ──(envio OK)──► convite_enviado ──(aluno aceita em /convite)──► convite_aceito*
        ▲   │(envio falhou: convite_falhou*)                                              │
        └───┘                                              (confirma e-mail → callback)  ▼
                                                                                    conta_criada
                                                                  (abre o questionário) │
                                                                                         ▼
                                                                          questionario_pendente
                                                                        (rascunho no servidor)
                                                                                 (envia) │
                                                                                         ▼
                                                                          questionario_enviado
                                                  (coach abre o questionário ou cria rascunho) │
                                                                                         ▼
                                                                          protocolo_em_preparacao
                                                   (publica 1 de 2 módulos — só Híbrido) │
                                                                                         ▼
                                                                          parcialmente_publicado
                                                       (todos os módulos do pacote publicados)
                                                                                         ▼
                                                                                    concluido
```
\* sub-estados de "convite enviado", úteis para o coach.

| Estágio (código) | Condição (avaliada nesta ordem) | Fonte |
|---|---|---|
| `invite_not_sent` | `!has_account` e sem `invite_last_sent_at` e `invite_status = 'pending'` | `clients`, eventos |
| `invite_failed` | `!has_account` e `invite_last_failed_at > coalesce(invite_last_sent_at, -∞)` | eventos |
| `invite_accepted` | `!has_account` e `invite_accepted_at` não nulo (aguardando o aluno confirmar o e-mail) | eventos |
| `invite_sent` | `!has_account` e (`invite_last_sent_at` ou `invite_status = 'invited'`) | `clients`, eventos |
| `legacy` | `has_account` e `!onboarding_required` e sem questionário | `clients` |
| `account_created` | `has_account` e sem questionário (não iniciado) | view |
| `questionnaire_pending` | `questionnaire_status = 'draft'` (em andamento, mostrar `current_step` se útil) | `onboarding_questionnaires` |
| `protocol_completed` | `submitted` e todos os módulos do pacote publicados (`training_published` / `nutrition_published`) | planos |
| `protocol_partial` | `submitted`, pacote Híbrido, exatamente 1 módulo publicado | planos |
| `questionnaire_submitted` | `submitted`, nada publicado, `questionnaire_opened_at` nulo e nenhum rascunho | questionário, planos |
| `protocol_preparing` | `submitted`, nada publicado, e (aberto pelo coach ou há rascunho) | questionário, planos |

Atributos derivados: `isOverdue = now > protocol_due_at && stage ∉ {protocol_completed}`, e
`dueAt = protocol_due_at`.

Garantias pedidas no TODO:
- "Convite pendente" e "questionário pendente" não se confundem: um exige `!has_account`, o outro
  exige `has_account`.
- "Questionário concluído" e "protocolo pronto" não se confundem: protocolo pronto exige plano
  publicado ativo; rascunho não conta.
- O texto do aluno mostra só o que ele precisa saber: questionário → "em preparação até DD/MM" →
  "Treino pronto, Nutrição em preparação" → home normal.

Gate do portal (item 9): `requireClient` manda para `/portal/onboarding` quando
`onboarding_required && questionnaire_status !== 'submitted'`. As rotas de onboarding, `/portal/conta`
e `/meus-dados` ficam isentas. O aluno legado nunca é redirecionado.

---

## 5. Regra de liberação de módulos

`modulesOf(package)`: `training` → {treino}; `nutrition` → {nutrição}; `hybrid` → {treino, nutrição};
`null` (legado) → não se aplica.

| Situação do módulo M | Estado (`web/lib/onboarding/module-access.ts`) | UI | Dados |
|---|---|---|---|
| Sem contrato (legado) | `available` se publicado, senão `empty` | como hoje | como hoje |
| M **não** está no pacote | `not_contracted` | prévia **demonstrativa** com cadeado e texto comercial, ação "Falar com o coach" (WhatsApp, como hoje) | **não buscar** plano real. A RLS também nega (policy `*_plans_client_read` + `private.client_has_module`) |
| M no pacote e publicado ativo | `available` | módulo normal | normal |
| M no pacote, não publicado, questionário ainda não enviado | `awaiting_questionnaire` | "Responda o questionário para o coach montar seu protocolo" | — |
| M no pacote, não publicado, questionário enviado | `preparing` (+ `dueAt`, `isOverdue`) | "Seu coach está preparando…, previsto até DD/MM". **Sem upsell** | — |

Protocolo completo = todos os módulos do pacote em `available`. Cada módulo é liberado assim que o
**respectivo** plano é publicado (item 16).

Pontos de aplicação no app: `app/portal/treino`, `app/portal/nutricao`, a home do portal, e
**`lib/portal-progress.ts`**. Este último lê planos com o client **admin** (linha ~96), que não passa
pela RLS, então precisa aplicar a regra explicitamente. Ações do aluno, como iniciar treino ou marcar
refeição, devem checar `module-access` no servidor antes de gravar.

---

## 6. Contrato e histórico de mudança de pacote

- **Criação** (item 7/13): `create_invited_client(name, email, phone, package, price_cents, period,
  save_as_default)` grava, numa transação, `clients` (pending, `onboarding_required`), o contrato
  `initial` (vigente hoje) e o evento `package_set`. Se o coach não tiver preço padrão, ele digita o
  valor e marca "salvar como padrão". A função grava em `coach_service_prices` só se ainda não existir
  preço para o pacote. Para e-mail repetido na conta, recusa com `trackly:client_email_exists` e o app
  oferece "retomar/reenviar o convite".
- **Aluno legado** recebe pacote com `set_initial_client_contract`. Aviso na UI: a partir daí, o que
  estiver fora do pacote fica bloqueado.
- **Mudança** (item 14): `change_client_contract(client, package, price, period, effective_from,
  reason, agreed_with_client, require_client_confirmation)`. Recusa mudança retroativa, mudança sem
  diferença, dupla agendada, e mudança no mesmo dia de um contrato que começou hoje (agendar a partir de
  amanhã). A "confirmação explícita" é um passo de UI (diálogo com antes e depois); o banco garante
  só o que não depende de UI.
- **Anular** uma mudança ainda não vigente: `void_scheduled_contract_change`.
- **Aluno confirma ou recusa**: `respond_to_contract_change`. Recusar não anula sozinho: o coach decide.
- **Financeiro**: o contrato não cria nem altera `subscriptions`/`payments`. Recomendação para a UI:
  na tela Pagamento do aluno, sugerir o valor e o nome do pacote do contrato vigente ao criar ou
  atualizar a assinatura (só para cobranças futuras; as já registradas mantêm `amount_cents`).

---

## 7. Questionário inicial

- **Catálogo** em `web/lib/onboarding/questionnaire-catalog.ts`: `QUESTIONNAIRE_VERSION`, seções
  (`common`, `training`, `nutrition`), etapas, perguntas com `key`, `input` (`number` \| `choice` \| `multi`
  \| `text` \| `date` \| `scale` \| `toggle`), `required`, `sensitive`, limites, opções e condição de
  visibilidade. Reaproveitar os tipos e validadores de `lib/checkin-catalog.ts` / `lib/checkin-steps.ts`
  quando der. Itens 9–10: perguntas **provisórias e mínimas**, marcadas como provisórias até chegar o
  formulário original do coach (não inventar perguntas definitivas).
- **Seções por pacote**: `sectionsFor(package)` dá `common` mais `training` e/ou `nutrition`.
  Pacote null (legado) dá só `common`.
- **Progresso no servidor**: o portal chama `save_my_onboarding_draft` a cada etapa (e com debounce),
  nunca localStorage (regra do projeto). Retomar = ler o rascunho (`answers`, `sensitive_answers`,
  `current_step`).
- **Envio**: o servidor do app valida as obrigatórias com o catálogo. Depois chama
  `submit_my_onboarding_questionnaire`, que grava, calcula `protocol_due_at`, preenche
  `height_cm`/`birth_date`/`age`/`gender` em `clients` **só onde estiver vazio** (nunca sobrescreve o
  coach), registra o evento e notifica o coach.
- **Sensíveis** (lesões, condições de saúde, medicamentos, ciclo, uso de substâncias…): vão para
  `sensitive_answers`. Aparecem só na seção "Questionário inicial" do perfil do aluno (coach) e para o
  próprio aluno. Nunca em fila, dashboard, admin, notificações, WhatsApp ou IA.
- **Histórico separado do check-in**: tabela própria. Nada vai para `checkin_answers` nem para `metrics`.
  O peso inicial pode ser exibido como "peso informado no questionário" sem virar métrica de semana.

---

## 8. Convite (itens 7–8)

O fluxo atual é: o coach cria → copia `/convite?id=` (ou marca "enviado") → o aluno aceita (consentimento
LGPD) → magic link → callback vincula. O TODO pede que o **envio** do link por e-mail parta do coach e
que o resultado seja verdadeiro.

Recomendação (a decidir, §11): a ação "Enviar convite" do coach chama `supabase.auth.signInWithOtp`
para o e-mail do aluno com `emailRedirectTo = /auth/callback?next=/portal&invite=<client_id>`. Esse é o
mesmo mecanismo que `acceptInvite` já usa; o template de e-mail do Supabase pode ser customizado.
- Sucesso: evento `invite_sent` (com `sent_to`), mais `invite_status = 'invited'` e `invited_at`.
- Erro: evento `invite_send_failed` (`detail.code`), e o app **não** diz que enviou.
- O consentimento continua garantido pelo gate existente (`requireClient` → `/consentimento`) para quem
  entrar pelo e-mail sem passar por `/convite`.
- Copiar o link: continua `/convite?id=`, com evento `invite_link_copied`.
- Reenviar: mesma ação, sujeita ao rate limit do Supabase (já tratado em `EMAIL_RATE_LIMIT_MESSAGE`).
- Retomar um convite pendente: a fila "Novos cadastros" lista `invite_not_sent`, `invite_sent`,
  `invite_failed` e `invite_accepted`, com a ação de reenviar.
- Conta demo: **não envia**. Grava `invite_sent` com `simulated = true` (item 28).

---

## 9. Painel administrativo (itens 21–25)

**Autorização** (`web/lib/admin/auth.ts`):
- `TRACKLY_ADMIN_USER_IDS` (UUIDs separados por vírgula), lida só no servidor (`server-only`).
- `requireAdmin()` faz `supabase.auth.getUser()` (validado no Auth) e compara o id com a allowlist.
  Fora da lista: `notFound()`, para não revelar que a área existe.
- É chamada no `app/admin/layout.tsx` **e** em toda página e Server Action do admin (layouts não
  re-renderizam entre rotas irmãs; mesmo aviso de `require-coach.ts`).
- `proxy.ts`: acrescentar `/admin` aos prefixos protegidos (só a checagem otimista de sessão).
- Os dados do admin vêm de `createAdminClient()`, **depois** de `requireAdmin()`. Nenhuma chave vai para
  o browser.
- Recomendado: exigir MFA (AAL2) do Supabase para a sessão admin (§11).

**Indicadores** (`admin_business_overview(p_from, p_to)`, service role, **exclui `is_demo`**): coaches,
alunos, novos coaches e alunos no período, assinaturas por status (`none`, `pending_first_payment`,
`active`, `overdue`, `suspended`, `cancelled`), última atualização, preço configurado, MRR previsto
(= preço × `active`, `null` sem preço), quantidade de eventos de pagamento confirmados no período,
cobranças previstas no período (`next_charge_at`), alunos aguardando questionário, protocolos em
preparação e distribuição por pacote (inclui `legacy`).

**Não calculado (falta dado confiável):** valor recebido em R$. Os eventos da SyncPay só guardam o
payload cru, sem coluna de valor. O método de pagamento também fica de fora:
`coach_billing_subscriptions` não tem coluna para isso, e hoje ele é inferido dos eventos de mandato.
A UI mostra "informação não disponível" (§11).

Detalhes por indicador: consultas service-role em `web/lib/admin/billing.ts` (lista de assinaturas
com conta, coach, status, `next_charge_at`, `updated_at`; últimos eventos com `event`, `received_at`,
`verified`, `processed_at`, **sem** payload na tela).

---

## 10. Laboratório de demonstração (itens 26–28)

**Cenários e contas** (criados ou marcados por `scripts/seed-demo.mjs`, service role):

| Perfil (`demo_lab_profiles.key`) | Conta | Conteúdo |
|---|---|---|
| `coach_filled` | conta atual `coach.teste@trackly.test` → `is_demo = true`, `demo_scenario = 'filled'` | dados do seed atual, mais contratos (Híbrido) para os alunos demo |
| `student_filled` | mesma conta (Ana, login demo existente) | aluno com histórico |
| `coach_empty` | **nova** conta demo `demo_scenario = 'empty'` (ex.: `coach.vazio@trackly.test`) | sem alunos, avaliações ou protocolos |
| `student_fresh` | ver §11 (recomendado: conta `filled`) | aluno ativo, `onboarding_required = true`, contrato Híbrido, sem questionário nem planos: começa pelo questionário |

**Troca de perfil sem logout manual** (`web/lib/admin/lab.ts`):
1. `requireAdmin()`. O alvo precisa estar em `demo_lab_profiles` e a conta precisa ser `is_demo`
   (o trigger já garante, e o servidor confere de novo).
2. `admin.auth.admin.generateLink({ type: 'magiclink', email })`, depois
   `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })` no client de servidor. A sessão vira a
   do perfil demo; nenhum e-mail é enviado.
3. Grava o cookie `trackly_lab` (httpOnly, secure, sameSite=strict, TTL curto) com
   `{ adminUserId, exp }` assinado por HMAC (`TRACKLY_LAB_SECRET`), e registra `admin_audit_events`
   (`lab_switch`).
4. "Voltar ao painel": valida a assinatura, a validade e se `adminUserId` ainda está na allowlist. Faz o
   mesmo processo para o usuário admin e registra `lab_return`. Cookie inválido ou vencido: login normal.
5. Faixa "Laboratório — dados de demonstração", com o perfil atual e os botões Trocar e Voltar: aparece
   em `app/coach/layout.tsx` e `app/portal/layout.tsx` quando o cookie `trackly_lab` é válido.
- O laboratório **nunca** assume um usuário fora de `demo_lab_profiles`. Assim não dá para usar o
  laboratório para entrar na conta de um usuário real (item 26).

**Reset** (service role, recusam conta real):
- `lab_reset_demo_account(account)` só aceita conta `is_demo` com `demo_scenario = 'empty'`. Apaga
  alunos (cascata), templates, log de planos e preços padrão. Devolve logins de aluno órfãos para o
  servidor apagar pela Auth Admin API (nunca os registrados no laboratório). O servidor também limpa o
  prefixo `{account_id}/` do bucket de fotos.
- `lab_reset_demo_student(client)` só aceita o aluno registrado como `student_fresh` em conta demo.
  Recria o cadastro com o mesmo login (a cascata limpa questionário, planos, check-ins e eventos), com
  contrato inicial igual ao pacote anterior, e atualiza `demo_lab_profiles`.
- O cenário preenchido é restaurado rodando `seed-demo.mjs`, que já só mexe na conta demo.

**Simulações obrigatórias em conta demo** (checagem em servidor por `accounts.is_demo`):
- e-mail de convite: `simulated`;
- checkout ou troca de método da SyncPay: bloqueado com aviso;
- webhooks: o e-mail `@trackly.test` nunca casa.

Os indicadores do admin excluem demo. O Financeiro do coach demo mostra os dados do seed já marcados
como demonstração na UI.

---

## 11. Riscos e pontos em aberto (decisão do Gustavo)

1. **Envio de e-mail do convite.** Recomendo `signInWithOtp` (§8), que já está integrado. Alternativa:
   `auth.admin.inviteUserByEmail`, que exige ajustar o callback para `token_hash`. Nos dois casos, o
   SMTP padrão do Supabase tem limite baixo de envios por hora. Para produção é preciso **SMTP próprio**
   configurado no dashboard do Supabase (tarefa externa).
2. **Início da semana 1 do check-in.** Hoje `start_date` = dia em que o convite é aceito. No V5 o aluno
   fica até 3 dias "em preparação" antes de ter plano. Proposta: manter `start_date` na ativação
   (regras atuais) **ou** só liberar o check-in quando houver ao menos um módulo publicado. A segunda
   opção é só de app; o dado já existe.
3. **Onde fica o aluno "Começar do zero".** Recomendo a conta `filled`: ele aparece como "Novo
   cadastro" na fila do coach demo, e o coach vazio continua vazio. A alternativa é uma terceira conta
   demo.
4. **Confirmação do aluno na mudança de pacote.** Está preparada (`pending`/`confirmed`/`declined`),
   mas não bloqueia a vigência. Decidir se uma mudança `pending` deve esperar o aceite.
5. **Valor recebido e método de pagamento no admin.** É preciso uma amostra real de payload da SyncPay
   (`cobranca_paga`) para extrair o valor. Depois disso: migração futura com `amount_cents`/`method`
   em `coach_billing_events` ou `coach_billing_subscriptions`, mais uma mudança mínima no webhook. Até
   lá, o painel mostra "não disponível".
6. **Preço da mensalidade do Trackly.** Inserir manualmente em `platform_plan_prices` quando for definido
   (ou por uma tela do admin, que grava `admin_audit_events`). Sem isso o MRR previsto fica vazio.
7. **Mesmo e-mail em contas de coaches diferentes.** `clients.auth_user_id` é único: um aluno ativo
   num coach não consegue ser ativado em outro com o mesmo login (o callback falha no update). É
   comportamento pré-existente; definir se é regra ("um coach por aluno") ou se vira tarefa futura.
8. **Índice único de e-mail** pode não ter sido criado se já houver duplicata (NOTICE). O runner não
   mostra NOTICE. Conferir depois de aplicar (§3.1).
9. **Validação das funções PL/pgSQL.** O dry-run valida sintaxe e todo o SQL das funções `language sql`
   e da view, mas **não** executa os corpos PL/pgSQL. Recomendo um teste de RLS e RPC em banco
   descartável (padrão da 0003: embedded-postgres com stubs do Supabase) antes de aplicar em produção,
   ou pelo menos um teste manual de cada RPC logo após aplicar.
10. **Locks.** A 0022 recria duas policies e cria triggers em `clients`, `workout_plans` e
    `nutrition_plans` (ACCESS EXCLUSIVE breve). Tem `lock_timeout = 5s`. Aplicar fora do horário de uso.
11. **RLS de módulo + legado.** Se o coach registrar pacote "Treino" para um aluno legado que já tem
    dieta publicada, a dieta some para o aluno. É o comportamento correto ("não contratado"), mas a UI
    precisa avisar antes de confirmar.

---

## 12. Funções e queries do servidor sugeridas (`web/lib`)

| Arquivo | Conteúdo |
|---|---|
| `lib/onboarding/packages.ts` (puro) | `PACKAGES`, `PackageId`, `ModuleId`, `modulesOf`, `packageIncludes`, rótulos e "o que inclui", `sectionsFor`, formatação de preço |
| `lib/onboarding/stage.ts` (puro + teste) | `deriveOnboardingStage(row, now)` → `{ stage, dueAt, isOverdue, missingModules }`; rótulos para coach e aluno |
| `lib/onboarding/module-access.ts` (puro + teste) | `moduleAccess({ package, published, questionnaireStatus, dueAt, onboardingRequired }, module)` |
| `lib/onboarding/errors.ts` | tradução dos códigos `trackly:*` novos |
| `lib/onboarding/prices.ts` (server) | `getCoachServicePrices()`, `upsertCoachServicePrice()` |
| `lib/onboarding/invites.ts` (server) | `createInvitedClient()` (RPC), `sendInviteEmail(clientId)` (OTP + eventos + `simulated` em demo), `recordInviteLinkCopied()`, `getInviteStatus()` |
| `lib/onboarding/contracts.ts` (server) | `getClientContracts(clientId)`, `setInitialContract`, `changeContract`, `voidScheduledChange`, `getMyServicePackage()`, `respondToContractChange` |
| `lib/onboarding/questionnaire-catalog.ts` (puro + teste) | catálogo versionado, validação, divisão `answers`/`sensitive_answers` |
| `lib/onboarding/questionnaire.ts` (server) | `getMyQuestionnaire()`, `saveMyQuestionnaireDraft()`, `submitMyQuestionnaire()`, `getClientQuestionnaire(clientId)` (coach; sensíveis só aqui), `markQuestionnaireOpened()` |
| `lib/onboarding/status.ts` (server) | `getOnboardingStatuses(filter)` (view, coach), `getMyOnboardingStatus()` (aluno: view + `get_my_service_package`) |
| `app/coach/protocol-queue.ts` | passa a usar `getOnboardingStatuses` (já tem o contrato de tipos) |
| `lib/admin/auth.ts` | `isAdminUserId`, `requireAdmin` |
| `lib/admin/overview.ts` | `getBusinessOverview(period)` → RPC `admin_business_overview` |
| `lib/admin/billing.ts` | listas de assinaturas e eventos recentes (sem payload) |
| `lib/admin/audit.ts` | `recordAdminEvent()` |
| `lib/admin/lab.ts` | `switchToLabProfile(key)`, `returnToAdmin()`, `readLabCookie()`, `resetEmptyScenario()`, `resetFreshStudent()` |
| `lib/demo.ts` | `isDemoAccount(accountId)` / `isCurrentCoachDemo()` (lê `accounts.is_demo`) |

---

## 13. Pacotes de trabalho paralelos

Pré-requisito comum: **0022 e 0023 aplicadas** (Gustavo). Fora disso, só WP-A e a parte de leitura de
WP-B bloqueiam os outros. "Toca" lista os arquivos de cada WP; arquivos de outro WP só são
**importados**, nunca editados.

| WP | Entrega | Depende de | Toca (exclusivo) |
|---|---|---|---|
| **A — Fundação (puro)** | tipos, pacotes, estágio, acesso a módulo, erros, com testes | — | `lib/onboarding/packages.ts`, `stage.ts`, `module-access.ts`, `errors.ts` (+ `*.test.ts`) |
| **B — Preços padrão** (item 13) | seção "Pacotes e preços" em Configurações | A | `lib/onboarding/prices.ts`, `app/coach/configuracoes/service-prices-section.tsx`, `app/coach/configuracoes/service-prices-actions.ts`, 1 linha em `app/coach/configuracoes/page.tsx` |
| **C — Convite simplificado** (7–8) | formulário nome/e-mail/telefone/pacote/preço, envio real, reenvio, cópia, estados, `invite_accepted` | A, B (`getCoachServicePrices`) | `lib/onboarding/invites.ts`, `lib/demo.ts`, `app/coach/alunos/add-client-form.tsx`, `app/coach/alunos/actions.ts`, `app/coach/alunos/[id]/copy-invite-button.tsx`, `app/convite/actions.ts`, `app/auth/callback/route.ts` (só o `event_type` da notificação) |
| **D — Questionário (aluno)** (9–11) | catálogo, rascunho no servidor, envio, tela "protocolo em preparação", ver respostas, gate | A | `lib/onboarding/questionnaire-catalog.ts`, `lib/onboarding/questionnaire.ts`, `app/portal/onboarding/**` (novo), `app/portal/require-client.ts` |
| **E — Home e módulos do aluno** (11, 15, 16, 20) | home em modo onboarding vs normal, cadeado e prévia demo, "em preparação", reforço em `portal-progress` | A, D (rota `/portal/onboarding/respostas` combinada) | `lib/onboarding/status.ts`, `app/portal/page.tsx`, `app/portal/treino/page.tsx`, `app/portal/nutricao/page.tsx`, `lib/portal-progress.ts`, `components/portal/module-lock.tsx`, `components/portal/module-preparing.tsx` (novos) |
| **F — Fila e perfil (coach)** (4 parcial, 12, 17, 18) | aba "Novos cadastros" com filtros, `protocol-queue`, seção "Questionário inicial" no perfil, badges de estágio | A, D (catálogo, só leitura) | `app/coach/protocol-queue.ts`, `app/coach/alunos/page.tsx`, `app/coach/alunos/student-list.tsx`, `student-situation.ts`, `status-badges.tsx`, `app/coach/alunos/[id]/questionario/**` (novo), `app/coach/alunos/[id]/student-tabs.tsx` |
| **G — Protocolo por pacote** (19–20) | painel "o que falta" no aluno, editores condicionados ao pacote, notificação `protocol_ready` ao concluir | A | `app/coach/alunos/[id]/protocol-panel.tsx` (novo), `app/coach/alunos/[id]/page.tsx`, `app/coach/alunos/[id]/treino/page.tsx`, `app/coach/alunos/[id]/nutricao/page.tsx`, `lib/repository.ts` (**só** `publishWorkoutPlan`/`publishNutritionPlan`) |
| **H — Mudança de pacote** (14) | tela Pacote do aluno com histórico, mudança com confirmação, anular, confirmação do aluno | A | `lib/onboarding/contracts.ts`, `app/coach/alunos/[id]/pacote/**` (novo), `app/portal/conta/page.tsx` + `app/portal/conta/contract-change-card.tsx` (novo) |
| **I — Admin** (21–25) | auth, layout próprio, visão de negócio, assinaturas e eventos, preço do Trackly | — (A só para rótulos) | `lib/admin/auth.ts`, `overview.ts`, `billing.ts`, `audit.ts`, `app/admin/**` (exceto `laboratorio`), `proxy.ts` |
| **J — Laboratório** (26–28) | seed (`is_demo`, conta vazia, aluno do zero, `demo_lab_profiles`, contratos), troca de perfil, faixa de demo, reset, bloqueio de checkout em demo | I (`requireAdmin`, `audit`), C (`lib/demo.ts`) | `scripts/seed-demo.mjs`, `lib/admin/lab.ts`, `app/admin/laboratorio/**`, `components/demo-banner.tsx`, `app/coach/layout.tsx`, `app/portal/layout.tsx`, `app/coach/billing-actions.ts` (guarda demo) |

Ordem sugerida:
1. Aplicar as migrações e fazer A (curto).
2. Em paralelo: B, D, G, H, I.
3. Depois: C (precisa de B), E e F (precisam do catálogo de D), J (precisa de I).

Conflitos conhecidos com a Fase 1 (arquivos já modificados no working tree):
- `app/coach/layout.tsx`, `app/portal/layout.tsx` (J) e `app/portal/page.tsx` (E): coordenar com quem
  está na identidade visual.
- `app/coach/page.tsx` **não** precisa ser tocado (F só implementa `protocol-queue.ts`).

Testes esperados por WP: puros com `node --test` (padrão `lib/*.test.ts`); RPC e RLS com o teste de
banco descartável do §11.9 (WP-A ou um WP-T dedicado, se Gustavo quiser).
