# Trackly — Auditoria da base atual antes do redesign V2

Data: 2026-10-09 · Tarefa 1 do TODO V2 ("AUDITAR A BASE ATUAL ANTES DE ALTERAR").
Escopo: `web/` (Next.js 16.3.5, React 19.2, Tailwind v4, Supabase, recharts) e `supabase/migrations/0001…0016`.
Método: leitura de código (todas as rotas, layouts, componentes compartilhados, `lib/*`, migrations) e capturas
headless do lado do coach em 390px e 1280px com o usuário QA. As páginas do portal **não** foram abertas no
navegador porque o render da Home/Check-in grava no banco (cria a instância de check-in, ver §7), e esta tarefa é
somente leitura.

> Observação sobre a documentação existente: `ARCHITECTURE.md` e `docs/audit-report.md` descrevem quase só o
> **protótipo estático** (`prototype/`, V2–V12, localStorage). O modelo de dados descrito lá (ex.: `WorkoutExercise
> { sets, reps, rest_sec, rir, notes }`) está **desatualizado** em relação às migrations reais — use a §6 deste
> documento como referência de schema. `tasks.md` está vazio.

---

## 1. Mapa de rotas (`web/app`)

Todas as páginas são Server Components; os componentes interativos ficam em arquivos `"use client"` ao lado.
Guards: `app/coach/require-coach.ts` (sessão + linha em `coach_users` + consentimento LGPD) e
`app/portal/require-client.ts` (sessão + linha em `clients` + consentimento). `proxy.ts` (o antigo
`middleware.ts` no Next 16) renova a sessão, redireciona `/coach` e `/portal` sem sessão para `/login` e aplica a
CSP com nonce (`lib/csp.ts`).

### Raiz / público
| Rota | Arquivo | O que faz |
|---|---|---|
| `/` | `app/page.tsx` | Só redireciona (`lib/auth/resolve-home.ts`) para `/coach`, `/portal` ou `/login`. |
| `/login` | `app/(auth)/login/page.tsx`, `login-form.tsx`, `actions.ts` | Login por e-mail/senha. |
| `/cadastro` | `app/(auth)/cadastro/*` | Cadastro de coach (cria `accounts` + `coach_users` via admin client). |
| `/esqueci-senha`, `/redefinir-senha` | `app/(auth)/esqueci-senha/*`, `app/(auth)/redefinir-senha/*` | Recuperação de senha. |
| layout auth | `app/(auth)/layout.tsx` | Card centralizado; marca é só o texto mono "TRACKLY". |
| `/convite?id=<clientId>` | `app/convite/page.tsx`, `accept-invite-form.tsx`, `actions.ts` | Aceite do convite → magic link para o e-mail cadastrado pelo coach; grava consentimento. |
| `/auth/callback` | `app/auth/callback/route.ts` | Troca o código do magic link, ativa o aluno (`invite_status='active'`). |
| `/privacidade`, `/termos` | `app/(legal)/privacidade/page.tsx`, `termos/page.tsx` | Documentos legais (`lib/legal/documents.ts`). |
| `/consentimento` | `app/(legal)/consentimento/*` | Gate de aceite LGPD. |
| `/meus-dados` (+ `/meus-dados/exportar`) | `app/(legal)/meus-dados/*` | Direitos do titular (aluno): exportar, pedir exclusão. **Fica fora da casca do portal** (sem nav inferior). |
| `manifest.webmanifest` | `app/manifest.ts` | PWA restrita a `/portal`; cores `#0a0a09`. Ícones em `public/icons/*.png`, `app/portal/apple-icon.png`, `app/favicon.ico`. |

### Coach (`/coach/*`, casca `app/coach/layout.tsx`)
| Rota | Arquivo principal | O que faz / componentes |
|---|---|---|
| `/coach` (Acompanhamento) | `app/coach/page.tsx` | "Avaliações desta semana": fila de trabalho, "Merece atenção", "Aguardando check-in", 4 contadores. Usa `lib/evaluations.ts#getEvaluationQueue` e `app/coach/avaliacoes/evaluation-ui.tsx` (`RowsList`, `AttentionList`, `Counter`, `EvaluationGroup`, `GroupEmpty`). |
| `/coach/avaliacoes` | `app/coach/avaliacoes/page.tsx` | Mesma fila, agrupada em "Para você fazer agora / Aguardando o aluno / Ciclos concluídos", 5 contadores. |
| `/coach/alunos` | `app/coach/alunos/page.tsx` | Lista operacional: `add-client-form.tsx`, `student-list.tsx` (busca/filtros/ordenação client-side), `client-row.tsx`, `status-badges.tsx`, `student-situation.ts` (monta `StudentEntry`), `icons.tsx`, `actions.ts` (criar aluno, enviar convite). |
| `/coach/alunos/[id]` (Resumo) | `app/coach/alunos/[id]/page.tsx` | Situação (acompanhamento × financeiro), último peso, última orientação, `observed-patterns.tsx` (insights), `metric-settings-panel.tsx` + `add-custom-metric-form.tsx` (métricas por aluno), cadastro. |
| layout do aluno | `app/coach/alunos/[id]/layout.tsx` | `student-header.tsx` (faixa de contexto + próxima ação + `copy-invite-button.tsx`) e `student-tabs.tsx` (8 abas em pílulas). Dados de `student-context.ts`. |
| `/coach/alunos/[id]/avaliacao` | `avaliacao/page.tsx` | Avaliação semanal: `mark-review-opened.tsx` (grava `review_opened_at` ao abrir), `week-comparison.tsx` + `compare-slider.tsx` (comparação entre semanas, `?comparar=N`), sinais (`lib/evaluation-signals.ts`), métricas, fotos (`../photo-triptych.tsx`), respostas, metas (somente leitura), últimas semanas, `evaluation-form.tsx` (nota privada + orientação, rascunho/enviar), `cycle-done-banner.tsx`. Actions: `avaliacao/actions.ts`, `photo-actions.ts`. **Só existe a semana da fila** — não há rota para abrir a avaliação de uma semana passada específica. |
| `/coach/alunos/[id]/treino` | `treino/page.tsx` | Construtor de treino: `exercise-library.tsx`, `exercise-row.tsx`, `create-exercise-form.tsx`, `plan-lifecycle.tsx` (criar rascunho/descartar/publicar), `day-card.tsx` (dia + exercícios, edição inline, ↑↓, duplicar), `add-workout-day-form.tsx`, `workout-exercise-fields.tsx` (todos os campos de prescrição), `templates-panel.tsx`, `duplicate-to-client-form.tsx`, `preview-panel.tsx`, `../plan-history-panel.tsx`. Actions em `treino/actions.ts` (20 actions). |
| `/coach/alunos/[id]/nutricao` | `nutricao/page.tsx` | Construtor de nutrição: `food-library.tsx`, `food-row.tsx`, `create-food-form.tsx`, `food-equivalences-panel.tsx`, `plan-lifecycle.tsx`, `nutrition-goals-form.tsx` (kcal/macros/água), `daily-view.tsx` (por dia da semana), `meal-card.tsx`, `add-meal-form.tsx`, `add-meal-item-form.tsx`, `duplicate-day-form.tsx`, `duplicate-to-client-form.tsx`, `templates-panel.tsx`, `preview-panel.tsx`. Actions em `nutricao/actions.ts`. |
| `/coach/alunos/[id]/evolucao` | `evolucao/page.tsx`, `evolution-view.tsx` | Gráfico de peso (recharts) + cards das métricas acompanhadas, seletor 4/8/12/todas. Dados: `lib/evolution.ts`, `lib/evolution-format.ts`. |
| `/coach/alunos/[id]/fotos` | `fotos/page.tsx` | Fotos por semana/ângulo (URLs assinadas, `lib/storage/checkin-photos.ts`), via `photo-triptych.tsx`. |
| `/coach/alunos/[id]/pagamento` | `pagamento/page.tsx`, `create-subscription-form.tsx`, `subscription-status-control.tsx`, `actions.ts` | Assinatura + cobranças (registro manual, sem gateway). |
| `/coach/alunos/[id]/historico` | `historico/page.tsx`, `history-timeline.tsx` | Timeline por semana (`lib/history.ts`). |
| `/coach/financeiro` | `financeiro/page.tsx` + `finance-content.tsx`, `metric-cards.tsx`, `sections.tsx` (atrasados/próximas/histórico), `payment-row.tsx`, `payment-badge.tsx`, `mark-paid-button.tsx`, `charge-button.tsx`, `month-nav.tsx`, `skeleton.tsx`, `loading.tsx`, `error.tsx`, `href.ts`, `ui.ts` | Visão mensal (`?mes=`, `?status=`), dados de `lib/finance/*`. |
| `/coach/notificacoes` | `notificacoes/page.tsx`, `actions.ts` | Lista in-app, marcar lida/todas. |
| `/coach/configuracoes` | `configuracoes/page.tsx`, `actions.ts` | **Só LGPD**: pedidos dos alunos, aceites do coach, encerrar conta. Não há perfil, senha, marca ou preferências. |
| `/coach/privacidade/exportar/[clientId]` | route handler | Exportação de dados de um aluno. |
| (morto) | `app/coach/section-placeholder.tsx` | Não é importado por nenhum arquivo. |

### Portal do aluno (`/portal/*`, casca `app/portal/layout.tsx`)
| Rota | Arquivo principal | O que faz / componentes |
|---|---|---|
| `/portal` (Início) | `app/portal/page.tsx` | "O que eu faço hoje": saudação + foco, UMA ação principal (check-in > treino > refeição), mensagem do coach (última orientação), "Também hoje", progresso da semana. Usa `lib/portal-today.ts`. |
| `/portal/checkin` | `app/portal/checkin/page.tsx`, `../checkin-form.tsx` (817 linhas, wizard por etapas + upload de fotos), `../checkin-sent.tsx`, `../actions.ts` | Check-in semanal; janela sex–dom (`checkinWindow`). Etapas de `lib/checkin-steps.ts`. |
| `/portal/treino` | `treino/page.tsx`, `session-view.tsx`, `exercise-block.tsx`, `rest-timer.tsx`, `session-summary.tsx`, `start-session-button.tsx`, `actions.ts` | Lista de dias do plano publicado → sessão com séries (carga/reps/RIR), timer de descanso, substituto, pausa, resumo. Lógica pura em `lib/workout-session.ts`. |
| `/portal/nutricao` | `nutricao/page.tsx`, `day-summary.tsx`, `meal-card.tsx`, `meal-log-form.tsx` (status/dificuldade/nota/foto), `water-tracker.tsx`, `actions.ts` | **Só o dia de hoje**: refeições, próxima refeição, resumo de macros, água. Lógica em `lib/nutrition-session.ts`. |
| `/portal/notificacoes` | `notificacoes/page.tsx`, `actions.ts` | Lista in-app. |
| — | — | **Não existem**: Progresso/Evolução, Fotos, Histórico, Conta/Configurações do aluno, Pagamentos do aluno. |

---

## 2. Navegação

### Coach
- `app/coach/layout.tsx`: um único `<aside>` que é **barra superior de 56px no mobile** (marca + sino + ícone de
  Configurações + "Sair") e **sidebar** (`--sidebar-w`) a partir de `md` (768px). Conteúdo em `max-w-4xl` (896px).
- `app/coach/coach-nav.tsx`: `NAV_ITEMS` com **4 itens** — Acompanhamento (`/coach`, exato), Avaliações (com badge
  de pendentes de `pending-evaluations.ts` → `lib/evaluations.ts#countPendingEvaluations`), Alunos, Financeiro.
  Duas variantes do mesmo array: `sidebar` (desktop) e `bottom` (barra fixa inferior `grid-cols-4`, `md:hidden`,
  texto 0.68rem, filete ativo no topo). Ícones SVG inline (`ICON_PROPS`).
- `CoachSettingsLink` (mesmo arquivo): Configurações fora da lista principal (ícone no mobile, texto no desktop).
- `app/notification-bell.tsx`: Server Component com contador de não lidas; variantes `shell` (coach/portal) e
  `pill` (não usada).
- Workspace do aluno: `app/coach/alunos/[id]/student-tabs.tsx` — 8 pílulas com `flex-wrap` (Resumo, Avaliação,
  Treino, Nutrição, Evolução, Fotos, Pagamentos, Histórico); Avaliação sempre destacada; a cada troca de aba
  chama `router.refresh()`.
- **V2 pede 6 itens** (Acompanhamento/Avaliações/Alunos/Treinos/Nutrição/Financeiro): a barra inferior atual é
  `grid-cols-4` com rótulos de 0.68rem — 6 itens não cabem em 375px com esses rótulos; precisa de decisão
  (ícones sem texto, "Mais", ou só 4–5 itens no mobile). `/coach/treinos` e `/coach/nutricao` **não existem**.
- Mobile real (390px, captura): no workspace do aluno, cabeçalho + faixa de contexto + 8 pílulas ocupam a primeira
  dobra inteira — o conteúdo da aba começa abaixo da tela.

### Portal
- `app/portal/layout.tsx`: barra superior fixa (marca "Trackly · ALUNO" + sino + ícone escudo → `/meus-dados` +
  sair), coluna única `max-w-xl`, `pb-28` para a barra inferior. Exporta `viewport` (`themeColor`, `viewportFit: cover`).
- `app/portal/portal-nav.tsx`: **4 abas sempre visíveis** (inclusive no desktop): Início, Treino, Nutrição,
  **Check-in**. V2 pede Início / Treino / Nutrição / **Progresso** + avatar para conta — Progresso e Conta não
  existem; o check-in teria de virar CTA da Home (a Home já o prioriza como ação principal).
- Ícones do portal em `app/portal/portal-ui.tsx#ICONS` (home/workout/nutrition/checkin/logout/privacy/chevron) —
  conjunto paralelo ao do coach (`coach-nav.tsx`) e ao de `app/coach/alunos/icons.tsx`.

---

## 3. Estilo hoje

### Como é definido
- **Tokens em `app/globals.css`** (148 linhas): variáveis em `:root` + bloco `@theme inline` do Tailwind v4 que as
  expõe como utilitários (`bg-paper`, `bg-surface`, `bg-surface-sunken`, `text-ink`, `text-ink-muted`,
  `text-ink-faint`, `border-line`, `border-line-strong`, `bg-brand`, `text-on-accent`, `bg-brand-tint`, `text-gold`,
  `text-coral-text`, `bg-ok-tint`, `text-warn`, `text-late-text`, `c1..c4`, `text-hero`, `text-counter`,
  `text-label`, `rounded-sm/md/lg`). Não há `tailwind.config.*` (configuração 100% via CSS, padrão v4). Sem dark/light
  switch — dark é o único tema.
- **Componentes estilizados só com classes Tailwind inline**, quase sempre por tokens. Hex/rgba fora do CSS:
  só `app/manifest.ts` e `app/portal/layout.tsx` (`#0a0a09`) e um em `compare-slider.tsx`. `style={{}}`: 5 usos
  (posições dinâmicas: slider, barras de progresso). Valores arbitrários `text-[0.68rem]`/`text-[11px]` etc.: 18.
- Gráficos (recharts, só em `evolucao/evolution-view.tsx`) usam `var(--brand)`, `var(--line)`, `var(--ink-faint)`
  — trocam junto com os tokens.
- **Conclusão para o V2**: trocar os VALORES dos tokens em `globals.css` repinta ~90% do app sem tocar em
  componentes. O que exige edição de arquivos é tipografia (classes `font-mono uppercase tracking-*`), a separação
  de cores semânticas e a consolidação das constantes duplicadas abaixo.

### Fontes (`app/layout.tsx`, `next/font/google`)
- `--font-display`: **Fraunces** (serifada) — `font-display` em 77 usos (títulos `text-hero`, contadores, marca).
- `--font-body`: **Inter**.
- `--font-mono`: **IBM Plex Mono** 400/500 — `font-mono` em **99 usos / 51 arquivos**: eyebrows, labels de campo,
  badges, abas do aluno, contadores pequenos. `uppercase` aparece 81 vezes (quase sempre com `tracking-wide/widest`).
- Trocar para Sora/Manrope = mudar os imports em `app/layout.tsx` (mantendo as variáveis). next/font é
  self-hosted, então a CSP (`default-src 'self'`, sem `font-src` externo) continua válida.

### Paleta atual (`globals.css`)
`--paper #0a0a09`, `--surface #17170f`, `--surface-sunken #121210`, `--ink #f3eee4`, `--ink-muted #a79c8a`,
`--ink-faint #8f8575`, `--line #26241e`, `--line-strong #37332b`, **`--brand #c9a463` (champagne, não amarelo
vivo)**, `--brand-deep #dcb979`, `--on-accent #17130a`, `--gold #dd9a46`, `--coral #c1502e`,
`--coral-text #d77356`, `--on-coral #fffdfb`, `--c1..c4` (cores de aluno). Contrastes medidos estão comentados
no arquivo.
- **Problema semântico** (`globals.css:52-53`): `--ok: var(--brand)` e `--ok-tint: var(--brand-tint)`. Ou seja,
  "Pago / Ciclo concluído" (ok) tem exatamente a mesma cor que "Avaliação pendente" (brand) e que os botões
  primários. O V2 (mint para sucesso, laranja para atenção, coral para erro) precisa de tokens `--success`,
  `--warning`, `--danger` independentes do accent. `--warn` = `--gold` (laranja) já está separado.
- Não há tokens de: elevação além de `--surface-raised-shadow`, superfície "raised"/"overlay", foco (`focus-visible`
  é ad hoc), duração de animação, tamanhos de ícone.

### Mesmo papel de UI estilizado de formas diferentes (arquivos concretos)
- **Botões**: 3 conjuntos de constantes divergentes —
  `app/coach/avaliacoes/evaluation-ui.tsx` (`BUTTON_PRIMARY/OUTLINE/GHOST/DISABLED`, `w-full sm:w-auto`),
  `app/coach/financeiro/ui.ts` (`BUTTON_BASE` com `focus-visible`, `px-4`, sem `w-full`),
  `app/portal/portal-ui.tsx` (`BUTTON_PRIMARY` `min-h-12 w-full`, `BUTTON_GHOST`). Além disso há botões primários
  escritos inline (`bg-brand … text-on-accent`) em ~25 arquivos, ex.: `app/coach/page.tsx:150`,
  `app/coach/avaliacoes/page.tsx:196`, `treino/day-card.tsx` (AddExerciseForm), `nutricao/meal-card.tsx`,
  `treino/plan-lifecycle.tsx`, `nutricao/plan-lifecycle.tsx`, `alunos/add-client-form.tsx`,
  `(auth)/login/login-form.tsx`, `portal/treino/session-view.tsx`, `portal/nutricao/water-tracker.tsx`.
  `app/coach/configuracoes/page.tsx` importa botões de `../financeiro/ui` (acoplamento entre áreas).
- **Inputs**: a constante `INPUT` é redefinida em **14 arquivos** (todos os forms de `treino/*` e `nutricao/*`,
  `metric-settings-panel.tsx`), mais `FIELD` em `avaliacao/evaluation-form.tsx` e
  `(legal)/meus-dados/privacy-request-form.tsx` (este com `text-sm` → zoom no iOS ao focar), `FIELD_INPUT` em
  `portal/checkin-form.tsx:290` (`min-h-12`), `INPUT_NUM` em `portal/treino/exercise-block.tsx:12`, `CONTROL` em
  `alunos/student-list.tsx`. `LABEL` repetido em 5 arquivos. `<select>`/checkbox nativos sem estilo (checkbox
  branco sobre fundo escuro na biblioteca de exercícios — visto na captura).
- **Cards**: `rounded-lg border border-line bg-surface` aparece 49 vezes; com sombra em uns (`portal-ui#CARD`,
  `week-comparison.tsx:32`) e sem em outros (`financeiro/ui.ts#CARD`, `PANEL` em `alunos/[id]/page.tsx:45`).
- **Eyebrow/label**: `EYEBROW` em `financeiro/ui.ts:20` e `evolucao/evolution-view.tsx:21`; `FIELD_LABEL` em
  `alunos/client-row.tsx:34`, `alunos/[id]/page.tsx:48`, `alunos/[id]/student-header.tsx:22`; `CONTROL_LABEL` em
  `student-list.tsx`; mais dezenas inline. O eyebrow "Trackly · Coach" é repetido em 7 páginas
  (`alunos`, `avaliacoes`, `configuracoes`, `financeiro/page|loading|error`, `notificacoes`) e diferente em
  `/coach` ("Acompanhamento · Olá, …").
- **Badges**: `BADGE_BASE` duplicado (`evaluation-ui.tsx:14` e `financeiro/payment-badge.tsx:8`, ligeiramente
  diferentes); badges inline "Publicado"/"Rascunho" (`treino/page.tsx`, `nutricao/page.tsx`), "Hoje"
  (`portal/treino/page.tsx`), bloco (`day-card.tsx`, `text-[11px]`).
- **Status de pagamento**: rótulos/cores definidos duas vezes com textos diferentes —
  `alunos/[id]/pagamento/page.tsx:32-46` ("Pago", "Atrasado") × `financeiro/payment-badge.tsx:11-25`
  ("Pagamento em dia", "Pagamento atrasado"). Tipo `PaymentStatus` existe em `lib/repository.ts` e em
  `lib/finance/metrics.ts`.
- **Estado vazio**: `EmptyState` local em `app/coach/page.tsx:135`, `EmptyCard` em `avaliacao/page.tsx`,
  `GroupEmpty` em `evaluation-ui.tsx`, `EmptyState` em `portal-ui.tsx`, blocos inline em
  `avaliacoes/page.tsx:190`, `alunos/page.tsx:75`, `SectionPlaceholder` (morto).
- **Formatadores**: `formatKg` (3×: `alunos/[id]/page.tsx`, `avaliacao/page.tsx`, `portal/page.tsx`),
  `formatDateOnly`/`formatDateOnlyShort` (5×), `formatBRL` (2×: `lib/finance/format.ts` e
  `pagamento/page.tsx:48`).
- **Marca**: "Trackly" em Fraunces + "COACH"/"ALUNO" mono em `coach/layout.tsx:28-35` e `portal/layout.tsx:42-50`;
  só "TRACKLY" mono em `(auth)/layout.tsx`, `(legal)/layout.tsx`, `convite/page.tsx`. Não há componente de logo
  nem SVG de marca; ícones PWA são PNGs antigos.

---

## 4. Componentes reutilizáveis

Não existe pasta `components/`. O que é compartilhado vive dentro de rotas:

| Módulo | Exporta | Usado por |
|---|---|---|
| `app/coach/avaliacoes/evaluation-ui.tsx` | `STATE_META`, `BADGE_BASE`, `StateBadge`, `BUTTON_*`, `Counter`, `RowsList`, `EvaluationListItem`, `EvaluationGroup`, `GroupEmpty`, `AttentionList`, `getAttentionItems`, `ChargeCheckinButton`, `OrientationReadyButton`, `checkinNudgeMessage`, `whatsappDigits`, formatadores de data | `/coach`, `/coach/avaliacoes`, Alunos, workspace do aluno |
| `app/coach/financeiro/ui.ts` | `BUTTON_*`, `CARD`, `EYEBROW` | Financeiro, Configurações |
| `app/portal/portal-ui.tsx` | `ICONS`, `BUTTON_PRIMARY/GHOST`, `CARD`, `PageHeader`, `EmptyState` | 13 arquivos do portal |
| `app/coach/alunos/status-badges.tsx` | `PaymentStatusBadge`, `TrackingStatusBadge` | lista e workspace do aluno |
| `app/coach/alunos/icons.tsx` | `SearchIcon`, `LinkIcon`, `CheckIcon`, `TrackingIcon`, `WalletIcon`, `FilterIcon` | Alunos |
| `app/coach/alunos/[id]/photo-triptych.tsx` | `PhotoTriptych`, `PhotoImage` | avaliação, fotos, compare-slider |
| `app/coach/alunos/[id]/plan-history-panel.tsx` | histórico de alterações de plano | treino e nutrição |
| `app/coach/alunos/[id]/evolucao/evolution-view.tsx` | gráfico + cards de evolução | só coach (candidato a mover p/ compartilhado para o Progresso do aluno) |
| `app/notification-bell.tsx`, `app/legal-links.tsx`, `app/(legal)/legal-ui.tsx` | sino, links legais, cabeçalho/seção legal | layouts |

Duplicados/inconsistentes: ver §3 (botões, inputs, cards, badges, empty states, formatadores). Além disso:
- `CopyInviteButton` existe duas vezes: função local em `app/coach/alunos/client-row.tsx:45` e
  `app/coach/alunos/[id]/copy-invite-button.tsx`.
- Treino e Nutrição têm pares paralelos quase idênticos (`plan-lifecycle.tsx`, `templates-panel.tsx`,
  `duplicate-to-client-form.tsx`, `preview-panel.tsx`) — candidatos a componentes genéricos de "plano".
- Três conjuntos de ícones SVG (`coach-nav.tsx`, `portal-ui.tsx`, `alunos/icons.tsx`) + SVG inline no layout do coach.

A lógica de domínio, por outro lado, está bem isolada e testada em `lib/` (funções puras com testes
`*.test.ts` rodáveis com `npx tsx --test lib/<arquivo>.test.ts`): `workout-builder`, `workout-session`,
`nutrition-builder`, `nutrition-session`, `insights`, `checkin-week`, `finance/metrics`. O redesign deve trocar a
camada visual sem mexer nelas.

---

## 5. Por área

Toda leitura/escrita passa por `lib/repository.ts` (4.883 linhas), `lib/evaluations.ts`, `lib/history.ts`,
`lib/evolution.ts`, `lib/finance/*`, `lib/storage/*`, chamados de Server Components e Server Actions.

### Acompanhamento (`/coach`)
- Implementado: fila "o que fazer agora" derivada de `checkin_instances` + `orientations` (`getEvaluationQueue`,
  cacheado por request), "Merece atenção", aguardando check-in, contadores, estados vazios.
- Problemas: sobrepõe-se quase totalmente a `/coach/avaliacoes` (mesma fonte, mesmos componentes); contadores
  com rótulos diferentes entre as duas telas ("Pendentes" × "Aguardando avaliação / Em andamento / Aguardando
  orientação"). O bloco de check-in atrasado nunca aparece em produção (bug §7.1).

### Avaliações (`/coach/avaliacoes`) e detalhe (`/coach/alunos/[id]/avaliacao`)
- Lista: 5 contadores + 3 grupos. Detalhe: estado do ciclo, comparação entre semanas (fotos + métricas, slider),
  sinais, métricas da semana, fotos, respostas (rótulos de `checkin_questions`), metas (lidas de `goals`, que
  ninguém grava), últimas semanas, coluna sticky com nota privada + orientação (rascunho/enviar). Tabelas:
  `checkin_instances` (`review_opened_at`, `reviewed_at`), `checkin_answers`, `metrics`, `photos`, `goals`,
  `orientations` (`text`, `coach_note`, `focus_override`, `is_draft`, `sent_at`), `history_events`, `notifications`.
  Actions: `markReviewOpenedAction`, `saveEvaluationAction` (`avaliacao/actions.ts`), `getWeekPhotosAction`.
- Problemas: abrir a página **grava** `review_opened_at` (cuidado em QA); não há como abrir a avaliação de uma
  semana passada específica; metas semanais não têm UI de criação (decisão "parked" já registrada); página longa no
  mobile (atalho "Ir para a nota e a orientação" compensa).

### Alunos (`/coach/alunos`)
- Implementado: cadastro + convite (link `/convite?id=<uuid>` copiável, magic link), busca, filtros por
  acompanhamento e financeiro, ordenação por urgência, agrupamento "Precisam da sua ação / Sem ação agora",
  WhatsApp de cobrança (check-in e pagamento). Tabelas: `clients`, fila de avaliações, `subscriptions`/`payments`.
- Problemas: card de aluno alto no mobile (e-mail, idade, altura, objetivo, dois blocos de status, ação); lê a
  visão financeira do mês inteiro quando há atraso.

### Workspace do aluno (abas)
- `layout.tsx` + `student-context.ts`: cada aba recarrega `getClient` + **toda a fila de avaliações da conta** +
  status de pagamento (+ visão financeira do mês se atrasado), e `student-tabs.tsx:110-115` ainda faz
  `router.refresh()` a cada troca de aba → trabalho dobrado por navegação.
- Resumo: ver §1. Evolução/Fotos/Pagamentos/Histórico: ver §1; estão completos e funcionais.

### Treino — coach (`/coach/alunos/[id]/treino`)
- Implementado (UI cobre **todas** as colunas existentes): biblioteca por conta com busca/filtros
  (categoria/grupo muscular/equipamento/arquivados), exercício personalizado com instrução e URL de vídeo,
  arquivar/desarquivar; plano com ciclo rascunho → publicado → versões arquivadas; dias (nome, duração, notas,
  ↑↓, duplicar, excluir); exercício-no-dia com bloco (aquecimento/normal/cardio), superset/circuito (tipo + letra),
  séries, reps fixas ou faixa, carga sugerida, descanso, RIR, cadência (`tempo`), duração de cardio, 1 substituto,
  observações, ↑↓, duplicar; templates (salvar como, aplicar, excluir); duplicar para outro aluno; prévia "como o
  aluno vê"; histórico de alterações (`plan_change_logs`). RPCs atômicas da 0007.
- Problemas: a **biblioteca vem antes do plano** e domina a tela; formulário de prescrição é uma grade plana de 11
  campos (sem progressive disclosure); reordenação por botões ↑↓ (um POST por clique); supersets são só uma letra
  digitada (sem agrupamento visual no builder); `getExercises` é chamado duas vezes por render
  (`treino/page.tsx:60-66`) + `getClients()` só para o seletor de duplicação; **conta nova começa com zero
  exercícios** (a RPC `import_exercise_catalog` da 0007 existe mas nenhum código a chama e não há catálogo base no
  repo); vídeo só como link (CSP sem `frame-src` bloquearia embeds).

### Treino — aluno (`/portal/treino`)
- Implementado: lista de dias com destaque "Hoje", início de sessão (`workout_sessions`), execução por série
  (`workout_logs` com `session_id`, `workout_exercise_id`, `set_number`, `load`, `reps`, `perceived_rir`,
  `student_note`), desempenho anterior, timer de descanso, blocos/superset/circuito (`groupDayExercises`),
  substituto autorizado, pausa/retomada, resumo final com esforço percebido e nota.
- Problemas: "Hoje" não é o dia da semana, é o "próximo dia não feito" calculado com bug (§7.2); o aluno não vê
  os exercícios de um dia antes de iniciar a sessão; não há histórico de treinos para o aluno.

### Nutrição — coach (`/coach/alunos/[id]/nutricao`)
- Implementado: biblioteca de alimentos (nome, unidade, categoria, macros kcal/P/C/G), equivalências por conta,
  plano com metas (kcal, P, C, G, água), refeições por dia da semana (ou "todo dia") com horário e notas, itens com
  quantidade estruturada + unidade + notas, substituições por item (com quantidade/macros/nota), duplicar
  refeição/dia/plano, reordenar, templates, duplicar para aluno, prévia, histórico. RPCs da 0008.
- Problemas: **macros não escalam com a quantidade** — o item copia um snapshot dos macros do alimento e o coach
  ajusta à mão (`lib/repository.ts:3856-3862`); sem catálogo base de alimentos; mesma estrutura visual "formulários
  empilhados" do treino.

### Nutrição — aluno (`/portal/nutricao`)
- Implementado: refeições de hoje (`mealsForDay`), próxima refeição, detalhes (itens, quantidades, macros,
  substituições, equivalências), registro por refeição (`meal_logs`: feito/parcial/pulado, dificuldade 1–5, nota,
  foto), água (`water_logs`), resumo do dia vs. metas.
- Problemas: não dá para consultar outros dias da semana; comentário de `pickNextMeal` está desatualizado.

### Evolução / Fotos
- Coach: completo (ver §1). Aluno: **inexistente**. Reaproveitável sem migration: `lib/evolution.ts#getStudentEvolution`
  funciona com a sessão do aluno (RLS `clients_self_read`, `metrics_client_read`, `client_metric_settings_client_read`);
  `lib/storage/checkin-photos.ts#listClientPhotos` já aceita o próprio aluno como visualizador;
  `evolution-view.tsx` e `photo-triptych.tsx` precisam sair de `app/coach/...` para um local compartilhado.

### Check-in (`/portal/checkin`)
- Implementado: janela sex–dom (qui = lembrete, seg–qua fechado), wizard por etapas (fotos primeiro, compressão no
  navegador, reenvio), perguntas do template + métricas custom, rascunho, envio (`submitCheckin` grava métricas
  antes de marcar `submitted`, exigido pela 0015), tela de enviado/avaliado.
- Problemas: "Treinos realizados" (`workouts_count`) é digitado à mão (`lib/checkin-steps.ts:66`) em vez de vir
  das `workout_sessions` concluídas; check-in não enviado vira "perdido" sem status de atraso (§7.1).

### Financeiro (`/coach/financeiro`)
- Implementado: mês navegável, métricas (recebido, previsto, a receber, atrasado…), atrasados com ação (WhatsApp /
  marcar pago), próximas cobranças, histórico filtrável, skeleton/loading/error. Tabelas `subscriptions`
  (`cancelled_at` da 0016), `payments`, `payment_events`. Lógica em `lib/finance/*` (com testes).
- Problemas: vocabulário de status diferente da aba Pagamentos do aluno (§3).

### Configurações (`/coach/configuracoes`)
- Só LGPD (pedidos dos alunos, aceites, encerrar conta). Faltam perfil do coach, nome da conta/marca, senha,
  preferências de notificação. **RLS hoje só permite SELECT** em `coach_users` e `accounts` (0001:120-125) — editar
  perfil exige policy nova ou Server Action com admin client.

### Notificações (coach e aluno)
- Tabela `notifications` (`event_type` em 7 valores, `recipient`, `message`, canais, `read`). Criadas em: check-in
  recebido (`repository.ts:692`), orientação pronta (`evaluations.ts:804`), treino/nutrição publicados
  (`repository.ts:1654`, `:4054`), pagamento atrasado (`repository.ts:4384`), ativação (`auth/callback/route.ts:89`).
- Problemas: itens não levam ao contexto (não há coluna de link/entidade; a página do coach só tem link para
  `/coach`, `notificacoes/page.tsx:52`); `variant="pill"` do sino não é usado.

### Home do portal (`/portal`)
- Implementado como descrito em §1, com regras claras de prioridade e estados "preparando"/"tudo em dia".
- Problemas: o render (GET) chama `getCurrentCheckin`, que **cria** a instância de check-in da semana se não
  existir (`lib/repository.ts:380-389`) — efeito colateral em leitura; progresso da semana herda o bug §7.2;
  ícone de privacidade leva para `/meus-dados`, fora da casca do portal (sem nav inferior, sem voltar).

---

## 6. Modelo de dados de treino e nutrição (o que dá para gravar sem migration)

Fonte: `supabase/migrations/0001_init.sql`, `0003_training_nutrition_extensions_and_student_rls.sql`,
`0007_training_builder.sql`, `0008_nutrition_builder.sql`, `0004_student_write_lockdown.sql` (RLS do aluno).

### Treino
**`exercises`** (biblioteca **por conta**, não global): `id`, `account_id` NOT NULL, `name`, `category` NOT NULL,
`instruction`, `video_url` (CHECK http(s), 0007), `muscle_group`, `equipment`, `is_custom` (default true),
`is_archived`. Nome único por conta entre não arquivados (0007). RPC `import_exercise_catalog(p_items jsonb)` semeia
itens com `is_custom=false` — **existe, nunca chamada pelo app**. Sem imagem/thumbnail, sem músculos secundários,
sem catálogo global entre contas.

**`workout_plans`**: `id`, `client_id` (NULL em template), `account_id`, `name`, `description`, `is_draft`,
`is_template`, `source_template_id`, `created_at`, `published_at`, `archived_at`. No máx. 1 publicado ativo e 1
rascunho por aluno (índices parciais). Templates = `is_template` + `client_id NULL` (já são "globais da conta").

**`workout_days`**: `id`, `plan_id`, `name`, `duration_min`, `sort_order`, `notes` (≤1000). **Sem dia da semana**
(diferente de `meals.day_of_week`).

**`workout_exercises`** (prescrição): `id`, `day_id`, `exercise_id`, `sets` int, `reps` int, `reps_min`, `reps_max`
(CHECK max ≥ min), `suggested_load` numeric (uma carga só, sem unidade — a UI assume kg), `rest_sec`, `rir` int
(valor único, sem faixa), `tempo` text ≤20 (cadência), `block_type` ∈ {`warmup`,`normal`,`cardio`},
`group_kind` ∈ {`superset`,`circuit`} + `group_key` text ≤20 (pares obrigatórios), `substitute_exercise_id`
(**um** substituto), `duration_sec` (cardio), `notes`, `sort_order`.
- **Não há coluna JSON** em `workout_exercises`. Prescrição é por exercício, **não por série**: não dá para
  guardar reps/carga diferentes por série, tipos de série (aquecimento, top set, drop set, back-off), RPE, faixa de
  RIR, número de séries de aquecimento, rodadas de circuito, descanso entre rodadas, distância/intensidade/zona do
  cardio, múltiplos substitutos. O único "escape" é `notes` (texto livre).
- RPCs (0007): `duplicate_workout_plan`, `duplicate_workout_day`, `publish_workout_plan`, `reorder_workout_days`,
  `reorder_workout_exercises`. **Elas copiam colunas por lista explícita** — qualquer coluna nova em
  `workout_exercises`/`workout_days` exige `create or replace` dessas funções, senão duplicar/aplicar template perde
  o dado silenciosamente.

**Execução**: `workout_sessions` (`client_id`, `plan_id`, `day_id`, `week_number`, `status` ∈
in_progress/paused/completed, `started_at`, `paused_at`, `paused_total_sec`, `ended_at`, **`summary jsonb`**,
`student_note`, `perceived_effort` 1–10). `workout_logs` (`client_id`, `exercise_id` = o executado (original ou
substituto), `workout_exercise_id` = a prescrição original, `session_id`, `set_number`, `week_number`, `load`,
`reps`, `perceived_rir` 0–10, `student_note`, `completed_at`; único por sessão+prescrição+série). O aluno lê,
insere e atualiza os próprios logs/sessões; nunca escreve plano.

**Auditoria**: `plan_change_logs` (`plan_kind` workout/nutrition, `action`, `summary`, `changes jsonb`).

### Nutrição
**`foods`** (por conta): `id`, `account_id`, `name`, `unit` (default 'g'), `category`, `is_archived`,
**`macros jsonb`** (o app usa `kcal`, `protein_g`, `carbs_g`, `fat_g` = total para o `unit`, **sem porção-base**).
Como é jsonb, chaves extras (ex.: `base_qty`, `fiber_g`, `sodium_mg`) cabem **sem migration** — mas o app teria de
adotar a convenção. Sem catálogo base (TACO etc.) e sem RPC de importação (o coach pode inserir via RLS).

**`nutrition_plans`**: `client_id` (NULL em template), `account_id`, `name`, `description`, `is_draft`,
`is_template`, `source_template_id`, `updated_at`, `published_at`, `archived_at`, `target_kcal`,
`target_protein_g`, `target_carbs_g`, `target_fat_g`, `target_water_ml`.

**`meals`**: `plan_id`, `name`, `time`, `day_of_week` (1–7, NULL = todos os dias), `notes`, `sort_order`.
O "dia" de nutrição é só esse campo (não há tabela de dia).

**`meal_items`**: `meal_id`, `food_id`, `qty` (texto livre legado), `quantity` numeric, `unit`, `notes`,
`sort_order`, **`macros jsonb`** (snapshot copiado do alimento, editável).

**`meal_substitutions`**: `meal_item_id`, `alternative_food_id`, `alternative_label`, `alternative_qty`,
`macros jsonb`, `note`. Substituição é **por item**; não existe "opção de refeição inteira" alternativa.

**`food_equivalences`**: `food_id`, `equivalent_food_id`, `factor`, `note` (por conta).

**Aluno**: `meal_logs` (`meal_id`, `meal_name` snapshot, `log_date`, `status` done/partial/skipped,
`difficulty` 1–5, `note`, `storage_path`), `water_logs` (total diário). RPCs 0008: `duplicate_nutrition_plan`,
`duplicate_nutrition_meal`, `duplicate_nutrition_day`, `publish_nutrition_plan`, `reorder_nutrition_meals`,
`reorder_meal_items` (mesma regra de lista explícita de colunas).

### Outros fatos relevantes para o escopo V2
- `clients`: sem avatar/foto, sem preferências; aluno só tem **SELECT** na própria linha (`clients_self_read`).
- `coach_users`/`accounts`: só SELECT (sem logo/cores/nome editáveis).
- `goals` existe (meta por semana com resultado) mas **nada no app grava**; coach tem acesso total via RLS.
- `notifications` sem coluna de link/entidade.
- `checkin_instances.status` aceita `late`, mas o app nunca grava esse valor (§7.1).

---

## 7. Bugs e inconsistências funcionais encontrados

1. **Check-in atrasado nunca é detectado em produção.** `lib/evaluations.ts:198` só marca `late` se
   `instance.status === "late"`, e nenhum código do app grava `late` (só `scripts/seed-demo.mjs:745`). Além disso a
   fila sempre olha a semana corrente (`evaluations.ts:141-161`), então o check-in não enviado da semana anterior
   simplesmente some na virada da semana. Consequências: "Merece atenção → atrasado" (`getAttentionItems`), a cor
   de atraso e a mensagem de cobrança de atraso nunca aparecem. Código morto relacionado:
   `lib/repository.ts:770-772` (o `periodEnd < hoje` da semana corrente nunca é verdadeiro) dentro de
   `getClientsWithCheckinStatus` (`repository.ts:727`), que não é chamado por ninguém.
2. **"Próximo treino"/"Hoje" calculado errado.** `lib/portal-today.ts:134-146`
   (`pickNextWorkoutDay`) considera um dia "feito" se todos os `exercise_id` dele aparecem em `workout_logs` da
   semana. Falha quando (a) dois dias compartilham exercícios (fazer A "conclui" B), (b) o aluno usa o substituto
   (o log grava o `exercise_id` do substituto — `repository.ts:2380-2386`, `:2650`), (c) a sessão é concluída
   pulando um exercício. Deveria usar `workout_sessions` concluídas por `day_id`. Afeta `app/portal/page.tsx:92`,
   `:274` e `app/portal/treino/page.tsx:79`; o selo "Hoje" (`portal/treino/page.tsx`) na verdade significa
   "próximo".
3. **Cor de sucesso = cor de destaque** (`app/globals.css:52-53`): "Pago", "Ciclo concluído", "Publicado" e os CTAs
   primários são indistinguíveis.
4. **Render de leitura com escrita**: `/portal` e `/portal/checkin` criam a instância de check-in no GET
   (`lib/repository.ts:380-389`); `/coach/alunos/[id]/avaliacao` grava `review_opened_at` ao abrir
   (`avaliacao/mark-review-opened.tsx`). Intencional, mas torna QA/prefetch sensíveis.
5. **`workouts_count` do check-in é manual** (`lib/checkin-steps.ts:66`), desconectado das sessões registradas.
6. **Macros não acompanham a quantidade** do item de refeição (`lib/repository.ts:3856-3862`).
7. **Rótulos de status de pagamento divergentes** (`alunos/[id]/pagamento/page.tsx:32-46` ×
   `financeiro/payment-badge.tsx:11-25`) e contadores divergentes entre `/coach` (`page.tsx:114-126`) e
   `/coach/avaliacoes` (`page.tsx:203-226`).
8. **Custo por troca de aba no workspace do aluno**: `student-context.ts:183-201` (fila inteira da conta +
   financeiro) + `student-tabs.tsx:110-115` (`router.refresh()` a cada troca).
9. **Biblioteca de exercícios vazia em conta nova** (RPC `import_exercise_catalog`, `0007:383`, sem uso).
10. **`/meus-dados` sai da casca do portal** (link em `app/portal/layout.tsx`, ícone privacy) — sem nav de volta.
11. **Notificações sem deep link** (`app/coach/notificacoes/page.tsx:52` só aponta para `/coach`).
12. Comentários desatualizados que confundem implementadores: `coach-nav.tsx:107` ("hoje sempre 0" — a contagem é
    real), `lib/portal-today.ts:163-166` ("realizado é POR SEMANA" — hoje é por dia em `meal_logs`),
    `financeiro/ui.ts:12-14` (cita `sm:min-h-10` que não existe).
13. Código morto: `app/coach/section-placeholder.tsx`, `getClientsWithCheckinStatus`, `NotificationBell`
    variante `pill`, `CopyInviteButton` duplicado em `client-row.tsx:45`.
14. Inputs `text-sm` no formulário LGPD (`(legal)/meus-dados/privacy-request-form.tsx:8-9`) → zoom no iOS;
    `<select>`/checkbox nativos sem estilo nos builders.
15. CSP (`lib/csp.ts:20-30`) não tem `frame-src`: embutir vídeo (YouTube/Vimeo) na execução de treino exigirá
    liberar domínios explicitamente.

Responsividade: nas capturas a 390px não houve overflow horizontal em `/coach`, Alunos, Resumo, Treino, Nutrição e
Financeiro (`scrollWidth = 390`); o problema é densidade/altura (workspace do aluno ~3.500px no Resumo, formulários
de prescrição longos), não quebra de layout. Portal não capturado (ver introdução).

---

## 8. Ordem de implementação recomendada

Princípio: primeiro a camada que repinta tudo sem mexer em lógica, depois componentes, depois navegação, depois
telas novas, e só então o que exige migration. Cada fase termina com `npm run lint`, `npm run build`,
`npx tsx --test lib/*.test.ts` e uma passada visual em 375/390/430 (aluno) e 768/1280 (coach).

**Fase 0 — Linha de base.** Capturas antes/depois das telas principais; rodar os testes de `lib/`. Corrigir os
bugs de lógica que o redesign vai expor: §7.1 (derivar "atrasado" no app a partir de `period_end` < hoje
SP para a semana anterior sem envio — sem migration) e §7.2 (`pickNextWorkoutDay` por `workout_sessions`
concluídas). Ambos têm funções puras testáveis.

**Fase 1 — Tokens e tipografia (sem tocar em componentes).** `app/globals.css`: novos valores de paleta (preto
profundo, grafite, branco quente, amarelo vivo), **separar** `--ok/--success` (mint), `--warn` (laranja),
`--late/--danger` (coral) do `--brand`; adicionar tokens de superfície elevada, foco e raio. `app/layout.tsx`:
Sora ou Manrope em `--font-display`, sans legível em `--font-body`; decidir o destino de `--font-mono` (manter só
para números/tabelas). Revalidar contrastes (o arquivo já documenta as medições). `app/manifest.ts`,
`portal/layout.tsx` (`themeColor`).

**Fase 2 — Design system centralizado.** Criar `web/components/ui/` (Button, Card, Badge/StatusBadge, Input,
Select, Checkbox, Textarea, Field/Label, PageHeader/Eyebrow, EmptyState, Tabs/SegmentedControl, StatCounter,
Icon set) e `web/components/brand/` (logo SVG/wordmark único usado em coach, portal, auth, legal, convite e
ícones PWA). Migrar de forma mecânica as constantes duplicadas (§3/§4), um diretório por PR, removendo
`evaluation-ui` BUTTON_*, `financeiro/ui.ts`, `portal-ui` BUTTON_*/CARD e os 14 `INPUT`. Reduzir
`font-mono uppercase tracking-*` nos eyebrows. Unificar vocabulário de status de pagamento e formatadores em `lib/`.

**Fase 3 — Navegação.** Coach: 6 destinos (decidir o comportamento mobile — 6 itens não cabem no `grid-cols-4`
atual), Configurações secundária. Portal: Início/Treino/Nutrição/Progresso + avatar (iniciais) → Conta; check-in
como CTA da Home. Revisar o cabeçalho + abas do workspace do aluno no mobile (rolagem horizontal ou seletor), e
remover o `router.refresh()` por aba se o contexto passar a ser buscado de forma mais barata.

**Fase 4 — Áreas globais Treinos e Nutrição do coach (sem migration).** `/coach/treinos` e `/coach/nutricao`
reaproveitando `exercise-library`, `food-library`, `food-equivalences-panel` e `templates-panel` (bibliotecas e
templates já são por conta). Semear catálogo base de exercícios via `import_exercise_catalog` (precisa de uma lista
no código) e de alimentos via insert normal. Tirar a biblioteca do topo da aba Treino/Nutrição do aluno.

**Fase 5 — Builder de treino mais profundo + execução do aluno.** Primeiro só UI sobre colunas existentes
(cartões de exercício recolhíveis, agrupamento visual de superset/circuito, edição inline, duplicar/reordenar,
templates). Depois, se aprovado, a migration de prescrição por série (abaixo), atualizando as RPCs de duplicação.
No portal: ver exercícios do dia antes de iniciar, histórico de sessões.

**Fase 6 — Nutrição.** Builder com cálculo automático de macros (convenção `base_qty` no `foods.macros` jsonb, sem
migration) e consulta do aluno a outros dias da semana (só leitura, sem migration).

**Fase 7 — Progresso e Conta do aluno.** `/portal/progresso` com `getStudentEvolution` + `EvolutionView` movido para
`components/`, fotos via `listClientPhotos` (aceita o próprio aluno), sessões de treino e aderência de refeições.
`/portal/conta` dentro da casca (dados, `/meus-dados`, notificações, sair). Edição de perfil depende de migration.

**Fase 8 — Passada final** de responsividade 375/390/430 e acessibilidade (contraste com a paleta nova, foco
visível, alvos ≥44px).

### O que exige migration nova
| Item do TODO V2 | Migration? | Motivo |
|---|---|---|
| Identidade visual, fontes, marca, design system, navegação | Não | Só front. |
| Áreas globais Treinos/Nutrição, templates, bibliotecas | Não | Já são por `account_id`. |
| Séries, reps (fixo/faixa), carga, RIR, descanso, cadência, aquecimento (bloco), cardio (duração), superset/circuito, notas, 1 substituto, reordenar/duplicar, templates | Não | Colunas e RPCs existem (0003/0007). |
| Prescrição **por série** (reps/carga diferentes por série, tipos de série, nº de séries de aquecimento, RPE, faixa de RIR) | **Sim** | `workout_exercises` não tem JSON nem tabela de séries; criar coluna `jsonb` ou tabela `workout_exercise_sets` + atualizar `duplicate_workout_plan/day`. |
| Rodadas e descanso entre rodadas de circuito; cardio com distância/intensidade/zona | **Sim** | Sem colunas. |
| Múltiplas substituições por exercício | **Sim** | Só `substitute_exercise_id`. |
| Dia da semana fixo para o treino | **Sim** | `workout_days` não tem `day_of_week`. |
| Catálogo global (compartilhado entre contas) de exercícios/alimentos, imagens | **Sim** (se global) | Hoje é por conta; semear por conta não precisa. |
| Macros escalando com quantidade, fibras/sódio | Não (convenção no jsonb) | `foods.macros`/`meal_items.macros` são jsonb. |
| Opções de refeição inteira alternativas | **Sim** | Só substituição por item. |
| Execução de treino, consulta de nutrição de outros dias, Progresso do aluno | Não | Tabelas e RLS de leitura existem. |
| Perfil do aluno editável, avatar, preferências de notificação | **Sim** | `clients` só tem SELECT para o aluno; sem coluna de avatar; sem tabela de preferências. |
| Perfil/conta do coach editável (nome, marca) | **Sim** (policy) ou admin client no servidor | `coach_users`/`accounts` só SELECT. |
| Notificação com link para o contexto | Opcional (coluna) | Pode ser derivado de `event_type` + `client_id` sem migration. |
| Status "atrasado" do check-in | Não | Derivar no app (ou job/cron se quiser persistir). |
| Metas semanais pelo coach | Não | `goals` existe e o coach já tem escrita via RLS (feature "parked"). |
