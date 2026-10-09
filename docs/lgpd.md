# Trackly — Conformidade LGPD

Registro das operações de tratamento (art. 37) e mapa de onde cada obrigação está implementada.
Vale para o app real (`web/` + `supabase/`). O protótipo estático (`prototype/`) só tem dados
fictícios e não trata dado pessoal real.

Versão vigente dos documentos: `LEGAL_VERSION` em `web/lib/legal/documents.ts`.

## Papéis

| Dado | Controlador | Operador |
|---|---|---|
| Conta do coach (nome, e-mail, login) | Trackly | — |
| Dados dos alunos (perfil, saúde, fotos, pagamentos) | **Coach** | Trackly |

A relação controlador–operador (art. 39) está na seção 3 dos Termos de Uso (`/termos`), aceita
pelo coach no cadastro e registrada em `consent_records`.

## 1. Coleta — qual dado, por quê, base legal

| Categoria | Onde entra | Finalidade | Base legal |
|---|---|---|---|
| Nome, e-mail, senha (coach) | `/cadastro` | Conta e acesso | Contrato (art. 7º, V) |
| Nome, e-mail, telefone, idade, sexo, altura, objetivo (aluno) | coach em `/coach/alunos` | Acompanhamento | Contrato (art. 7º, V) |
| **Saúde — sensível**: peso, medidas, fotos corporais, check-ins, sono, energia, fome, treinos, alimentação, água, orientações | portal do aluno + coach | Acompanhamento | **Consentimento específico e destacado (art. 11, I)** |
| Pagamentos (valores, vencimentos, status) | coach em `/pagamento` | Financeiro do coach | Contrato / obrigação legal |
| IP, user agent, data/hora | toda requisição; gravados junto do consentimento | Segurança, prova, Marco Civil | Obrigação legal (art. 7º, II) |

Como o titular sabe e concorda:
- Coach: checkbox obrigatória (não pré-marcada) em `/cadastro` → registro em `consent_records`.
- Aluno: as 2 caixas (Política/Termos e dados de saúde em destaque) ficam na **própria tela de
  convite** (`/convite`), junto da criação da conta. O registro nasce com `client_id` + IP/user
  agent e é vinculado ao login no callback do magic link (migration 0011).
- Links para Termos e Política no rodapé de toda tela (`web/app/legal-links.tsx`).
- Gate em `requireCoach`/`requireClient` (rede de segurança — só aparece para contas criadas
  antes do registro ou quando a versão dos documentos muda): sem aceite da versão atual, nenhuma tela abre. Subir
  `LEGAL_VERSION` força novo aceite de todos.
- Menores: ainda **não** há declaração de maioridade nem consentimento do responsável (art. 14)
  no app — adiado por decisão de produto (ver Pendências).

## 2. Armazenamento

- Supabase (Postgres + Auth + Storage). Região do projeto: **[CONFERIR — ver Pendências]**.
- Isolamento por conta via RLS em toda tabela (migrations 0001–0009, `0003_RLS_MATRIX.md`).
- Fotos em bucket **privado** `checkin-photos`, path `account_id/client_id/...`, URL assinada de
  10 min (`web/lib/storage/*`).
- Service role só no servidor (`server-only`), nunca no browser.
- Sem dado sensível em `localStorage` (regra do projeto). Cookies: só os de sessão do Supabase.

Retenção adotada (descrita na Política, seção 5):

| Dado | Prazo |
|---|---|
| Dados de conta e acompanhamento | Enquanto ativo; até 15 dias após pedido de exclusão |
| Backups do Supabase | Ciclo automático do plano |
| Logs de acesso | 6 meses (Marco Civil, art. 15) |
| `consent_records`, `data_subject_requests` | 5 anos (prova de conformidade, art. 16, I) |

## 3. Compartilhamento (suboperadores)

| Fornecedor | Uso | DPA | Fora do Brasil? |
|---|---|---|---|
| Supabase Inc. | Banco, auth, storage, e-mails de acesso | **Assinar** (painel da organização › Legal) | Depende da região |
| [Hospedagem do app] | Executar o Next.js | **Assinar** | Depende da região |

Não há analytics, pixel, gateway de pagamento nem IA externa recebendo dados hoje. Todo
fornecedor novo entra nesta tabela **e** na Política antes de ir pra produção.

## 4. Direitos do titular (art. 18)

| Direito | Aluno | Coach |
|---|---|---|
| Acesso / confirmação | `/meus-dados` › Baixar (na hora) | Exporta qualquer aluno pelo pedido |
| Portabilidade | JSON estruturado em `/meus-dados/exportar` | `/coach/privacidade/exportar/[id]` |
| Correção | Pedido em `/meus-dados` → coach corrige | Edita direto no app |
| Exclusão | Pedido em `/meus-dados` → coach executa | "Excluir todos os dados" no pedido (banco + fotos + login) |
| Revogar consentimento | Botão em `/meus-dados` (pausa o portal) | — |
| Informação sobre compartilhamento | Política, seção 4; pedido "access" | — |
| Encerrar a própria conta | — | Pedido em Configurações (Trackly atende fora do app) |

`/meus-dados` fica **fora** do gate de consentimento: quem revogou continua exercendo direitos.
Prazo de resposta: 15 dias (`REQUEST_RESPONSE_DAYS`), com prazo e atraso visíveis pro coach.
Recusa exige justificativa (art. 18, §4º) — a RPC bloqueia recusa sem motivo.

Implementação: `web/lib/privacy/client-data.ts` (export + exclusão), `web/app/(legal)/meus-dados`,
`web/app/coach/configuracoes`.

## 5. Evidência

Migration `supabase/migrations/0010_lgpd_consent_and_rights.sql`:

- `consent_records` — append-only (sem policy de UPDATE/DELETE): quem, papel, finalidade,
  versão do documento, aceite/revogação, IP, user agent, data.
- `data_subject_requests` — todo pedido, status, resposta, quem resolveu e quando.
- Nenhuma das duas tem FK pro titular: a prova sobrevive à exclusão dos dados.
- Escrita só por RPC `security definer` que deriva o titular de `auth.uid()`.
- `plan_change_logs`, `client_metric_setting_changes`, `payment_events`: trilhas de alteração
  já existentes.

## Pendências (só o responsável pelo negócio resolve)

1. **Preencher `CONTROLLER`** em `web/lib/legal/documents.ts` (razão social, CNPJ, endereço,
   encarregado) e a região do Supabase na Política. O campo da hospedagem fica para quando ela for definida.
2. **Conferir a região do projeto Supabase** (Project Settings › General). Ideal: São Paulo
   (`sa-east-1`). Se for fora, manter a cláusula de transferência internacional (art. 33).
3. **Assinar o DPA** do Supabase. Hospedagem (e o DPA dela) fica para quando for definida.
4. **Encarregado (DPO)**: nomear e publicar o contato. A dispensa para agente de pequeno porte
   (Res. CD/ANPD nº 2/2022) pode não valer para tratamento de dado de saúde.
5. **Procedimento de encerramento de conta de coach** (pedidos com `requester_role = 'coach'`):
   hoje é manual — exportar, apagar Storage do prefixo `account_id/`, apagar `accounts` e logins.
6. **Plano de resposta a incidentes** (art. 48): quem avalia, prazo de comunicação à ANPD
   (Res. CD/ANPD nº 15/2024: 3 dias úteis) e aos titulares.
7. **Menores de idade**: definir se o produto aceita; se sim, fluxo de consentimento do responsável.
8. Retenção automática (expurgo de logs e de registros com mais de 5 anos) ainda não está
    automatizada.
