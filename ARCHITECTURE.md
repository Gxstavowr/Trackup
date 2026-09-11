# Trackly — Arquitetura e modelo de dados

Nome provisório. Foco inicial: coaches de nutrição, personal trainers e profissionais de
acompanhamento físico. Arquitetura pensada para expandir a outros profissionais que
acompanham clientes ao longo do tempo (o "objeto" central nunca é "dieta" ou "treino" —
é **check-in periódico + meta + resultado**, genérico o suficiente para qualquer acompanhamento).

## Estado atual deste repositório

Esta máquina não tem Node.js instalado, então o MVP navegável vive em `/prototype` como
HTML/CSS/JS estático (sem build step) — mesma IA, mesmas telas, mesmos dados que o produto
real vai ter. Quando Node estiver disponível, o plano abaixo (stack de produção) deve virar
o app Next.js real, reaproveitando o design system (`prototype/assets/css/tokens.css`) e o
modelo de dados (schema abaixo) quase 1:1.

## Stack de produção (alvo)

- **Frontend/Backend**: Next.js (App Router) + TypeScript — SSR para o dashboard do coach,
  client components para os fluxos interativos (check-in, gráficos).
- **Banco**: PostgreSQL.
- **Auth**: Supabase Auth (email/senha + magic link). Duas roles: `coach`, `client`.
- **Isolamento multi-tenant**: toda tabela de negócio carrega `account_id`. Row Level Security
  no Postgres garante que uma query nunca vaza dados entre contas — isso é tratado como
  requisito de arquitetura desde o dia 1 (seção 18 do brief: dados são de saúde/condicionamento
  físico), não como algo pra adicionar depois.
- **Storage**: Supabase Storage (fotos de evolução, um bucket privado por conta, path
  `account_id/client_id/...`).
- **Gráficos**: Recharts.
- **UI**: Tailwind CSS + componentes próprios (sem lib de componentes genérica — a identidade
  visual é o diferencial, ver design tokens).
- **Camada de dados**: `lib/repository.ts` — todo acesso a dado passa por funções
  (`getClients(accountId)`, `getCheckIns(clientId)`, ...). Hoje a implementação pode ser mock,
  depois Postgres via Prisma/Drizzle — as telas não mudam.

## Modelo de dados

Multi-tenant: tudo pendura em `Account`. Um `Client` pertence a exatamente um `Account`
(nunca compartilhado). `CheckInInstance` é o evento semanal; `Answer` são as respostas;
`Goal` é o que o coach define para a *próxima* semana; `Metric` é o valor numérico
derivado/explícito daquela semana (peso, medidas, % aderência etc.) — separado do check-in
bruto porque metric é o que alimenta gráfico e comparação, e precisa ser um formato estável
mesmo se as perguntas do check-in mudarem no futuro.

```
Account (conta do profissional)
├─ id, name, niche, plan, created_at
│
├─ CoachUser
│   └─ id, account_id, name, email, role
│
├─ Client
│   └─ id, account_id, coach_id, name, email, objective, start_date,
│      status (active|paused), color_key (identidade visual em gráficos)
│
├─ CheckInTemplate
│   └─ id, account_id, name, questions: Question[]
│       Question { id, label, type: number|scale|boolean|select|text|photo, unit, order }
│
├─ CheckInInstance  (uma ocorrência semanal para um cliente)
│   └─ id, client_id, template_id, week_number, period_start, period_end,
│      status (pending|submitted|late|reviewed), submitted_at
│   └─ Answer[] { question_id, value }
│   └─ Photo[]  { angle: front|back|side_l|side_r, url, created_at }
│
├─ Metric  (snapshot semanal — uma linha por métrica por semana, alimenta os gráficos)
│   └─ id, client_id, week_number, key (weight_kg|waist_cm|hip_cm|body_fat_pct|
│      adherence_pct|workouts_count|cardio_count|water_l|sleep_h|energy|hunger), value
│
├─ Goal  (meta definida pelo coach para a semana seguinte)
│   └─ id, client_id, week_number, metric_key, label, target_value, unit,
│      result_value (preenchido depois), result_status (success|partial|fail|pending)
│
├─ Orientation  (nota/orientação do coach, texto livre, linkada à semana)
│   └─ id, client_id, week_number, author, text, created_at
│
└─ HistoryEvent  (timeline consolidada — gerado a partir dos eventos acima)
    └─ id, client_id, date, type (join|checkin|goal_set|goal_result|note|milestone),
       title, description
```

Regras de status do cliente no dashboard (para ser *acionável*, não decorativo):

- 🔴 **Atrasado** — check-in não enviado até a data prevista.
- 🟡 **Atenção** — aderência caiu ≥15pp vs. média das últimas 3 semanas, OU 2+ metas não
  batidas no último check-in, OU peso estagnado há 3+ semanas com objetivo de emagrecimento.
- 🟢 **Em dia** — nenhuma das condições acima.

Fora do MVP por design (revisitar só com dado e consentimento suficientes): insights
automáticos por padrão (seção 11) e benchmarking entre clientes (seção 23). O modelo acima
já comporta os dois — `Metric` por semana por cliente é exatamente o input que um motor de
tendência ou um benchmark agregado vai precisar — mas nenhum dos dois é construído agora.

## V2 — fluxo corrigido, clareza, dark mode

Revisão sobre o MVP inicial, com três mudanças estruturais:

1. **Fluxo real**: o ciclo é aluno → check-in → coach analisa → coach orienta → aluno executa →
   novo check-in (não "coach define metas primeiro"). Isso introduziu um novo estado no modelo —
   `needsReview` (check-in enviado mas sem orientação ainda) — e uma tela nova,
   `coach/revisar.html`, que é hoje o principal ponto de ação do coach.
2. **Progressive disclosure**: dashboards (coach e cliente) mostram uma pergunta central cada
   ("quem precisa de mim agora" / "o que eu faço esta semana") e escondem o resto atrás de
   toggles (`ver respostas`, `ver mais métricas`) ou de telas separadas (`Clientes`, `Evolução`).
   O histórico deixou de ser uma timeline de eventos soltos e passou a agrupar cada semana como
   uma unidade (check-in → orientação → metas → resultado), colapsada por padrão exceto a mais
   recente.
3. **Dark mode como padrão único** — não é mais um tema opcional. Paleta em `tokens.css`.

Modelo de dados (`assets/js/data.js`) ganhou: `client.gender` (oculta a pergunta de período
menstrual pra clientes homens), `week.qa` (respostas qualitativas do check-in — dieta, refeição
livre, beliscos, cardio, performance, digestão, emocional, substâncias, exame), preenchimento
automático de orientação para semanas passadas (deixando a semana mais recente vazia quando o
cliente é usado pra demonstrar "aguardando revisão"), e `buildPeriodSummary()` — o gerador da
seção "Resumo do período", com linguagem propositalmente cautelosa (associação, não causalidade).

## V3 — hierarquia do lado do coach, wizard de check-in, coerência de dados

Foco: UX e hierarquia, não recursos novos. Principais mudanças:

1. **Dashboard do coach reformulado** — trocou "quem precisa de você" (lista de pendências) por
   "Acompanhamento desta semana": uma tira de 4 números (recebidos/em revisão/orientações
   enviadas/atrasados), "Atualizações dos alunos" (o que mudou por aluno, não só nome+status) e
   um "Resumo da semana" textual agregado. Ver `Trackly.buildWeeklySnapshot()` e
   `Trackly.studentUpdate()` em `data.js`.
2. **Insights determinísticos** (`Trackly.checkInInsights()`) — comparam a semana atual com a
   anterior e com a média das últimas 3 (sono, aderência, água, estabilidade de peso, consistência
   de metas) e viram a seção "O que mudou" na revisão do check-in. Linguagem sempre associativa,
   nunca causal.
3. **Coerência foco ↔ orientação ↔ mensagem**: `Trackly.focusLabelFromOrientation()` deriva o
   título curto de foco a partir do texto real da orientação em vigor (por palavra-chave), não de
   um cálculo independente — evita a home do aluno (ou o cabeçalho do perfil, no coach) dizer
   "foco: sono" enquanto a mensagem do coach fala de outra coisa. `autoFillOrientations()` também
   passou a checar os insights antes de sortear um texto genérico por "tier", pra semanas
   auto-geradas responderem ao sinal mais relevante daquela semana (ver `ORIENTATION_SPECIFIC`).
4. **Check-in em 4 etapas** (`portal/checkin.html`) — Alimentação/Treino/Bem-estar/Peso e fotos,
   com indicador "N de 4", usando `Trackly.CHECKIN_STEPS`. As perguntas em si vêm de
   `Trackly.CHECKIN_TEMPLATE` (metadado de tipo/etapa/obrigatoriedade/ativo por pergunta) — hoje
   fixo e igual pra todo coach, mas já é o ponto de extensão pra um template configurável futuro.
5. **Perfil do cliente (coach) mais enxuto** — Resumo caiu pra 3 estatísticas + uma prévia de
   evolução (8 semanas, não o histórico completo); Histórico ganhou um checklist visual por
   semana (check-in enviado → coach revisou → orientação/metas definidas); Fotos ganhou
   comparação lado a lado entre duas semanas escolhidas.

## V4 — persistência, metas individuais, ciclo operacional

O protótipo deixou de ser só navegável e passou a ser **usável**: ações do coach agora
persistem (localStorage) e sobrevivem à navegação e ao reload, como aconteceria com um
backend real.

1. **`assets/js/storage.js`** — camada de persistência isolada (get/set por cliente +
   lista de clientes criados manualmente). `data.js` chama `applyStoredOverrides()` uma vez
   no carregamento e reaplica por cima dos dados fictícios: orientação enviada, metas da
   próxima semana, lembretes, novos alunos.
2. **Dashboard do coach virou fila de trabalho**, não resumo: "Acompanhamento da semana"
   com contador dinâmico (`N de M concluídos`), agrupado em Check-ins recebidos → Em
   acompanhamento → Aguardando check-in. Revisar um aluno e enviar a orientação
   (`Trackly.completeOrientation`) move ele de seção e atualiza o contador imediatamente ao
   voltar pro dashboard — sem reload manual.
3. **Metas e métricas são por aluno, nunca globais** — `client.tracking` (booleano por
   métrica) decide o que aparece pra aquele aluno em TODA a interface: check-in (wizard
   filtra perguntas por `Trackly.checkinTemplateFor`), revisão, perfil, evolução, histórico,
   home do aluno. Pedro não acompanha sono/medidas; Ana não acompanha água/digestão/emocional
   — ver `tracking()` em `data.js`.
4. **Fluxo de convite** — `coach/clientes.html` ganhou "+ Adicionar aluno" (nome/e-mail/
   telefone) → `Trackly.createClient` → "Enviar convite" → `convite.html` (simulação de
   aceite) → `Trackly.acceptInvite`, que também semeia a primeira semana do aluno pra ele
   entrar direto no ciclo normal (mais simples e robusto do que manter um cliente "vazio"
   espalhado por todas as telas).
5. **`Trackly.focusLabelFromOrientation`** agora prioriza o "Foco da semana" que o coach
   escreveu explicitamente (`week.focusOverride`) antes de tentar derivá-lo do texto da
   orientação — corrige um bug onde esse campo era salvo mas nunca lido.

## V5 — contexto histórico na revisão, agendamento do check-in, gráficos maiores

1. **Dashboard do coach** — contadores viraram 3 categorias sem ambiguidade (Concluídos /
   Para revisar / Aguardando resposta, nessa ordem), com um estado final "Acompanhamento da
   semana concluído" quando os dois primeiros zeram.
2. **Revisão do check-in reordenada** com contexto histórico: Resumo → O que mudou → **Últimas
   semanas** (mini-tabela S-2/S-1/Atual, só com métricas acompanhadas —
   `Trackly.recentWeeksTable()`) → Respostas completas (expansível) → **Evolução visual**
   (prévia semana anterior vs. atual + link "Ver comparação") → Decisão/Orientação → Enviar.
3. **Janela do check-in semanal** — `Trackly.getCheckinWindowStatus()` em `data.js` (quinta =
   lembrete, sexta–domingo = aberto, segunda–quarta = fechado), controlada por um `APP_DATE`
   central e independente do `ANCHOR` que organiza as semanas do dado fictício. Suporta
   `?simDate=YYYY-MM-DD` na URL só para testar os 3 estados sem editar código. O coach nunca é
   bloqueado por essa regra — só o portal do aluno (home e check-in) a respeita.
4. **Gráficos maiores e com desenho progressivo** (`assets/js/charts.js`) — a linha se desenha
   ao carregar (CSS, respeita `prefers-reduced-motion`), pontos/barras entram com fade suave, e
   um tooltip flutuante único (`.chart-tooltip`, delegado por evento) substitui o `<title>`
   nativo do SVG em qualquer gráfico da aplicação.
5. **Configurações de tracking bem diferenciadas por aluno** (seção 53 do brief V5) — João
   acompanha tudo; Maria treino+água+sono; Pedro treino+cardio; Ana treino+aderência+fotos.
   Isso expôs (e corrigiu) uma lacuna real: os gráficos de Água e Cardio nunca tinham sido
   ligados nas telas de Evolução (coach e aluno) — existiam no motor de gráficos mas não eram
   chamados por nenhuma página.

## Inventário de telas do MVP

**Coach** (desktop-first, responsivo)
1. Dashboard — visão geral + "quem precisa de atenção"
2. Clientes — lista, filtros, busca
3. Perfil do cliente — resumo, evolução (gráficos), check-ins, metas, fotos, histórico (abas)

**Cliente** (mobile-first)
4. Início — progresso + metas da semana
5. Responder check-in
6. Evolução — gráficos + fotos
7. Histórico — timeline

Landing/apresentação do conceito também incluída (`prototype/index.html`).

## V6 — redesign Apple/Wellness premium

Transformação de linguagem visual sobre a mesma lógica/dados: escala de espaçamento e
tipografia (`--space-*`, `--text-hero`, `--text-counter`), componentes compartilhados
`.hero-stat`/`.big-counter`/`.list-row`/`.compare-slider`/`.step-dots`, motor de gráficos
retocado (grid reduzido a 2 linhas, ponto atual discreto, tooltip refinado). Dashboard do
coach virou um indicador central (`X/Y acompanhados`) com "Concluídos" recolhido atrás de
clique; a tabela de clientes virou lista de linhas; o perfil do cliente ganhou abas
reordenadas (Visão geral/Evolução/Fotos/Histórico) e a aba Fotos foi reconstruída em torno
de um comparador antes/depois arrastável, substituindo a galeria por semana. Nenhuma
mudança em `data.js` além de bump de versão — puramente camada de apresentação.

## V7 — inteligência de produto (memória/padrões) + ajustes finais de app premium

A missão desta versão foi transformar o histórico semanal acumulado em contexto útil pro
coach, sem IA genérica e sem inventar métricas — só leitura regrada de `client.weeks`:

1. **`Trackly.buildCoachMemory(client)`** (`assets/js/data.js`) — devolve um resumo do
   período (peso/aderência/semanas-na-meta), até duas observações "o que está funcionando"
   e "merece atenção", e uma nota de marco (menor peso do acompanhamento / faixa de
   estabilidade do peso). Regra de dados mínimos, tudo num só lugar: **< 3 semanas
   submetidas → retorna `null`** (nada aparece); **3–5 semanas** → só a comparação
   início/fim do período; **6+ semanas** → também consistência (taxa de acerto de metas,
   aderência alta); **8+ semanas** → também a faixa de estabilidade do peso. Consumido pela
   aba Visão Geral do perfil do cliente (`coach/cliente.html`).
2. **`Trackly.trendLine(client)`** — uma única frase cautelosa de tendência ("Peso caiu
   2.1kg nas últimas 8 semanas."), nunca causal, exibida logo abaixo do hero de peso na
   Evolução (coach e portal). Mesma régua de dados mínimos (3+ semanas).
3. **"O que mudou" na revisão** (`coach/revisar.html`) deixou de ser frases soltas
   (`checkInInsights`) e virou pares objetivos semana-anterior → semana-atual (peso,
   aderência, sono), coloridos por favorável/desfavorável — mais rápido de escanear que
   texto corrido.
4. **Check-in reordenado**: Peso e fotos agora é a etapa 1 (antes era a etapa 4),
   refletindo a ordem real do workflow (`CHECKIN_TEMPLATE`/`CHECKIN_STEPS` em `data.js` +
   `portal/checkin.html`).
5. **Notificações simuladas** — "Avisar coach" e "Avisar no WhatsApp" na tela de sucesso do
   check-in do aluno; "Enviar também pelo WhatsApp" na tela de sucesso da orientação do
   coach. São simulações de UI local (troca de texto do botão + `disabled`), sem chamada de
   rede e sem novo campo persistido — um espaço reservado explícito para uma integração
   real futura, não uma funcionalidade fingida como pronta.

**Simplificação deliberada**: o brief pede uma estrutura `coachMemory` com um array
`patterns` separado de `strengths`/`attentionPoints`. Como todo padrão que esta versão
consegue detectar honestamente já cai em uma dessas duas categorias, `patterns` foi
propositalmente omitido em vez de existir como um array sempre vazio.

## V8 — avaliação do aluno como centro do produto

A missão desta versão foi tornar a revisão semanal do coach ("Avaliação", antes
"Revisar check-in") o lugar onde peso, fotos, contexto histórico e decisão convivem —
e corrigir duas lacunas reais de persistência que sobreviveram a todas as versões
anteriores sem serem notadas:

1. **Bug de persistência corrigido — o mais importante desta versão**: o wizard de
   check-in do aluno (`portal/checkin.html`) nunca gravava nada. `submit()` só trocava a
   tela pra "Check-in enviado!" — `cur.checkin.status` continuava `"pending"` depois de
   um reload, e nenhum valor digitado (peso, treinos, respostas) chegava a
   `client.weeks`. Isso passou despercebido em V1–V7 porque toda verificação anterior
   testava o fluxo só até a tela de confirmação, sem de fato recarregar a página do
   aluno depois. Corrigido com `Trackly.submitCheckin(clientId, payload)` (novo, em
   `data.js`) que atualiza `checkin.status/submittedAt`, `metrics.*`, recalcula
   `goals[].status` e persiste via `TracklyStore.patchClient` — reaplicado em
   `applyStoredOverrides()` como qualquer outra mutação.
2. **Bug de colisão de atributo corrigido**: os painéis do wizard (`.step-panel`) e os
   botões +/− dos steppers de treino/cardio usavam o mesmo atributo `data-step` para
   propósitos diferentes. Um clique no botão borbulhava até o painel ancestral, que
   também tinha um listener `[data-step]` — disparando uma segunda execução do handler
   com uma chave inexistente (`"3"`, o número do painel) e lançando
   `Cannot set properties of null` no console a cada clique num stepper, silenciosamente,
   desde a primeira versão. Corrigido renomeando o atributo do painel para
   `data-step-panel`.
3. **`Avaliação`** (renomeada de `coach/revisar.html`): Resumo da Semana simplificado
   pra peso/aderência/treinos; "Evolução desta semana" — um módulo grande combinando o
   hero de peso com o mesmo `.compare-slider` das abas Fotos, fixo em
   semana-anterior→semana-atual (a decisão que o coach está tomando agora, não uma
   comparação livre); "O que mudou" virou pares objetivos antes→depois; novo campo
   "Notas do coach" (`cur.coachReview.note`, persistido junto da orientação).
4. **Um período controla tudo**: `Trackly.buildPeriodSummary(client, range)` passou a
   aceitar o mesmo token do seletor de período da UI (`"4"|"8"|"12"|"all"`) em vez de um
   número de semanas fixo. Isso corrigiu um bug real em `portal/evolucao.html`, onde o
   "Resumo do período" ficava sempre travado nas últimas 8 semanas independente do botão
   clicado — e adicionou o mesmo resumo (que não existia) à aba Evolução do coach.
5. **Fotos** — comparador maior (`.compare-slider.lg`, até 640px) e um seletor
   Frente/Costas/Lateral funcional: ele troca qual placeholder aparece (varia o matiz),
   nunca finge ser uma foto real — a legenda "Placeholders ilustrativos" continua em
   todo lugar que mostra um.
6. **Histórico**: rótulo da semana concluída passou de "✓ Orientação enviada" para
   "✓ Acompanhamento concluído", conforme o texto literal do brief.

Nada de novo em `localStorage`/schema além de `coachReview.note` e `checkinSubmitted`
(ambos dentro do patch existente por cliente) — `WeeklyCycle`, convite, métricas e metas
individuais permanecem exatamente como antes.
