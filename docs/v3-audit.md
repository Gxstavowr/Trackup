# Trackly — Auditoria técnica antes do V3

Data: 2026-10-09 (≈21:50–22:00). Base: árvore de trabalho com o V2 **não commitado** (oficial). Referência
anterior: `docs/v2-audit.md` — continua válido para mapa de rotas (§1), modelo de dados de treino/nutrição (§6) e
RLS; aqui só o que mudou ou o que o V3 precisa. Caminhos relativos a `web/` salvo indicação.

> **ATENÇÃO — árvore em movimento.** Durante esta auditoria outros agentes estavam editando (mtime 21:52–21:56):
> `app/portal/treino/rest-timer-state.ts` (novo), `rest-timer.tsx`, `session-view.tsx` (tarefa 14),
> `app/portal/layout.tsx` + `portal-nav.tsx` (tarefa 9), `app/coach/alunos/client-row.tsx`, `row-menu.tsx`,
> `student-list.tsx` (tarefa 18), `app/coach/layout.tsx` + `coach-nav.tsx` (tarefa 19), `app/portal/conta/page.tsx`
> (tarefa 22, comentário "V3 #22"), `components/ui/overlay.tsx`. O que está descrito para essas áreas é o estado
> observado no momento; releia o arquivo antes de editar.

---

## 0. Lint / build / testes (tarefa 6 da auditoria)

- Scripts (`package.json`): `dev` (`next dev -p 8791`), `build`, `start`, `lint` (`eslint`, config
  `eslint.config.mjs` = next core-web-vitals + typescript), `backup`. **Não há script `test`.**
- Testes: só unitários puros com `node:test`, em `lib/*.test.ts` (10 arquivos: `checkin-week`, `finance/metrics`,
  `food-macros`, `insights`, `nutrition-builder`, `nutrition-session`, `progress-summary`,
  `week-comparison-format`, `workout-builder`, `workout-session`). Rodam com `npx tsx --test lib/<x>.test.ts`;
  **`tsx` não está em `node_modules`** (npx baixa) e alguns testes importam `@/…` (ex.: `checkin-week.test.ts` →
  `@/lib/portal-today`), então `node --test` puro não resolve. Não há Playwright/Vitest/Jest; `eval-initial.yml` é
  só um snapshot de acessibilidade (Playwright) do coach, não um teste. Nenhum `scripts/*qa*` no repo
  (`seed-qa-output.json` é saída de um script de QA que não está versionado; contém credenciais de teste).
  `scripts/seed-demo.mjs` gera dados demo.
- **Baseline `npm run lint` (rodado agora): 0 erros, 6 warnings**, todos `@typescript-eslint/no-unused-vars` em
  `scripts/seed-demo.mjs` (110 `computeWeekInfo`, 786 `key`, 820 `__week`/`__kind`, 993 `__key`, 1099
  `foodIdByName`). Build não executado (dev server em 8791 usa `.next`).

---

## 1. Check-in do aluno: formulário → action → DB → storage → UI

### Fluxo
| Camada | Arquivo / símbolo |
|---|---|
| Página | `app/portal/checkin/page.tsx` — decide estado: sem instância, enviado/avaliado (`CheckinSent`), fora da janela (`checkinWindow`), sem perguntas, ou `<CheckinForm>`; passa `suggestedWorkouts` (`getCompletedWorkoutSessionCountForWeek`). |
| Form (client) | `app/portal/checkin-form.tsx` (956 linhas). `PhotoStep` (l.49–278), rascunho local (l.282–327), `CheckinForm` (l.374+): passos via `buildCheckinSteps`, validação por passo `validateStep` (l.573) e no envio `checkSubmission` (l.590), render por tipo (l.739–846), revisão (l.858–915), barra fixa (l.923–953). |
| Regras puras | `lib/checkin-steps.ts`: `CHECKIN_STEPS` (4 passos: body/food/training/wellbeing), `STEP_BY_TOKEN` (key/`tracks` → passo), `buildCheckinSteps`, `checkAnswer` (number: vírgula→ponto, 0–100000, `weight_kg` 20–500; scale: inteiro 1–5; **qualquer outro tipo = texto livre ≤2000**), `checkSubmission`. |
| Actions | `app/portal/actions.ts`: `submitCheckinAction` (→ `submitCheckin`), `saveCheckinDraftAction` (→ `saveCheckinDraft`), `uploadCheckinPhotoAction` (→ `uploadCheckinPhoto`), `getCheckinPhotosAction`. |
| Repositório | `lib/repository.ts`: `getTemplateWithQuestions` (l.~287, **admin client**, template mais antigo da conta + perguntas `active`), `getOrCreateCheckinInstance` (l.327, cria no GET), `getCurrentCheckin` (l.389, aplica `applyMetricSettingsToQuestions`), `METRIC_KEYS_FROM_ANSWERS` (l.~448: weight_kg, waist_cm, hip_cm, body_fat_pct, workouts_count, cardio_count, water_l, sleep_h, energy, hunger), `recordMetricsFromAnswers`, `loadCheckinForWrite`, `writeAnswers` (upsert / `value=null`, nunca DELETE), `saveCheckinDraft` (l.572), `CheckinFieldError` (l.598), `submitCheckin` (l.625: gate de janela → `checkSubmission` → respostas → métricas → status `submitted` condicional → notificação `checkin_received`). |
| Validação servidor de obrigatórias | `submitCheckin` → `checkSubmission(questions, answers)` com as MESMAS perguntas do form (`loadCheckinForWrite` + `applyMetricSettingsToQuestions`). Erro vira `{error, field}` e o form navega até o passo. **Fotos não são validadas no envio** (nem no cliente: `PhotoStep` é "(opcional)", l.159; revisão "Nenhuma foto enviada (opcional)", l.904). |
| Tabelas | `checkin_templates`, `checkin_questions`, `checkin_instances` (unique client_id+week_number), `checkin_answers` (unique checkin_id+question_key, `value text`), `photos`, `metrics` — `supabase/migrations/0001_init.sql:137-210`. |

### Fotos (storage)
- Bucket privado único **`checkin-photos`** (`lib/storage/buckets.ts:21`), criado sob demanda por
  `ensureCheckinPhotosBucket` (admin; só `image/jpeg`, 5 MB). **Sem policies em `storage.objects`**: todo acesso
  passa pelo servidor com admin depois das checagens.
- Path: `{account_id}/{client_id}/week-{n}/{angle}.jpg` — `buildPhotoPath` (`buckets.ts:34-41`), sempre gerado no
  servidor. Validação de path ao ler/assinar: `isOwnedPhotoPath` (`buckets.ts:49-57`, regex
  `/^week-\d+\/(front|back|side)\.jpg$/`). Mesma regra no banco: `private.client_can_write_photo`
  (`supabase/migrations/0004_student_write_lockdown.sql:188-210`, concatena `p_angle` — genérico, não lista ângulos)
  usada pelas policies de `photos` (0004:455, :465).
- Upload: client comprime (`lib/storage/compress-image.ts`, ~1600px q0.82) → `uploadCheckinPhotoAction(formData{checkinId, angle, file})`
  → `uploadCheckinPhoto` (`lib/storage/checkin-photos.ts:191-311`: `isPhotoAngle`, UUID, JPEG magic bytes, só o
  próprio aluno, só `pending/late`, upload admin `upsert`, linha em `photos` via sessão (update-or-insert manual),
  URL assinada 600 s). Leitura: `listClientPhotos` (l.129, aluno ou coach dono/admin), `listPhotosForCheckin`.
- Índice único `photos_client_week_angle_uidx` (0003:744, condicional a não haver duplicatas).

### Ângulo `'front'|'back'|'side'` — TODOS os arquivos que referenciam
| Arquivo | O quê |
|---|---|
| `supabase/migrations/0001_init.sql:190` | `photos.angle text not null check (angle in ('front','back','side'))` — **única restrição de DB** (constraint inline, nome gerado automaticamente — provavelmente `photos_angle_check`; confirmar em `pg_constraint` antes de dropar). |
| `supabase/migrations/0004_student_write_lockdown.sql:35,187-210` | comentário + `client_can_write_photo` (path com `p_angle`, sem lista — não precisa mudar). |
| `supabase/migrations/0003_…sql:726-744` | unique (client_id, week_number, angle) — independe dos valores. |
| `lib/storage/buckets.ts:8,26-31,56` | `PhotoAngle`, `PHOTO_ANGLES`, `isPhotoAngle`, regex de `isOwnedPhotoPath`. |
| `lib/storage/checkin-photos.ts:10-11,36,145,197` | usa `PhotoAngle`/`isPhotoAngle` (sem literais). |
| `lib/week-comparison-format.ts:1,21,128-141` | `ANGLE_LABEL` (side="Lateral"), `ANGLE_PHRASE`, `COMPARISON_ANGLES = ["front","back","side"]`, `ComparisonWeek.photoAngles`. |
| `lib/week-comparison.ts:3,62,113-149` | filtra com `isPhotoAngle` ao montar `photoAngles` (ângulo desconhecido é descartado silenciosamente). |
| `app/portal/checkin-form.tsx:26-31,56-60,161,167,903` | **tipo local duplicado** `PhotoAngle`, `PHOTO_SLOTS` (front "Frente", side "Lado", back "Costas"), estado inicial dos 3 slots, "de 3", `grid-cols-3`, "x de 3 enviadas". |
| `app/portal/actions.ts:90,107` | comentário + repassa `angle` do FormData. |
| `app/coach/alunos/[id]/photo-triptych.tsx:6-10,35` | `ANGLES` (front/side/back, rótulo "Lado"), `grid-cols-3`. Usado por `fotos/page.tsx:79` e (via `PhotoImage`) por `avaliacao/compare-slider.tsx`, `portal/progresso/latest-photos.tsx`. |
| `app/coach/alunos/[id]/avaliacao/week-comparison.tsx:5,96,178-232,313-316` | seletor de ângulo (usa `COMPARISON_ANGLES`/`ANGLE_LABEL`/`ANGLE_PHRASE`), `fallbackAngle`. (Obs.: `ViewMode = "side" \| "slider"` na l.44 é "lado a lado", **não** é ângulo.) Usado por `avaliacao/page.tsx:142` e pela aba Fotos. |
| `app/portal/progresso/week-compare.tsx:5,39-66,148-154` | seletor de ângulo do aluno, fallback `"front"`. |
| `app/portal/progresso/latest-photos.tsx:6,23,32-60` | `COMPARISON_ANGLES`, `ANGLE_LABEL`, `grid-cols-3`. |
| `lib/privacy/client-data.ts:4,75` | export/exclusão LGPD usa `isOwnedPhotoPath` — herda a regex. |
| `scripts/seed-demo.mjs` | não grava fotos (só alimentos/exercícios com "Costas" como categoria — não é ângulo). |
| Não referenciam ângulo | `evolucao/evolution-view.tsx`, `lib/evolution.ts`, `lib/history.ts`, `lib/evaluations.ts` (só pula `type === "photos"`, l.470), `evaluation-signals.ts`. |

Inconsistência de rótulo já existente: "Lado" (`checkin-form.tsx`, `photo-triptych.tsx`) × "Lateral"
(`week-comparison-format.ts`).

---

## 2. Perguntas do check-in

- **Modelo** (`0001_init.sql:137-158`): `checkin_templates(id, account_id, name default 'Padrão', created_at)`;
  `checkin_questions(id, template_id, key, label, type, unit, step int default 1, tracks, required, active,
  sort_order)`. **CHECK de `type`: `'number','scale','boolean','select','text','photos','scale+text','number+text','stepper'`**.
  Não há coluna de opções (`options`), de condição/visibilidade, de "sistema/bloqueada", nem unique
  (template_id, key). `step` é incremento de stepper, não etapa. RLS: coach escreve via
  `checkin_questions_by_template` (0001:265); aluno lê via `checkin_questions_client_read` (0003:485-486) — o
  comentário em `repository.ts:~270` que justifica o admin client está desatualizado.
- Tipo TS: `CheckinQuestionType`/`CheckinQuestion` em `lib/repository.ts:198-230`.
- **Template padrão**: semeado só no cadastro do coach, `app/(auth)/cadastro/actions.ts:140-197` (admin, best-effort):
  `weight_kg` (number, kg, **required**), `adherence_pct` (scale, required), `energy` (scale), `notes` (text).
  Não existe mecanismo de upgrade para contas existentes. O formulário usa sempre o template **mais antigo** da conta
  (`getTemplateWithQuestions`; mesmo critério em `question-actions.ts#loadTemplate` e `evaluations.ts:~430`).
- **Render por tipo** (`checkin-form.tsx`): `scale` → 5 botões 1–5 (l.739-777, `SCALE_OPTIONS` l.335);
  `number` → input `inputMode=decimal` com unidade (l.783-806); **todo o resto (boolean, select, stepper, combos)
  → `<textarea>`** (l.807-819). Revisão formata só scale/number (l.881-889). Não há controle de escolha/boolean.
- **Etapas**: `lib/checkin-steps.ts#STEP_BY_TOKEN` — chave ou `tracks` reconhecidos; desconhecidas herdam a etapa
  anterior. Novas chaves V3 (cardio, água, sono, intestino, inchaço, emocional, ciclo, hormônios, exame) precisam
  entrar aqui (ou receber `tracks`).
- **Rascunho**: duplo — `localStorage` chave `trackly:checkin-draft:<checkinId>` (`checkin-form.tsx:288-327`,
  respostas + passo + dirty) e servidor (`saveCheckinDraftAction` → `checkin_answers` com check-in pending, autosave
  800 ms, retry 12 s, l.334-335/437-470). Regra do usuário (memória): rascunho de check-in é aceito, mas respostas V3
  sobre hormônios/estimulantes/peptídeos/ciclo são dados sensíveis (LGPD art. 11) — considerar excluí-las do
  `localStorage`.
- **Revisão**: último passo (`reviewIndex = steps.length`), lista por etapa com "Editar", resumo de fotos
  (l.858-915). Botão "Enviar" bloqueado enquanto foto sobe.
- **Coach vê as respostas**: `lib/evaluations.ts#getEvaluationDetail` (l.370; respostas l.415-491, `formatAnswer`
  l.352: só scale/number formatados) → `AnswersSection` em `app/coach/alunos/[id]/avaliacao/page.tsx:256-303`
  (curtas em grade, longas em `<details>`). Também: `lib/week-comparison.ts:83-93` (só chaves de
  `COMPARISON_METRIC_TABLE_KEYS`), `lib/insights-data.ts:74` (só `adherence_pct`), `lib/privacy/client-data.ts`
  (export). Notificação de check-in é genérica (não cita respostas). ⇒ perguntas condicionais com chaves novas
  (fora de `METRIC_KEYS_FROM_ANSWERS`/`COMPARISON_METRIC_TABLE_KEYS`) **já ficam fora de dashboards/notificações**;
  só aparecem na lista de respostas da avaliação e no export.
- **Gestão pelo coach**: `app/coach/configuracoes/question-actions.ts` (`TYPES = ["number","scale","text"]` l.22;
  `STEP_TRACKS` l.24; chave custom `q_xxxxxxxxxx`; perguntas "do sistema" = chave sem `q_`; versionamento quando
  já há respostas; máx. 30 ativas) e `questions-manager.tsx` (`TYPE_LABEL` l.19-27, checkbox "Obrigatória" l.106).
- **Pergunta de peso "do sistema"**: existe (`weight_kg`). **O flag `required` PODE ser desligado** pelo coach:
  `saveQuestionAction` atualiza `{label, required}` em pergunta do sistema (`question-actions.ts:126-135`) e o
  checkbox aparece para ela. Além disso, o coach pode **ocultar o peso por aluno** (`client_metric_settings`,
  `lib/metrics-settings.ts#applyMetricSettingsToQuestions` l.115-142 remove a pergunta se `tracked=false`;
  `setMetricTracked` l.192). Para "peso obrigatório" (tarefa 2) é preciso travar os dois caminhos + o servidor.

---

## 3. Sexo/gênero do aluno

- **Existe** `clients.gender text` (nullable, texto livre) — `0001_init.sql:60`; tipo `Client.gender`
  (`lib/repository.ts:43`, input l.60, gravado l.157).
- **Não é capturado na UI**: `app/coach/alunos/add-client-form.tsx` / `actions.ts:35-58` não têm campo de sexo; só
  `scripts/seed-demo.mjs` grava ("feminino"/"masculino"). Exibido em `app/portal/conta/page.tsx:23-30,101,131-139`
  (`GENDER_LABEL` aceita female/male/other e pt-BR).
- Aluno só tem SELECT em `clients` (`clients_self_read`) — não pode gravar o próprio sexo; o coach pode (RLS
  `clients_coach_full_access`). Para a pergunta condicional de ciclo: ou o coach preenche `gender` (formulário de
  cadastro/edição — sem migration), ou o check-in pergunta "aplica-se a você?" e trata como condição local. Valores
  são livres: normalizar (`feminino|female`).

---

## 4. Portal do aluno

- **Bottom nav**: `app/portal/portal-nav.tsx` (4 abas: Início [também ativo em `/portal/checkin`], Treino,
  Nutrição, Progresso; `fixed bottom-0`, `pb-[env(safe-area-inset-bottom)]`). Padding da página:
  `app/portal/layout.tsx` — agora define `[--portal-nav-h:4.25rem]` no wrapper (l.46) e `main` com
  `pb-[calc(var(--portal-nav-h)+env(safe-area-inset-bottom)+2rem)]` (l.71) — **editado durante a auditoria (tarefa 9)**.
  Barra fixa do check-in usa `bottom-[calc(var(--portal-nav-h,4.5rem)+env(safe-area-inset-bottom))]`
  (`checkin-form.tsx:926`) + espaçador `h-24` (l.925). Outros fixos: `components/ui/overlay.tsx` (Drawer bottom
  sheet). Coach: `app/coach/layout.tsx:60` e `avaliacao/decision-bar.tsx:24` usam `3.75rem`/`6.5rem` fixos.
- **Home** `app/portal/page.tsx` (758 l.): dados l.80-90 (`getCurrentCheckin` — cria instância no GET —, orientação,
  treino, nutrição, logs, `getWeightProgress`, métricas, meal logs); `buildCheckinItem` l.172 (chips de etapas
  estáticos l.246), `buildWorkoutItem` l.280, `buildMealItem` l.361 (usa `pickNextMeal`); `Hero` l.510,
  `CoachMessage` l.653, `ProgressSummary` l.671 ("Seu progresso · Semana N", treinos x/y, peso). Prioridade:
  check-in > treino > refeição.
- **Nutrição** `app/portal/nutricao/page.tsx`: relógio SP calculado **uma vez no servidor** (l.43
  `getSaoPauloClock`), seletor de dia `?dia=1..7`, "Agora" (refeição sem log iniciada há ≤60 min) / "Próxima"
  (l.93-102, `toMin` local l.33). **Não há contagem regressiva nem atualização no cliente.** Helpers de fuso:
  `lib/portal-today.ts` (`getSaoPauloClock` l.43, `todayDateSP` l.114, `isTodaySP` l.119, `pickNextMeal` l.171 —
  comentário l.165-166 desatualizado: logs hoje são por dia). Home usa `pickNextMeal`; a página de nutrição usa
  lógica própria — duas regras de "próxima refeição".
  - **kcal**: helper único `lib/food-macros.ts` (`sumKnownMacros` l.133, `scaleFoodMacros` l.99, `formatKcal`,
    `macrosSummaryText` l.77). Dia: `day-summary.tsx` (anel, l.68-125). Refeição: chip total
    `nutricao/meal-card.tsx:65-67`. **Por alimento: só dentro de "Detalhes"** (`meal-card.tsx:215-222`, texto de
    `macrosSummaryText`). Coach: `macro-chips.tsx`, `plan-editor.tsx:188-216`, `student-preview.tsx:44`.
- **Progresso** `app/portal/progresso/page.tsx` (246 l.). Ordem atual: `PageHeader` → `LiveEvolutionSummary`
  (card "Resumo automático dos seus registros", `evolution-summary.tsx`, regras em `lib/progress-summary.ts`) →
  empty state → chips de âncora → **Medidas** (`#metricas`, `LiveEvolutionView` = `EvolutionView` do coach) →
  **Comparar** (`#comparar`, `week-compare.tsx`, se ≥2 semanas) → **Fotos** (`#fotos`, `latest-photos.tsx`, só se
  não há comparação) → **Jornada** (`journey.tsx`) → Orientações → Metas → Mudanças. Período compartilhado em
  `progress-period.tsx` (default 12). Dados: `lib/portal-progress.ts#loadPortalProgress`.
  - **"semana 3" × "semana 10"** — origem provável: `lib/evolution.ts:66-67` (`getStudentEvolution`) lê `metrics`
    e `checkin_instances` **sem limite superior de semana**, enquanto `lib/week-comparison.ts:52-65,126-128`
    (Comparar/Jornada/Fotos) corta em `week_number <= currentWeek`, e `currentWeek` vem de `clients.start_date` via
    `lib/checkin-week.ts#computeWeekInfo` (semanas de calendário desde 0014). Se há métricas com `week_number` maior
    que a semana corrente (dados demo: `scripts/seed-demo.mjs` calcula semanas com o algoritmo antigo de 7 dias
    corridos, l.108-128/650-676, e o QA pode ter `start_date` recente), o resumo/gráfico diz "semana 10" e
    Home/Jornada dizem "Semana 3". Correção sem migration: clamp em `getStudentEvolution` (ou no consumidor) +
    reseed. Confirmar com os dados reais do aluno QA.
- **Conta** `app/portal/conta/page.tsx`: já sem itens "Em breve" (comentário "V3 #22", l.79-82; editado às
  21:54). Seções: Perfil (somente leitura) → Meu plano → Notificações → Privacidade/legal → sair.
- **Treino / timer de descanso**: `app/portal/treino/session-view.tsx` + `rest-timer.tsx` +
  **`rest-timer-state.ts` (novo, não versionado, criado às 21:52 — tarefa 14 em andamento)**. Estado atual:
  reducer `restReducer` com `pause/resume/add/sessionPause/sessionResume/skip`; pausar o treino faz
  `dispatchRest({type:"sessionPause"})` (`session-view.tsx:236`) — o antigo `setRestTimer(null)` (HEAD:
  `session-view.tsx:197` `onDismiss`) não existe mais; botão de acréscimo agora é **+30 s** (`REST_ADD_MS = 30_000`,
  `rest-timer-state.ts:35`), não +15 s. Verificar com quem está na tarefa 14 antes de mexer.

---

## 5. Coach

- **Acompanhamento** `app/coach/page.tsx` × **Avaliações** `app/coach/avaliacoes/page.tsx`: mesma fonte
  (`getEvaluationQueue`, `lib/evaluations.ts`) e mesmo agrupamento (`groupRows`, `lib/evaluation-situation.ts`);
  componentes compartilhados de `app/coach/avaliacoes/evaluation-ui.tsx` (`EvaluationGroup`, `RowsList`,
  `GroupEmpty`, `StateBadge`, `STATE_META` l.~32). Diferença: `/coach` tem cabeçalho "Olá", card de resumo
  (`countEvaluations`, `countAttention`) e limita linhas (`LIMITS` l.17: 8/6/3); `/coach/avaliacoes` tem filtros
  `?estado=todas|avaliar|aguardando|concluidas` (+ legados) e lista completa. Sobreposição ~total.
- **Avaliação individual** `app/coach/alunos/[id]/avaliacao/page.tsx` — ordem de render: `MarkReviewOpened` (grava
  `review_opened_at` no mount) → Situação (semana, badge, datas, `CycleDoneBanner`) → **`WeekSummary`**
  (`week-summary.tsx`: tiles Peso, Aderência, Energia, metas) → grid: coluna esquerda **`SignalCards`**
  (`signal-cards.tsx`, `lib/evaluation-signals.ts`) → **`WeekComparison`** (fotos + tabela de métricas
  `metricDefs`, inclui peso/aderência/energia, `week-comparison.tsx:245,562`) → link "Ver todas as fotos" →
  **`AnswersSection`** (respostas cruas, inclui de novo `weight_kg`, `adherence_pct`, `energy`) ; coluna direita
  `#orientacao` (decisão: `EvaluationForm` ou orientação enviada) ; abaixo **`HistorySection`** (tabela Peso /
  Aderência / Energia das últimas semanas + orientação anterior + link histórico) → `DecisionBar` (mobile).
  **Peso/aderência/energia aparecem 4×** (WeekSummary, WeekComparison, AnswersSection, HistorySection).
  Dados: `getEvaluationDetail` + `load-comparison.ts` (`?comparar=N`). Só existe a semana da fila — não há rota
  para avaliação de semana passada (`?semana=` inexistente). Actions: `avaliacao/actions.ts`, `photo-actions.ts`.
- **Histórico** `app/coach/alunos/[id]/historico/page.tsx` + `history-timeline.tsx` (cards por semana expansíveis:
  check-in, avaliação, orientação, metas, eventos, contagem de nutrição) — dados `lib/history.ts#getStudentTimeline`
  (l.235, tipos l.40-93). Não abre a avaliação da semana. Subnav Métricas/Fotos/Histórico em
  `evolution-subnav.tsx`.
- **Lista de alunos** `app/coach/alunos/page.tsx` → `student-list.tsx` (busca/filtros) → `client-row.tsx`
  (`ClientRow` l.114, `renderPrimary` l.134, `CopyInviteButton` local l.51 — rótulo curto "Copiar convite" na
  linha e "Copiar link do convite" no menu, `RowMenu` l.264 de `row-menu.tsx`). Rótulos em
  `student-situation.ts:35-44` (`PRIMARY_ACTION_LABEL`: `copy_invite` "Copiar link do convite", `view_tracking`
  "Ver acompanhamento"). Duplicata: `app/coach/alunos/[id]/copy-invite-button.tsx`. **Em edição (tarefa 18).**
- **Sidebar** `app/coach/coach-nav.tsx`: `PRIMARY` (Acompanhamento/Avaliações/Alunos) + `MORE` (Treinos/Nutrição/
  Financeiro) + Configurações; `NAV_ICON_SIZE = 22` para sidebar, abas e sheet "Mais" (check do item ativo 16);
  `Icon` default 20 (`components/ui/icon.tsx:125`). **Em edição (tarefa 19).**
- **Construtores**: treino `app/coach/alunos/[id]/treino/page.tsx` → `plan-workspace.tsx` → `plan-editor.tsx`,
  `exercise-picker.tsx`, `exercise-editor.tsx`, prévia `student-preview.tsx` (Drawer "Como o aluno vê", aberta em
  `plan-workspace.tsx:93`). Nutrição `app/coach/alunos/[id]/nutricao/page.tsx` → `plan-editor.tsx` (alternância
  Editar / "Como o aluno verá", l.89, `StudentPreview` l.116), `meal-card.tsx`, `quick-add-food.tsx`,
  `copy-meal-dialog.tsx`, `macro-chips.tsx`. Áreas globais: `app/coach/treinos/*` (biblioteca + templates,
  `lib/exercise-catalog.ts`) e `app/coach/nutricao/*` (alimentos, equivalências, templates).

---

## 6. Dependências entre tarefas V3

Ondas sugeridas (→ = "precisa antes"):
1. **3 (ângulos)** → 2 (4 fotos obrigatórias) → 7 (UX check-in). 3 → 12 (Progresso com fotos primeiro, 4 ângulos)
   e 3 → 16 (bloco "Comparar" do coach). 3 também toca `photo-triptych.tsx`/`latest-photos.tsx` (`grid-cols-3`).
2. **6 (controles choice/boolean/number/scale + upgrade idempotente)** → 4 (novas perguntas padrão) → 5
   (condicionais). 5 depende da decisão de §3 (sexo). 2 (peso obrigatório) usa o mesmo upgrade + trava em
   `question-actions.ts`/`metrics-settings.ts`/`checkSubmission`. 7 depois de 2–6 (mesmo arquivo
   `checkin-form.tsx` — serializar 2/5/6/7).
3. **Portal**: 9 (nav, em andamento) antes de 8/10/12/23/24 (todos dependem do padding). 10 e 11 tocam
   `portal/nutricao/page.tsx` + `meal-card.tsx` → serializar; 8 (Home) reutiliza próxima refeição → alinhar com 10
   (unificar `pickNextMeal`). 21 (kcal no coach) reutiliza o helper de 11 (`lib/food-macros.ts`). 12 e 13 mexem em
   `progresso/page.tsx` → serializar; 13 inclui o clamp de semanas (§4). 14 e 22 já em andamento.
4. **Coach**: 15 (Acompanhamento × Avaliações) → 16 (redesign da avaliação: Recebido nesta semana / Comparar /
   Histórico / Decisão — remove as 4 repetições) → 17 (histórico de avaliações / avaliação de semana passada,
   precisa de `?semana=` em `getEvaluationDetail`). 18, 19 em andamento; 20 independente (só
   `treino/student-preview.tsx`, pode reaproveitar componentes de `portal/treino`).
5. **23 (empty states) e 24 (responsividade)** por último.

## 7. O que exige migration

| Tarefa | Migration? | Detalhe |
|---|---|---|
| **3 — ângulos front/left/right/back (manter `side`)** | **Sim (0017)** | Trocar o CHECK de `photos.angle` (0001:190) por `('front','left','right','back','side')`. `client_can_write_photo` e o unique não mudam. Código: `buckets.ts` (tipo, lista, regex), `week-comparison-format.ts`, `checkin-form.tsx`, `photo-triptych.tsx`, `week-comparison.tsx`, `week-compare.tsx`, `latest-photos.tsx`. `side` legado deve continuar exibível/assinável (`isOwnedPhotoPath`, `isPhotoAngle`). |
| 2 — peso + 4 fotos obrigatórios | Não | Validação em `submitCheckin` (contar `photos` da semana) + cliente; travar `required` de `weight_kg`. Depende da 3. |
| 4/6 — novas perguntas, tipos boolean/select/number/scale, upgrade idempotente | Não, **se** as opções das perguntas de escolha forem definidas em código (catálogo por `key`). `type` já aceita `boolean`/`select`. Upgrade: insert-if-missing por `key` com a sessão do coach (RLS permite) ou admin. | **Sim, se** o coach puder criar/editar perguntas de escolha com opções próprias (não há coluna `options`). Opcional: unique (template_id, key) para blindar o upgrade contra corrida. |
| 5 — condicionais (ciclo, hormônios/estimulantes/peptídeos + follow-ups, último exame) | Não, com condições em código por `key` (+ `clients.gender`). `checkSubmission`/`buildCheckinSteps` precisam receber o contexto (gênero, respostas-pai) no servidor e no cliente. | Sim só se as condições tiverem de ser configuráveis pelo coach. |
| 3-perfil — sexo | Não | `clients.gender` existe; falta UI (coach). |
| 8–14, 15–24 | Não | Só front/lib. 13: clamp de semanas em `lib/evolution.ts`. 17: leitura de semanas passadas já permitida por RLS. |
