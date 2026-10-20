== NOVA VERSÃO ==
TRACKLY V5 — MASTER TODO
Evolução do produto, onboarding inteligente, planos de serviço, painel administrativo e identidade visual
CONTEXTO DO PROJETO

O Trackly é uma plataforma SaaS para coaches de fitness e seus alunos.

O projeto já possui uma base desenvolvida, com autenticação, Supabase, acompanhamento semanal, avaliações, alunos, treinos, nutrição, evolução, financeiro, notificações, configurações e portal do aluno.

A assinatura mensal do coach para utilizar o Trackly possui uma implementação baseada na SyncPay, com suporte previsto para Pix Automático e cartão recorrente.

Já existem também contas de demonstração de coach e aluno, que deverão ser integradas em um ambiente central de visualização e testes.

Não reconstruir o projeto do zero. A tarefa é evoluir a base existente, preservar os recursos que funcionam e acrescentar as melhorias necessárias.

O objetivo é transformar o Trackly em um aplicativo premium, visualmente marcante, fácil de utilizar e organizado em torno de uma jornada contínua:

Convite → Cadastro do aluno → Questionário inicial → Preparação do protocolo → Entrega do plano → Acompanhamento semanal → Avaliação → Evolução.

Paralelamente, criar um ambiente administrativo exclusivo para o proprietário do Trackly, no qual seja possível acompanhar as assinaturas, consultar os indicadores do negócio e alternar rapidamente entre as experiências de demonstração do coach e do aluno.

REGRAS OBRIGATÓRIAS

Trabalhar sobre a base existente.

Preservar autenticação, banco de dados, integrações e funcionalidades já implementadas.

Não substituir o Supabase ou reconstruir a integração da SyncPay.

Fazer somente as alterações de dados necessárias para as novas funcionalidades, utilizando migrações incrementais e compatíveis.

Não apagar históricos de alunos, avaliações, fotos, planos ou pagamentos.

Não misturar a mensalidade que o coach paga ao Trackly com os valores que o coach cobra de seus alunos.

Não inventar transações, assinaturas ativas, faturamento ou dados de demonstração como se fossem registros reais.

Proteger o painel administrativo do proprietário com autorização verificada no servidor. Esconder uma opção do menu não constitui controle de acesso.

Utilizar a imagem de referência da Vega como principal orientação visual para a reformulação do Financeiro e como referência estética para o restante do produto. Reproduzir de perto a linguagem visual, a composição, os contrastes e a organização, substituindo a identidade e os dados específicos da Vega pelos do Trackly.

Aproveitar a possibilidade de experimentar mudanças visuais mais ousadas, pois as versões anteriores estão salvas no GitHub. Antes de alterações estruturais, preservar um ponto de retorno seguro e não descartar modificações preexistentes.

Marcar [x] apenas quando a tarefa tiver sido realmente implementada e testada.

FASE 1 — IDENTIDADE VISUAL E EXPERIÊNCIA DO PRODUTO
[ ] 1. REFORMULAR A IDENTIDADE VISUAL GERAL DO TRACKLY
Utilizar a referência visual da Vega como principal inspiração estética.
Preservar a identidade dark premium do Trackly.
Utilizar preto profundo e grafite como base.
Manter o amarelo vivo como principal cor de destaque.
Utilizar verde ou turquesa para estados positivos.
Utilizar amarelo para atenção e estados intermediários.
Utilizar vermelho ou coral para erros e situações críticas.
Aumentar o contraste entre o fundo, as superfícies e as ações.
Criar uma interface mais expressiva, moderna e agradável de utilizar.
Evitar que todas as telas sejam compostas por retângulos idênticos.
Alternar cartões, indicadores circulares, linhas do tempo, gráficos, painéis, listas, faixas e composições visuais maiores.
Criar componentes com personalidade própria para treino, nutrição, avaliação, progresso e financeiro.
Manter consistência entre coach, aluno e painel administrativo.
Não copiar o logotipo da Vega nem reutilizar sua marca ou seus textos.
Reproduzir a linguagem visual da referência de forma próxima, adaptada ao Trackly.
[ ] 2. TRANSFORMAR O TRACKLY EM UM APLICATIVO MAIS DINÂMICO
Rever as composições das páginas para reduzir a sensação de interface engessada.
Criar hierarquias visuais mais marcantes.
Explorar elementos assimétricos quando contribuírem para a compreensão.
Utilizar indicadores gráficos com animações discretas.
Criar transições suaves entre estados.
Animar a conclusão de tarefas importantes.
Criar feedback visual ao finalizar treino, check-in e avaliação.
Melhorar as transições entre exercícios.
Criar microinterações para destacar mudanças de estado.
Utilizar animações para orientar a atenção, não apenas para decorar.
Evitar animações excessivas ou demoradas.
Preservar acessibilidade e suporte a movimentos reduzidos.
Garantir que os efeitos funcionem bem em dispositivos móveis.
Não transformar todas as páginas em dashboards com dezenas de cartões.
[ ] 3. REVISAR A NAVEGAÇÃO PRINCIPAL DO COACH
Preservar as áreas principais de Acompanhamento, Avaliações, Alunos e Financeiro.
Organizar a navegação para dar acesso claro a Treinos e Nutrição.
Evitar o excesso de opções na barra lateral.
Manter Configurações e informações da conta em uma área secundária.
Melhorar o tamanho e o alinhamento dos ícones.
Ajustar espaçamentos e áreas clicáveis.
Destacar claramente a seção selecionada.
Garantir que a navegação permaneça consistente em desktop e celular.
Evitar duplicar a mesma funcionalidade em diferentes caminhos.
Manter a avaliação semanal como uma das principais tarefas do coach.
[ ] 4. REFORMULAR O ACOMPANHAMENTO DO COACH
Tornar a página uma visão geral da operação.
Mostrar o progresso da semana.
Destacar alunos que precisam de ação.
Mostrar novos alunos que já preencheram o questionário inicial e aguardam protocolo.
Mostrar check-ins aguardando revisão.
Mostrar avaliações pendentes.
Mostrar orientações ainda não concluídas.
Mostrar situações que merecem atenção.
Criar uma área de resumo visual da operação.
Evitar repetir a fila completa de Avaliações.
Diferenciar claramente pendências do coach e pendências do aluno.
Oferecer acesso direto às tarefas prioritárias.
Manter a página limpa, informativa e rápida de percorrer.
[ ] 5. REFORMULAR O FINANCEIRO COM BASE NA REFERÊNCIA DA VEGA
Utilizar a imagem da Vega como referência visual principal desta página.
Reproduzir de perto a linguagem visual do dashboard de referência: navegação compacta, cabeçalho, filtros, indicadores destacados, gráficos escuros e cores fortes para estados.
Adaptar a composição ao financeiro do coach dentro do Trackly.
Organizar os indicadores financeiros em uma linha visual clara.
Utilizar gráficos de receitas e recebimentos quando existirem dados reais suficientes.
Utilizar gráficos de distribuição por situação de pagamento quando houver dados para isso.
Melhorar a hierarquia entre indicadores principais e detalhes.
Manter filtros de período fáceis de utilizar.
Melhorar tabelas e listas de pagamentos.
Criar estados vazios coerentes quando não existirem transações.
Não preencher gráficos com valores fictícios apresentados como reais.
Não misturar as assinaturas que o coach paga ao Trackly com os valores que ele cobra dos próprios alunos.
Preservar os dados e funcionalidades financeiras atualmente existentes.
Utilizar a mesma linguagem visual no restante da plataforma sem forçar todas as telas a copiar a estrutura do Financeiro.
[ ] 6. REFORMULAR A EXPERIÊNCIA DE AVALIAÇÃO SEMANAL
Separar claramente os dados recebidos na semana atual dos registros históricos.
Mostrar peso, fotos e respostas atuais em uma área identificada como “Recebido nesta semana”.
Manter a comparação com semanas anteriores em uma área própria.
Evitar repetir os mesmos indicadores em várias seções.
Reduzir o excesso de texto visível simultaneamente.
Melhorar a hierarquia dos números.
Destacar a comparação de fotos.
Organizar os sinais importantes em componentes visuais compactos.
Destacar a área de decisão do coach.
Manter a nota privada separada da orientação que será enviada.
Facilitar a conclusão da avaliação sem obrigar o coach a percorrer longas seções.
Melhorar a visualização em telas menores.
Preservar os dados e os registros históricos existentes.
FASE 2 — NOVO FLUXO DE CADASTRO E ONBOARDING DO ALUNO
[ ] 7. SIMPLIFICAR O FORMULÁRIO DE ADIÇÃO DE ALUNOS PELO COACH
Reformular o formulário atual de criação de aluno.
Solicitar apenas nome, e-mail e telefone como dados básicos de contato.
Permitir que o coach selecione o pacote de serviço do aluno.
Disponibilizar três opções: Treino, Nutrição e Híbrido.
Mostrar claramente o que cada opção inclui.
Mostrar o preço correspondente ao pacote escolhido.
Obter o valor das configurações de preço do coach.
Se ainda não houver preço configurado para um pacote, permitir defini-lo antes de concluir o convite.
Evitar solicitar altura, idade, peso ou informações de rotina nesse formulário.
Essas informações deverão ser preenchidas pelo próprio aluno no questionário inicial.
Evitar obrigar o coach a preencher antecipadamente dados que o aluno pode fornecer diretamente.
Manter o formulário compacto, organizado e rápido de preencher.
Utilizar os componentes e o fluxo de convite existentes sempre que possível.
[ ] 8. IMPLEMENTAR O NOVO FLUXO DE CONVITE DO ALUNO
Reaproveitar a integração atual de autenticação e envio de convite.
Após o coach preencher o formulário e selecionar o pacote, criar o registro do convite.
Enviar o link de cadastro para o e-mail informado.
Preservar os mecanismos existentes de confirmação de e-mail e criação de conta.
Não criar um sistema paralelo de autenticação.
Mostrar ao coach uma confirmação explícita de que o convite foi enviado.
Exibir o e-mail de destino na confirmação.
Mostrar a situação do convite.
Permitir reenviar o convite quando aplicável.
Permitir copiar o link do convite quando o fluxo atual suportar isso.
Não informar que o convite foi enviado se a operação de envio tiver falhado.
Não ativar o protocolo antes da conclusão do onboarding e da preparação do plano.
Evitar criar contas duplicadas quando o coach tentar repetir um convite.
Garantir que um convite pendente possa ser retomado.
[ ] 9. CRIAR O QUESTIONÁRIO INICIAL INTERATIVO DO ALUNO
Fazer o questionário aparecer quando o aluno entrar pela primeira vez após criar e confirmar sua conta.
Evitar que o aluno seja direcionado diretamente para um dashboard vazio antes de responder às perguntas obrigatórias.
Criar uma experiência guiada, com etapas claras e indicador de progresso.
Solicitar idade ou os dados necessários para determiná-la.
Solicitar altura.
Solicitar peso atual.
Perguntar sobre objetivo e expectativas.
Perguntar sobre rotina e horários.
Perguntar sobre disponibilidade semanal.
Coletar informações sobre hábitos relevantes para o serviço contratado.
Permitir respostas por seleção, números, múltipla escolha e textos curtos, conforme a pergunta.
Evitar que todo o formulário seja uma única página longa.
Salvar o progresso do preenchimento.
Permitir retomar o questionário depois de sair.
Validar os campos obrigatórios.
Mostrar erros de forma clara.
Mostrar uma confirmação depois do envio.
Distinguir esse questionário inicial do check-in semanal.
Estruturar as perguntas de forma facilmente configurável para que o questionário possa ser adaptado ao formulário original utilizado pelo coach.
Não inventar perguntas definitivas que contradigam um formulário de referência posteriormente fornecido.
[ ] 10. ADAPTAR O QUESTIONÁRIO AO PACOTE CONTRATADO
Criar perguntas comuns a todos os alunos.
Criar perguntas específicas para quem contratou Treino.
Criar perguntas específicas para quem contratou Nutrição.
Quando o pacote for Híbrido, combinar as seções de forma organizada.
Para Treino, perguntar sobre experiência, disponibilidade, equipamentos e rotina de exercícios.
Para Nutrição, perguntar sobre hábitos alimentares, rotina de refeições, alimentos preferidos, alimentos que não gosta e outras informações pertinentes.
Permitir registrar restrições e informações relevantes para o planejamento quando necessário.
Evitar perguntas irrelevantes para o serviço contratado.
Utilizar perguntas objetivas e respostas estruturadas sempre que fizer sentido.
Permitir observações complementares.
Manter os dados sensíveis restritos ao contexto apropriado.
Evitar coletar informações pessoais que não sejam necessárias.
Criar um formulário que possa ser expandido quando o questionário original completo for disponibilizado.
[ ] 11. IMPLEMENTAR A ETAPA “SEU PROTOCOLO ESTÁ SENDO PREPARADO”
Após o envio bem-sucedido do questionário, mostrar uma tela de conclusão.
Informar que os dados foram enviados ao coach.
Informar que o protocolo será preparado em até três dias.
Calcular e mostrar a data prevista de conclusão com base no momento do envio.
Não apresentar um prazo fictício ou deixar uma data fixa no código.
Mostrar visualmente o estado do processo.
Permitir que o aluno consulte os dados do questionário enviados.
Informar que o coach poderá preparar o treino, a nutrição ou ambos, dependendo do pacote contratado.
Manter o aluno dentro do portal, em vez de mostrar apenas uma tela vazia.
Mostrar uma experiência visual agradável enquanto o protocolo está em preparação.
Não fingir que o protocolo foi concluído antes da publicação real.
Liberar progressivamente as funcionalidades incluídas conforme os planos forem publicados.
Informar claramente quando o protocolo estiver pronto.
[ ] 12. CRIAR UMA JORNADA DE STATUS PARA O ONBOARDING
Representar o estado do convite enviado.
Representar o estado de conta criada.
Representar o questionário pendente.
Representar o questionário enviado.
Representar o protocolo em preparação.
Representar o protocolo parcialmente publicado quando o pacote incluir mais de um serviço.
Representar o protocolo concluído.
Mostrar esses estados de forma compreensível para o coach.
Mostrar somente as informações pertinentes para o aluno.
Evitar status genéricos como “Pendente” quando for possível informar exatamente o que falta.
Garantir que o sistema não confunda convite pendente com questionário pendente.
Garantir que o sistema não confunda questionário concluído com protocolo pronto.
Preservar o histórico dos eventos importantes.
FASE 3 — PACOTES, PREÇOS E DISPONIBILIDADE DOS MÓDULOS
[ ] 13. CRIAR UMA LÓGICA CLARA PARA OS PACOTES DE SERVIÇO DOS ALUNOS
Criar os pacotes Treino, Nutrição e Híbrido como opções distintas.
Determinar quais funcionalidades pertencem a cada pacote.
Permitir que o coach defina os valores padrão dos três pacotes.
Utilizar esses valores no formulário de criação do aluno.
Mostrar o preço associado ao pacote selecionado antes de enviar o convite.
Salvar o pacote contratado no registro do aluno.
Salvar o valor contratado como um registro histórico daquele acordo.
Não alterar silenciosamente o pacote ou o valor de alunos já ativos quando os preços padrão forem modificados.
Manter o valor contratado vinculado ao aluno.
Diferenciar o pacote de serviço do aluno da assinatura mensal do coach com o Trackly.
Não confundir os preços dos serviços do coach com a mensalidade da plataforma.
Preparar a estrutura para que futuras mudanças contratuais possam ser registradas explicitamente.
Não implementar uma cobrança automática do coach para o aluno se esse recurso não estiver disponível no sistema atual.
[ ] 14. GARANTIR QUE A ALTERAÇÃO DO PACOTE OU DO PREÇO EXIJA UM PROCESSO EXPLÍCITO
Não permitir que uma alteração geral de preços modifique contratos existentes automaticamente.
Permitir que o coach consulte o pacote e o valor contratado pelo aluno.
Criar uma ação específica para solicitar ou registrar uma mudança de pacote.
Exigir confirmação explícita antes de alterar o pacote contratado.
Registrar o valor anterior.
Registrar o novo valor.
Registrar a data de vigência.
Registrar o motivo da mudança quando aplicável.
Permitir indicar que a mudança foi discutida e acordada com o aluno.
Preparar uma etapa de confirmação pelo aluno quando esse fluxo fizer parte da experiência implementada.
Manter o histórico contratual.
Não alterar retroativamente os valores de registros financeiros anteriores.
Não misturar essa mudança contratual com a assinatura do coach perante o Trackly.
[ ] 15. IMPLEMENTAR O BLOQUEIO VISUAL DOS MÓDULOS NÃO CONTRATADOS
Para alunos com pacote Treino, disponibilizar o módulo de treino e bloquear o módulo de Nutrição.
Para alunos com pacote Nutrição, disponibilizar o módulo de Nutrição e bloquear o módulo de treino.
Para alunos com pacote Híbrido, disponibilizar os dois módulos.
Não esconder completamente os módulos não contratados.
Mostrar uma prévia visual demonstrativa do recurso.
Aplicar uma sobreposição visual com cadeado.
Mostrar claramente que o recurso não faz parte do pacote contratado.
Utilizar textos amigáveis e objetivos.
Disponibilizar uma ação para conversar com o coach quando o aluno desejar mudar de pacote.
Não apresentar a tela bloqueada como se fosse um erro.
Não permitir que o aluno execute ações bloqueadas.
Não expor dados reais de planos que não fazem parte do pacote.
Utilizar conteúdo demonstrativo não sensível na prévia.
Manter a identidade visual premium.
Não tratar um módulo temporariamente indisponível como se estivesse permanentemente excluído do pacote.
[ ] 16. DIFERENCIAR RECURSOS NÃO CONTRATADOS DE PROTOCOLOS AINDA NÃO PUBLICADOS
Criar um estado visual próprio para recursos incluídos no pacote, mas ainda em preparação.
Mostrar a mensagem de que o coach está preparando o protocolo.
Informar o prazo previsto de até três dias.
Liberar cada módulo incluído assim que o respectivo plano for efetivamente publicado, se essa for a regra de liberação definida.
Considerar o protocolo completo somente quando todos os módulos previstos no pacote estiverem publicados.
Para recursos não contratados, manter o cadeado com a explicação comercial.
Para recursos incluídos, não apresentar uma mensagem de upsell.
Evitar confusão entre falta de contratação e falta de preparação.
Garantir que o aluno entenda por que não consegue acessar determinada área.
FASE 4 — RECEPÇÃO DAS INFORMAÇÕES E PREPARAÇÃO DO PROTOCOLO PELO COACH
[ ] 17. CRIAR UMA FILA DE NOVOS ALUNOS PARA O COACH
Reaproveitar a seção atual de Alunos.
Criar uma aba ou filtro para Novos cadastros.
Mostrar alunos que aceitaram o convite, mas ainda não completaram o questionário.
Mostrar alunos que já enviaram o questionário e aguardam a preparação do protocolo.
Mostrar a data em que o questionário foi recebido.
Mostrar o pacote contratado.
Mostrar o prazo previsto de conclusão.
Criar ações claras para abrir o questionário e começar a preparar o protocolo.
Mostrar um indicador no Acompanhamento quando existirem protocolos pendentes.
Evitar adicionar uma nova seção permanente ao menu principal se uma aba em Alunos resolver o problema.
Criar uma fila operacional clara, sem duplicar toda a página de Alunos.
Permitir filtrar os alunos que aguardam questionário e os que aguardam protocolo.
[ ] 18. ORGANIZAR O QUESTIONÁRIO INICIAL DENTRO DO PERFIL DO ALUNO
Criar uma seção identificada como Questionário inicial.
Mostrar as informações fornecidas pelo aluno.
Organizar as respostas por categorias.
Permitir que o coach consulte as respostas sem percorrer um formulário desorganizado.
Destacar as informações essenciais para montar o protocolo.
Mostrar o pacote contratado.
Mostrar o prazo previsto para conclusão.
Diferenciar claramente as informações do questionário inicial das respostas dos check-ins semanais.
Manter o histórico das respostas.
Permitir navegar entre questionário inicial, avaliação semanal, treino e nutrição.
Não pedir que o coach cadastre novamente informações já fornecidas pelo aluno.
Não substituir os dados originais do questionário pelas observações posteriores do coach.
[ ] 19. ADAPTAR A MONTAGEM DO PROTOCOLO AO PACOTE DO ALUNO
Permitir criar um protocolo somente de treino.
Permitir criar um protocolo somente de nutrição.
Permitir criar um protocolo híbrido.
Mostrar o pacote contratado durante a preparação.
Dar acesso direto às informações relevantes do questionário.
Permitir abrir o editor de treino quando o pacote incluir treino.
Permitir abrir o editor de nutrição quando o pacote incluir nutrição.
Não exigir a criação de uma dieta para um aluno que contratou somente treino.
Não exigir a criação de um treino para um aluno que contratou somente nutrição.
Permitir salvar rascunhos.
Mostrar claramente o que falta para concluir o protocolo.
Permitir pré-visualizar os planos como aluno.
Mostrar uma ação clara para publicar o protocolo.
Garantir que a publicação libere os módulos correspondentes.
Não considerar um rascunho como protocolo entregue.
[ ] 20. CONECTAR A PUBLICAÇÃO DO PROTOCOLO À EXPERIÊNCIA DO ALUNO
Após a publicação, atualizar o estado correspondente do aluno.
Liberar os módulos incluídos no pacote.
Manter bloqueados os módulos não contratados.
Mostrar uma confirmação visual ao coach.
Mostrar ao aluno que o protocolo está pronto.
Apresentar treino, nutrição ou ambos conforme o pacote.
Preservar o questionário inicial como histórico.
Permitir que o aluno consulte as orientações iniciais.
Evitar que ele precise repetir informações já fornecidas.
Manter o acesso ao check-in semanal conforme as regras atuais do produto.
Garantir que a Home do aluno passe da experiência de onboarding para a experiência normal quando o protocolo estiver pronto.
FASE 5 — ECOSSISTEMA ADMINISTRATIVO EXCLUSIVO DO PROPRIETÁRIO
[ ] 21. CRIAR UM PAINEL ADMINISTRATIVO EXCLUSIVO DO TRACKLY
Criar uma área administrativa separada da navegação normal do coach e do aluno.
Reaproveitar os mecanismos atuais de autenticação.
Restringir o acesso ao proprietário autorizado.
Utilizar autorização verificada no servidor.
Se o projeto já possuir um modelo confiável de função administrativa, utilizá-lo.
Caso contrário, criar uma forma mínima e segura de identificar o proprietário, como uma lista de IDs autorizados em configuração de servidor.
Não permitir que um usuário se torne administrador alterando dados no navegador.
Não depender somente de esconder o menu.
Não expor chaves administrativas ou credenciais privilegiadas no frontend.
Organizar o painel com sua própria navegação.
Utilizar a mesma identidade visual do Trackly.
Manter o painel separado da experiência normal de coach e aluno.
Permitir voltar rapidamente ao contexto administrativo.
[ ] 22. CRIAR UMA VISÃO GERAL DO NEGÓCIO NO PAINEL ADMINISTRATIVO
Mostrar o número total de coaches.
Mostrar o número de alunos registrados.
Mostrar os coaches com assinatura ativa.
Mostrar assinaturas aguardando primeiro pagamento.
Mostrar assinaturas em atraso.
Mostrar assinaturas suspensas.
Mostrar assinaturas canceladas.
Mostrar o faturamento mensal recorrente previsto, quando houver preço confiável para calculá-lo.
Mostrar cobranças previstas para o período.
Mostrar pagamentos efetivamente confirmados, quando esses valores estiverem disponíveis nos registros.
Mostrar novos coaches e novos alunos.
Mostrar novos alunos aguardando questionário.
Mostrar protocolos em preparação.
Mostrar a distribuição de alunos entre Treino, Nutrição e Híbrido.
Mostrar atividades recentes.
Permitir acesso ao detalhe de cada indicador.
Utilizar gráficos e indicadores seguindo a referência visual anexada.
Separar receita recorrente prevista de valores efetivamente recebidos.
Não contar assinaturas suspensas ou canceladas como pagamentos confirmados.
Não inventar números quando faltarem dados.
Mostrar um estado vazio ou uma indicação de configuração pendente quando necessário.
[ ] 23. CONECTAR O PAINEL ADMINISTRATIVO À ASSINATURA EXISTENTE VIA SYNCPAY
Reutilizar a implementação existente de assinatura mensal do coach com o Trackly.
Reaproveitar a tabela coach_billing_subscriptions.
Reaproveitar os eventos registrados em coach_billing_events.
Utilizar os estados já existentes para apresentar a situação de cada assinatura.
Mostrar método de pagamento e próxima cobrança quando houver dados confiáveis.
Mostrar a quantidade de assinaturas por estado.
Mostrar os últimos eventos de cobrança.
Mostrar a data da última atualização disponível.
Calcular o valor recorrente previsto a partir da configuração real do preço do Trackly e das assinaturas elegíveis.
Se ainda não existir uma fonte confiável para o valor mensal do plano, criar uma configuração centralizada e explícita, sem inventar um preço.
Não calcular receitas recebidas apenas a partir da quantidade de assinaturas.
Utilizar eventos de pagamento confirmados para calcular os valores efetivamente recebidos quando houver informação suficiente.
Se os dados não permitirem determinar um valor real recebido, mostrar que a informação não está disponível.
Não duplicar as rotinas de cobrança ou criar um segundo fluxo SyncPay.
Não alterar a lógica existente de Pix Automático e cartão recorrente sem necessidade.
Não expor credenciais ou payloads sensíveis desnecessariamente.
[ ] 24. DIFERENCIAR A ASSINATURA DO COACH COM O TRACKLY DOS PACOTES DOS ALUNOS
Tratar a mensalidade do coach como receita do Trackly.
Tratar os pacotes de Treino, Nutrição e Híbrido como serviços oferecidos pelo coach aos alunos.
Não misturar os valores contratados pelos alunos com a mensalidade que o coach paga à plataforma.
Mostrar esses indicadores em áreas distintas.
Não utilizar os valores dos pacotes dos alunos para calcular o MRR do Trackly.
Não afirmar que o Trackly recebe pagamentos dos alunos quando essa integração não estiver implementada.
Manter clara a diferença entre preço contratado, valor previsto e pagamento confirmado.
Preservar a implementação atual de cobrança mensal do coach.
Não implementar um sistema de cobrança automática do coach para seus alunos nesta etapa, caso ele ainda não exista.
[ ] 25. REVISAR A CONSISTÊNCIA DO BLOQUEIO POR INADIMPLÊNCIA DO COACH
Preservar a lógica atual de suspensão de assinatura.
Preservar os dados dos coaches e dos alunos quando uma assinatura for suspensa.
Não apagar planos, histórico, check-ins ou fotos.
Garantir que as telas restritas continuem inacessíveis quando a assinatura estiver suspensa.
Verificar as ações executadas no servidor para garantir que restrições importantes não dependam apenas da navegação visual.
Reaproveitar os mecanismos de autorização já existentes.
Manter o portal do aluno acessível conforme a regra de negócio atual.
Garantir que a reativação preserve os dados e o fluxo de trabalho.
Não considerar uma assinatura ativa apenas porque a tela de pagamento foi aberta.
Refletir os estados reais registrados pelo sistema.
Não apresentar a integração com a SyncPay como validada em produção sem um teste real bem-sucedido.
FASE 6 — LABORATÓRIO DE DEMONSTRAÇÃO E TESTES
[ ] 26. REUNIR AS CONTAS DEMO DE COACH E ALUNO EM UM ÚNICO AMBIENTE
Aproveitar a conta demo de coach existente.
Aproveitar a conta demo de aluno existente.
Criar uma área denominada Laboratório de demonstração.
Permitir alternar rapidamente entre a experiência de coach e a de aluno.
Mostrar claramente qual perfil está sendo visualizado.
Manter uma ação evidente para retornar ao painel administrativo.
Evitar exigir logout e login manual para cada troca de visualização quando for possível utilizar uma visualização administrativa segura.
Garantir que a troca de contexto não exponha dados de usuários reais.
Garantir que as ações de teste afetem somente as contas e os dados de demonstração.
Não utilizar o Laboratório para contornar as permissões normais de usuários reais.
[ ] 27. CRIAR DOIS CENÁRIOS PARA CADA EXPERIÊNCIA DE DEMONSTRAÇÃO
Criar o cenário Demo preenchida.
Reaproveitar os dados fictícios existentes.
Incluir alunos demonstrativos.
Incluir históricos, check-ins, avaliações e orientações.
Incluir planos de treino e nutrição quando o pacote demonstrativo for Híbrido.
Incluir fotografias demonstrativas quando disponíveis.
Incluir dados financeiros claramente identificados como demonstração.
Criar o cenário Começar do zero.
No coach, apresentar uma conta sem alunos, sem avaliações e sem protocolos.
No aluno, apresentar uma conta nova, que começa pelo questionário inicial.
Permitir alternar entre os dois cenários.
Preservar os dados reais existentes.
Não apagar a demonstração preenchida para criar o cenário vazio.
Utilizar registros demonstrativos isolados.
Permitir voltar ao estado inicial do cenário vazio sem afetar outras contas.
Fazer ambos os cenários utilizarem a mesma aplicação e os mesmos componentes de interface.
[ ] 28. GARANTIR QUE O LABORATÓRIO NÃO EXECUTE AÇÕES REAIS INDESEJADAS
Diferenciar visualmente o modo de demonstração.
Mostrar um aviso de que o usuário está no Laboratório.
Garantir que os testes não alterem contas reais.
Evitar enviar e-mails reais para destinatários não controlados.
Não iniciar cobranças reais durante testes de demonstração.
Utilizar simulações para os fluxos que dependam de operações externas.
Manter o restante das funcionalidades demonstrativas utilizável.
Evitar que dados simulados sejam apresentados como registros financeiros reais no painel administrativo.
Garantir que ações de redefinição atinjam apenas os dados de demonstração.
Manter mecanismos de retorno ao painel administrativo.
FASE 7 — EXPERIÊNCIA DO ALUNO E CONTINUIDADE DO ACOMPANHAMENTO
[ ] 29. MANTER O CHECK-IN VISÍVEL E EVOLUIR SUA EXPERIÊNCIA
Manter o cartão de check-in visível durante toda a semana.
Antes da abertura, apresentá-lo como bloqueado até a data apropriada.
Durante a janela de sexta-feira a domingo, destacar a ação principal.
Após o envio, mostrar o estado de aguardando avaliação.
Após a conclusão da avaliação, mostrar o acesso à avaliação semanal.
Preservar a obrigatoriedade do peso e das quatro fotos.
Preservar as perguntas ampliadas do acompanhamento.
Manter as perguntas condicionais.
Preservar os registros anteriores.
Manter a contagem e a identificação das fotos.
Melhorar a apresentação visual das etapas.
Evitar que o check-in pareça apenas um formulário.
Garantir que o fluxo continue responsivo.
[ ] 30. APRIMORAR A NUTRIÇÃO DO ALUNO
Manter o resumo nutricional diário.
Mostrar as calorias por refeição.
Mostrar as calorias por alimento quando disponíveis.
Mostrar o total diário coerente com os dados nutricionais.
Manter os macros acessíveis sem excesso de informações.
Reutilizar a lógica de horários existente.
Fazer a indicação da próxima refeição atualizar-se com o relógio.
Mostrar estados como Em 40 min, Em 20 min, Em 10 min e Agora conforme o horário.
Evitar consultas desnecessárias ao backend para atualizar a contagem.
Manter o registro alimentar detalhado como possibilidade complementar.
Priorizar a consulta ao plano alimentar.
Não inventar dados nutricionais ausentes.
[ ] 31. APRIMORAR A EXECUÇÃO DO TREINO DO ALUNO
Preservar o modo de execução focado em um exercício por vez.
Melhorar o destaque do exercício atual.
Melhorar o progresso da sessão.
Preservar os registros de séries, cargas e repetições.
Corrigir a pausa e a retomada do cronômetro.
Permitir acrescentar 30 segundos ao descanso.
Garantir que o cronômetro não desapareça após ser pausado.
Garantir que o cardio prescrito pelo coach apareça junto ao treino.
Melhorar a transição entre exercícios.
Criar feedbacks visuais discretos ao concluir séries e exercícios.
Manter a navegação simples durante a sessão.
Evitar aumentar o número de passos necessários para finalizar um treino.
[ ] 32. REORGANIZAR A ÁREA PROGRESSO DO ALUNO
Dar prioridade máxima à comparação de fotos.
Melhorar a seleção de semanas.
Melhorar a visualização das quatro posições nas novas fotos.
Manter compatibilidade com o histórico fotográfico anterior.
Colocar métricas e gráficos depois da comparação visual.
Reunir o histórico em uma linha do tempo.
Associar cada avaliação e orientação à semana correta.
Melhorar a síntese visual da evolução.
Não inventar resultados.
Manter resumos baseados em dados estruturados.
Preparar o componente de resumo para uma integração real com IA, quando estiver disponível.
Evitar uma página excessivamente longa ou repetitiva.
[ ] 33. UNIFICAR A EXPERIÊNCIA DE AVALIAÇÃO, ORIENTAÇÃO E PROGRESSO
Permitir que o aluno acesse a avaliação semanal recebida.
Mostrar o que mudou no treino.
Mostrar o que mudou na nutrição.
Mostrar o que mudou no cardio.
Mostrar o texto escrito pelo coach.
Manter o registro da avaliação no histórico.
Permitir consultar semanas anteriores.
Garantir que os dados da avaliação sejam coerentes com os planos publicados naquele período.
Evitar que o aluno precise procurar a mesma orientação em vários lugares.
Manter o check-in como início do ciclo e a avaliação como conclusão da resposta do coach.
Criar uma navegação natural entre o plano atual e o histórico das mudanças.
FASE 8 — SEGURANÇA, CONSISTÊNCIA E QUALIDADE FINAL
[ ] 34. GARANTIR PROTEÇÃO DOS DADOS E SEPARAÇÃO DOS CONTEXTOS
Preservar as regras de acesso atuais do Supabase.
Garantir que o coach acesse somente seus próprios alunos.
Garantir que o aluno acesse somente seus próprios dados.
Restringir o painel administrativo ao proprietário autorizado.
Garantir que verificações importantes ocorram no servidor.
Não expor dados sensíveis de questionários no dashboard geral.
Não expor notas privadas do coach.
Não enviar dados sensíveis desnecessários para a IA.
Não expor credenciais administrativas no navegador.
Garantir que o Laboratório de demonstração seja isolado dos dados reais.
Preservar fotos e históricos.
Evitar migrações destrutivas.
[ ] 35. GARANTIR COERÊNCIA ENTRE OS DADOS E A INTERFACE
Não mostrar protocolo concluído quando ele ainda está em rascunho.
Não mostrar convite enviado se o envio falhou.
Não mostrar pagamento confirmado sem confirmação registrada.
Não mostrar assinatura ativa sem um estado válido.
Não contar valores demonstrativos como receita real.
Não liberar funcionalidades que não façam parte do pacote contratado.
Não bloquear módulos que já tenham sido contratados e publicados.
Não confundir falta de dados com valores zerados.
Garantir que a troca de cenário no Laboratório não altere informações reais.
Garantir que o painel administrativo reflita os estados efetivamente registrados.
[ ] 36. VALIDAR TODAS AS JORNADAS PRINCIPAIS
Testar a criação de um novo aluno pelo coach.
Testar o envio e a aceitação do convite.
Testar o cadastro e a confirmação de conta.
Testar o preenchimento do questionário inicial.
Testar os três pacotes: Treino, Nutrição e Híbrido.
Testar a preparação e publicação de cada tipo de protocolo.
Testar o bloqueio dos módulos não contratados.
Testar a liberação dos módulos contratados.
Testar a avaliação semanal.
Testar a detecção das mudanças de treino, nutrição e cardio.
Testar a visualização do histórico pelo aluno.
Testar o painel administrativo.
Testar os indicadores de assinatura.
Testar a alternância entre coach demo e aluno demo.
Testar o cenário preenchido.
Testar o cenário vazio.
Garantir que nenhuma ação de demonstração afete usuários reais.
[ ] 37. REVISAR O DESIGN E A RESPONSIVIDADE DO PRODUTO INTEIRO
Aplicar a identidade visual geral revisada.
Manter o Financeiro especialmente próximo da composição da referência Vega.
Evitar aplicar exatamente a mesma composição em todas as páginas.
Garantir personalidade visual para cada área.
Rever o tamanho dos ícones.
Rever tipografia.
Rever espaçamento.
Rever contraste.
Rever animações.
Testar desktop.
Testar notebook.
Testar tablet.
Testar dispositivos móveis de 375 px, 390 px e 430 px.
Corrigir elementos sobrepostos.
Garantir que a navegação inferior não encubra conteúdo.
Respeitar o suporte a movimentos reduzidos.
Manter clareza e rapidez de uso.
[ ] 38. CONCLUIR A REVISÃO TÉCNICA FINAL
Executar o lint do projeto.
Executar o build de produção.
Executar os testes existentes das áreas alteradas.
Corrigir os erros introduzidos.
Preservar os testes existentes.
Não desativar testes apenas para obter um build bem-sucedido.
Verificar as migrações incrementais.
Verificar a preservação dos históricos.
Confirmar que a cobrança SyncPay existente continua funcionando dentro do que já foi testado.
Distinguir testes simulados de testes realizados contra o provedor real.
Registrar configurações externas que ainda estiverem pendentes.
Não declarar pronta uma integração que ainda não foi testada no ambiente real.
Marcar [x] somente as tarefas efetivamente verificadas.
Registrar claramente todas as pendências.
ORDEM RECOMENDADA DE EXECUÇÃO

A outra IA deve trabalhar na seguinte ordem:

Fase 1 — Identidade visual: tarefas 1 a 6.

Fase 2 — Convite e onboarding: tarefas 7 a 12.

Fase 3 — Pacotes e preparação do protocolo: tarefas 13 a 20.

Fase 4 — Painel administrativo e laboratório: tarefas 21 a 28.

Fase 5 — Refinamento da jornada do aluno: tarefas 29 a 33.

Fase 6 — Segurança, testes e validação final: tarefas 34 a 38.

A ordem pode ser ajustada quando houver dependências técnicas reais, mas a IA não deve abandonar uma tarefa pela metade e começar aleatoriamente uma nova funcionalidade.

RESULTADO FINAL ESPERADO

Ao concluir esta etapa, o Trackly deverá apresentar:

Uma identidade visual mais viva, dinâmica e premium, guiada pela imagem de referência da Vega.

Um Financeiro com uma organização visual muito próxima da referência, usando indicadores, gráficos, filtros e cores fortes, mas com os dados e a identidade do Trackly.

Um fluxo simplificado de criação de alunos, no qual o coach informa os dados essenciais, escolhe o pacote e envia o convite.

Um questionário inicial preenchido pelo próprio aluno, adaptado ao pacote contratado.

Uma experiência clara de preparação do protocolo, com prazo de até três dias e apresentação organizada dos dados recebidos.

Uma separação correta entre os pacotes Treino, Nutrição e Híbrido, com bloqueio visual dos módulos não contratados e liberação dos módulos efetivamente publicados.

Um painel administrativo exclusivo do proprietário, com indicadores do negócio e informações de assinatura baseadas nos dados reais disponíveis.

Um Laboratório de demonstração que permita alternar rapidamente entre coach e aluno, tanto em cenários completos quanto em contas vazias.

Uma jornada mais conectada entre check-in, avaliação, orientação, treino, nutrição e evolução.

O objetivo não é simplesmente ampliar o Trackly. É criar um produto que pareça integrado, profissional e agradável de usar, e que permita ao coach trabalhar melhor enquanto o aluno entende claramente o que precisa fazer e como está evoluindo.

