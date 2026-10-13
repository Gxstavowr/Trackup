TODO

PARTE 1 — MINHA AVALIAÇÃO INDEPENDENTE
1. O problema mais importante do check-in é funcional, não visual

Na implementação atual, o check-in possui três posições de foto:

Frente.
Lado.
Costas.

O próprio formulário identifica as fotos como opcionais e mostra a contagem de três imagens.

Além disso, a função que envia o check-in valida as respostas obrigatórias, mas não verifica se todas as fotos foram enviadas.

Isso significa que não basta alterar o texto para “obrigatório” ou adicionar um asterisco. Precisamos corrigir a validação de ponta a ponta.

A regra final deve ser:

Peso obrigatório + quatro fotos obrigatórias.

As posições serão:

Frente.
Lateral esquerda.
Lateral direita.
Costas.

O aluno não pode concluir o check-in enquanto faltar o peso ou qualquer uma das quatro fotos.

O aplicativo deve indicar quais campos faltam, direcionar o aluno para eles e preservar tudo o que já foi preenchido.

Existe uma particularidade técnica importante

O banco atual aceita apenas os ângulos front, back e side. O código de armazenamento, os caminhos dos arquivos e os componentes de comparação também trabalham com esses três valores.

Portanto, a nova exigência precisa de uma pequena migração incremental e compatível com os dados anteriores.

Não precisamos reconstruir o backend. Precisamos apenas ampliar a estrutura existente para suportar os dois novos ângulos.

As fotos antigas devem continuar acessíveis. Uma foto antiga identificada genericamente como lateral não pode ser tratada automaticamente como esquerda ou direita, porque o sistema não possui essa informação.

2. O check-in continua fazendo poucas perguntas para uma avaliação realmente útil

No cadastro de novos coaches, o template padrão começa com apenas quatro perguntas: peso, aderência, energia e observações.

O formulário atual também trata essencialmente as respostas como escalas, números ou textos. Outros tipos de pergunta existentes no modelo não são apresentados com controles próprios em todos os casos.

Minha avaliação é que isso limita o valor do acompanhamento semanal.

O Trackly precisa conseguir registrar informações suficientes para que o coach compreenda não apenas o resultado do aluno, mas também o contexto da semana.

Isso não significa transformar o check-in em uma entrevista enorme.

Eu organizaria as perguntas em quatro etapas, mantendo o sistema de cartões e opções visuais que já existe.

Peso e fotos: medidas corporais e quatro imagens obrigatórias.

Alimentação: aderência, água e informações nutricionais relevantes.

Treino: desempenho, cardio, frequência e duração.

Bem-estar: sono, digestão, emocional e perguntas condicionais sobre ciclo menstrual e uso de determinadas substâncias.

Algumas respostas devem ser estruturadas. Por exemplo, em vez de exigir um parágrafo para explicar o cardio, o aluno poderia selecionar a modalidade e informar dias por semana e duração média.

Isso facilita o preenchimento e produz informações mais fáceis de consultar posteriormente.

Um cuidado adicional

As perguntas relacionadas a hormônios, estimulantes, peptídeos e exames devem aparecer apenas no contexto apropriado do check-in e da avaliação. Essas informações não devem ser expostas nos painéis gerais do coach ou em notificações resumidas.

O produto deve registrar o que foi informado, sem transformar isso em diagnóstico ou presumir consequências médicas.

3. A avaliação do coach ainda é a tela que mais precisa de simplificação

Examinei a captura da avaliação de Marina.

Ela mostra, em sequência:

Resumo da semana.
Peso, aderência, energia e metas.
Sinais da semana.
Comparação fotográfica.
Comparação entre métricas.
Respostas do check-in.
Últimas semanas.
Campo para decisão e orientação do coach.

O problema não é que esses recursos sejam desnecessários.

O problema é que vários deles repetem informações, enquanto a separação entre os dados da semana atual e os históricos não é suficientemente evidente.

Por exemplo, o peso aparece no resumo, depois nos sinais e novamente no comparativo. As respostas do check-in aparecem mais abaixo, separadas das informações utilizadas para formar a avaliação.

Isso aumenta a quantidade de leitura e dificulta entender o que o aluno acabou de enviar.

Minha proposta

A tela deve ter quatro áreas claramente diferenciadas.

A. Recebido nesta semana

Tudo o que o aluno enviou no check-in atual, com data e horário de envio.

Peso atual, respostas, fotos e métricas atuais.

B. Comparação com outra semana

Uma área própria para comparar o período atual com o período escolhido.

As duas semanas devem estar identificadas por número e datas. As variações precisam corresponder exatamente aos períodos selecionados.

C. Contexto histórico

Informações das semanas anteriores, tendências e outros registros.

Essa área pode começar compacta e ser expandida quando o coach quiser investigar algum detalhe.

D. Decisão do coach

Uma área evidente para registrar a observação, preparar a orientação e finalizar a avaliação.

O coach não deveria precisar atravessar toda a página para encontrar o local onde conclui seu trabalho.

O objetivo é que ele compreenda a semana atual rapidamente e só precise consultar os detalhes históricos quando isso contribuir para a decisão.

4. Acompanhamento e Avaliações realmente estão próximos demais

Na captura do Acompanhamento, o sistema já apresenta uma fila de trabalho dividida em alunos que precisam de avaliação, alunos aguardando check-in e ciclos concluídos.

Na página Avaliações, encontramos praticamente a mesma fila, com os mesmos alunos e ações, acrescida de filtros.

Isso não é necessariamente errado, mas hoje as páginas têm pouca diferenciação.

Eu não as fundiria automaticamente, porque acredito que podem exercer funções diferentes.

Acompanhamento deveria responder:

Como está minha operação nesta semana?

Mostrar progresso geral, pendências mais importantes, situações que merecem atenção e algumas ações prioritárias.

Avaliações deveria responder:

Quais avaliações preciso realizar e em que estado estão?

Mostrar a fila completa, com filtros, estados e acesso direto à avaliação.

A melhoria é eliminar a repetição desnecessária da fila completa no Acompanhamento e deixar as Avaliações como o espaço operacional dedicado.

Se, depois da reformulação, as duas páginas continuarem desempenhando exatamente a mesma função, então vale considerar uma fusão.

5. A tela de Alunos apresenta um problema real de layout

Na captura desktop, algumas ações ultrapassam os limites dos próprios botões. Isso ocorre, por exemplo, com os textos de copiar o link do convite e visualizar o acompanhamento.

Esse problema não deve ser resolvido somente diminuindo o tamanho da fonte.

As linhas dos alunos reúnem nome, e-mail, idade, situação do acompanhamento, atualização, situação financeira, descrição da próxima ação e botões.

O conjunto fica apertado.

Eu faria a ação principal ganhar destaque e colocaria ações secundárias em um menu compacto.

No desktop, a lista pode continuar organizada por colunas. No celular, deve funcionar como uma sequência de cartões.

Os estados de acompanhamento e financeiro devem permanecer separados.

A meta é que o coach consiga identificar rapidamente quem é o aluno, qual é sua situação e qual ação precisa realizar.

6. O Home do aluno tem uma boa base, mas a navegação está prejudicando a experiência

O destaque amarelo do check-in é uma boa decisão. Eu o manteria quando o check-in estiver disponível.

Também manteria o acesso ao treino, à nutrição e à orientação do coach a partir da página inicial.

O problema está na hierarquia do restante da tela.

As capturas mostram que o conteúdo de “Também hoje”, os cartões de treino e outras informações podem ficar parcialmente encobertos pela navegação inferior fixa.

Esse comportamento aparece também nas telas de Nutrição, Progresso e Conta.

A barra inferior não pode cobrir conteúdo nem botões.

Todas as páginas do portal precisam reservar espaço suficiente para a navegação, incluindo a área segura do dispositivo.

Depois disso, eu reorganizaria o Home para mostrar três prioridades:

Ação importante do momento, principalmente o check-in quando aberto.
Agenda do dia, incluindo o próximo treino e a próxima refeição.
Mensagem do coach e progresso resumido.

Isso deixa o início mais útil sem transformá-lo em uma coleção de cartões.

7. A indicação da próxima refeição precisa reagir ao relógio

O código já utiliza o fuso de America/Sao_Paulo para determinar o horário e identificar refeições próximas.

A questão é que a indicação é calculada quando a página é renderizada. Os rótulos não se atualizam continuamente se o aluno deixar a tela aberta.

Minha proposta é usar um pequeno componente de relógio no cliente, compartilhado pelo Home e pela Nutrição.

Ele deve mostrar informações como:

Próxima refeição · Jantar · 19:30

Em 40 min

Em 20 min

Em 10 min

Agora

A indicação deve avançar com o relógio real, sem exigir que o usuário atualize a página.

Depois que o horário chegar, o sistema deve atualizar o estado da refeição e, quando apropriado, passar a destacar a próxima.

Não precisamos de uma API externa de horário: a aplicação já possui a lógica de fuso horário necessária.

8. A Nutrição do aluno tem bons componentes, mas ainda não exibe as informações na ordem mais útil

A tela atual já apresenta o resumo do dia, calorias por refeição, macros e controles de registro.

Isso é positivo.

Entretanto, nas listas de alimentos, a informação mais evidente é a quantidade e o nome do alimento. As calorias individuais ficam escondidas nos detalhes expansíveis.

Para um aluno que utiliza a dieta principalmente para consultar o que precisa comer, isso é menos prático do que deveria.

Eu organizaria assim

Resumo do dia: calorias previstas, consumidas ou registradas, quando aplicável, e progresso das metas configuradas.

Refeição: nome, horário e total de calorias.

Alimentos: quantidade, nome e calorias individuais quando disponíveis.

Detalhes: macros completos, substituições e outras informações que não precisam ocupar a tela o tempo todo.

Não exibiria proteínas, carboidratos, gorduras, calorias, observações e substituições de maneira expandida para todos os alimentos simultaneamente. Isso recriaria o problema de excesso de informações que estamos tentando resolver.

Quando algum dado nutricional não estiver disponível, a interface deve informar isso sem inventar valores ou apresentar zeros que possam ser interpretados como dados reais.

9. Progresso é a área do aluno que mais precisa de reorganização

A captura atual começa com um cartão de resumo automático que informa que ainda não há registros suficientes.

Depois aparecem as métricas, os períodos e o gráfico de peso.

As fotos ficam muito mais abaixo.

Para um produto de acompanhamento físico, essa hierarquia não é a que eu escolheria.

A comparação visual das semanas deve aparecer primeiro.

Minha ordem seria:

Comparação das fotos.
Métricas e gráficos de evolução.
Histórico semanal e orientações anteriores.
Resumo das mudanças observadas.

Se houver apenas uma semana com fotos, a seção de comparação deve continuar no topo, mostrando as fotos atuais e explicando que uma comparação entre semanas ficará disponível quando existir outro registro.

Também encontrei uma inconsistência na demonstração: a seção indica a semana 3, enquanto os espaços de foto trazem identificações de demonstração da semana 10.

Os dados apresentados como exemplo precisam pertencer a períodos coerentes. Esse tipo de detalhe compromete a confiança no produto, mesmo quando a estrutura visual está bem construída.

Sobre o resumo automático

Considero interessante manter essa funcionalidade.

Mas precisamos distinguir um resumo produzido por regras dos registros de um resumo efetivamente gerado por IA.

Na etapa atual, é possível melhorar a apresentação do resumo existente sem inventar inteligência artificial ou resultados. A experiência pode evoluir posteriormente conforme os recursos já disponíveis no projeto.

10. O problema do cronômetro de treino está confirmado no código

Encontrei a causa provável do comportamento que você relatou.

Quando o treino é pausado, a implementação chama setRest(null). Isso descarta o estado do descanso.

Além disso, o cronômetro é exibido apenas quando há descanso ativo e o treino não está pausado.

Portanto, ele pode desaparecer sem que o aluno tenha uma forma clara de recuperar o tempo restante.

O ajuste deve ser feito na gestão do estado do cronômetro, não somente na aparência.

A nova experiência deve:

Preservar o tempo restante ao pausar o descanso.
Permitir pausar e retomar o próprio cronômetro.
Preservar o cronômetro quando o treino inteiro é pausado.
Restaurar o descanso corretamente ao retomar a sessão.
Manter a opção de pular o descanso.
Trocar o acréscimo de 15 para 30 segundos.

Ao retomar, o relógio deve continuar do ponto em que parou, e não reiniciar todo o intervalo.

11. Minha avaliação da página Minha Conta

Eu não transformaria essa página em um grande dashboard.

A função dela é permitir consultar informações pessoais, plano, assinatura, notificações, preferências, privacidade e ações da conta.

Essa simplicidade é apropriada.

O problema atual é que a página é longa e algumas opções aparecem como “Em breve”. Isso faz com que existam áreas com aparência de funcionalidade, mas que não levam a uma ação real.

Eu manteria o caráter utilitário e melhoraria a hierarquia:

Perfil e dados pessoais.
Meu plano e situação da assinatura.
Notificações.
Preferências realmente disponíveis.
Privacidade e dados.
Sair da conta.

As opções que ainda não possuem comportamento implementado não devem parecer botões plenamente funcionais. Devem ser removidas da interface ativa ou apresentadas de maneira explicitamente informativa.

A área não precisa ser excessivamente animada ou cartoonizada. Deve ser bonita, clara e confiável.

12. Treino e Nutrição do coach não precisam ser reconstruídos

Aqui minha avaliação é mais conservadora.

O projeto já possui biblioteca de exercícios, templates, configuração de séries e repetições, cargas, RIR, descansos, aquecimento, cardio, supersets, circuitos e substituições.

A parte de nutrição também possui biblioteca de alimentos, refeições, equivalências, templates e cálculo de macros.

São estruturas que merecem ser preservadas.

Eu faria melhorias pontuais de hierarquia, alinhamento, legibilidade e consistência.

O principal cuidado é garantir que os recursos configurados pelo coach sejam apresentados corretamente na pré-visualização e na experiência do aluno.

Não adianta adicionar mais opções ao editor se o aluno não consegue enxergar ou utilizar o que foi configurado.

13. Os ícones da barra lateral podem melhorar, mas são uma prioridade secundária

Os ícones atuais cumprem sua função.

É válido aumentar um pouco o tamanho e ajustar o alinhamento e o espaçamento para ocupar melhor a área da navegação.

Mas eu não aumentaria os ícones indiscriminadamente para preencher espaço.

O ganho principal deve vir de uma navegação mais consistente, com boa proporção entre ícone, texto, área clicável e espaçamento.

Esse ajuste faz sentido como parte do refinamento visual geral, não como uma grande tarefa isolada.

PARTE 2 — PROMPT CONSOLIDADO PARA A OUTRA IA

A seguir está o prompt que eu enviaria para desenvolver esta próxima etapa.

Ele incorpora suas observações e minhas conclusões, priorizando as questões mais importantes sem reconstruir partes que já estão funcionando.

Importante: o backend e o banco do Trackly já estão configurados ou em fase final. O prompt não pede que sejam reconstruídos. A única alteração de banco prevista é uma migração incremental e compatível com os dados existentes, necessária para suportar as quatro posições de fotos e sua validação. Não trocar a arquitetura nem reconfigurar o Supabase.

TRACKLY V3 — MASTER TODO
CONTEXTO

O Trackly é uma plataforma de acompanhamento para coaches de fitness e seus alunos.

O projeto atual já possui uma base desenvolvida em Next.js, React e Supabase, incluindo Acompanhamento, Avaliações, Alunos, Treinos, Nutrição, Evolução, Financeiro, configurações e portal do aluno.

A versão atual é a base oficial para a próxima etapa.

O objetivo é melhorar a experiência de uso, corrigir problemas funcionais, simplificar telas excessivamente densas e tornar o acompanhamento semanal mais completo.

Não reconstruir o Trackly do zero. Preservar o que já funciona e desenvolver incrementalmente sobre a base existente.

Regras obrigatórias
Preservar a arquitetura atual e as integrações existentes.
Não reconfigurar nem reconstruir o backend de maneira geral.
Não substituir o Supabase por outra tecnologia.
Não alterar funcionalidades que já estão boas sem uma justificativa concreta.
Fazer somente as mudanças de dados estritamente necessárias para atender aos novos requisitos.
Preservar o histórico e os registros anteriores.
Manter a identidade visual atual, baseada em preto profundo, grafite, branco quente e amarelo vivo.
Evitar voltar a um visual apagado ou excessivamente textual.
Não adicionar funcionalidades sem uma necessidade clara.
Marcar [x] somente quando cada tarefa estiver implementada e verificada.
Se uma tarefa não puder ser concluída, mantê-la como [ ] e descrever o que falta.
[x] 1. AUDITAR A VERSÃO ATUAL ANTES DE IMPLEMENTAR
Revisar a estrutura existente.
Identificar os componentes e fluxos envolvidos nas mudanças.
Preservar as funcionalidades já implementadas.
Identificar os pontos de integração entre formulário, dados, armazenamento e interface.
Confirmar quais problemas são funcionais e quais são apenas visuais.
Evitar duplicar componentes ou regras já existentes.
Fazer as alterações incrementalmente.
Registrar as dependências entre tarefas antes de modificar os arquivos.
[x] 2. TORNAR O PESO E AS QUATRO FOTOS OBRIGATÓRIOS NO CHECK-IN
Tornar o peso uma informação obrigatória em todos os check-ins.
Impedir que a configuração de uma pergunta do sistema transforme o peso em opcional.
Substituir as três posições atuais por quatro posições para os novos check-ins.
Utilizar Frente, Lateral esquerda, Lateral direita e Costas.
Exibir claramente que as quatro fotos são obrigatórias.
Mostrar a contagem correta de fotos enviadas, como 0 de 4.
Mostrar o estado individual de cada posição.
Manter miniaturas das fotos já enviadas.
Permitir substituir uma foto antes de enviar o check-in.
Preservar o comportamento de tentativa novamente quando um upload falhar.
Impedir o envio final enquanto faltar peso ou qualquer uma das quatro fotos.
Direcionar o aluno para o campo obrigatório que estiver faltando.
Preservar todas as respostas e fotos já preenchidas quando houver erro de validação.
Não aceitar um check-in incompleto apenas porque o usuário contornou a validação visual.
[x] 3. ATUALIZAR A ESTRUTURA DAS FOTOS SEM PERDER O HISTÓRICO
Examinar a estrutura atual de armazenamento e os tipos utilizados para os ângulos das fotos.
Criar apenas a migração incremental necessária para aceitar os dois novos ângulos.
Atualizar as validações existentes para suportar Frente, Lateral esquerda, Lateral direita e Costas.
Atualizar a validação dos caminhos dos arquivos.
Atualizar os componentes de upload.
Atualizar a comparação de fotos.
Atualizar os componentes de evolução do aluno.
Atualizar a avaliação do coach.
Manter os registros antigos que utilizam o ângulo genérico side.
Não apagar nem reescrever registros anteriores.
Não classificar automaticamente as fotos antigas como lado esquerdo ou direito.
Apresentar as fotos antigas como laterais de registros anteriores, sem inventar a posição exata.
Garantir que os registros antigos continuem acessíveis após a migração.
Não recriar o banco nem alterar a arquitetura geral do backend.
[x] 4. AMPLIAR AS PERGUNTAS DO CHECK-IN PADRÃO
Preservar as perguntas existentes que continuam fazendo sentido.
Manter o sistema de cartões e opções visuais utilizado atualmente.
Acrescentar perguntas estruturadas para coletar as informações necessárias à avaliação semanal.
Permitir registrar modalidade do cardio.
Permitir registrar quantidade de dias de cardio por semana.
Permitir registrar a duração média de cada sessão.
Permitir avaliar o desempenho nos treinos em relação ao habitual.
Permitir registrar se as cargas ou a performance melhoraram, permaneceram estáveis ou pioraram.
Permitir adicionar observação complementar sobre o desempenho.
Permitir registrar a quantidade média de água consumida por dia.
Permitir registrar as horas médias de sono por noite.
Permitir registrar informações sobre a qualidade do sono, quando aplicável.
Permitir informar a frequência de evacuação.
Permitir informar a presença ou ausência de inchaço abdominal ou desconforto digestivo.
Permitir registrar como o aluno se sentiu emocionalmente durante a semana.
Manter as perguntas objetivas, utilizando opções estruturadas sempre que possível.
Não transformar todo o check-in em campos de texto livre.
Não copiar literalmente as perguntas originais utilizadas como referência.
Manter um estilo natural, direto e fácil de responder.
Organizar as perguntas em Peso e fotos, Alimentação, Treino e Bem-estar.
Evitar que a expansão torne a experiência visualmente pesada.
[x] 5. IMPLEMENTAR PERGUNTAS CONDICIONAIS E TRATAR DADOS SENSÍVEIS COM CUIDADO
Apresentar a pergunta sobre ciclo menstrual apenas quando for aplicável ao aluno.
Não exibir essa pergunta para alunos identificados como homens.
Quando a informação do perfil não for suficiente para determinar a aplicabilidade, utilizar uma configuração explícita ou opção de não aplicabilidade.
Evitar pressuposições com base apenas no nome do aluno.
Incluir uma pergunta inicial para identificar se o aluno utiliza hormônios, estimulantes ou peptídeos.
Exibir os campos complementares somente quando forem pertinentes.
Permitir registrar tipo, dose e efeitos percebidos, quando aplicável.
Perguntar a data do último exame de sangue enviado apenas para usuários de hormônios, conforme a regra definida para o acompanhamento.
Não exigir que alunos que não utilizam essas substâncias preencham campos relacionados.
Não exibir essas respostas nos dashboards gerais.
Não expor essas informações em notificações resumidas.
Limitar sua apresentação ao contexto do próprio check-in e da avaliação autorizada.
Não produzir diagnósticos nem conclusões médicas automáticas.
Preservar as respostas antigas quando as perguntas forem ampliadas.
Garantir que as perguntas condicionais sejam corretamente exibidas e validadas.
[x] 6. GARANTIR QUE O FORMULÁRIO E A VALIDAÇÃO ACEITEM OS NOVOS TIPOS DE RESPOSTA
Revisar os tipos de resposta suportados pelo banco e pelo formulário.
Criar controles visuais próprios para escolhas, respostas booleanas, números e escalas.
Não apresentar campos de seleção como textareas genéricas.
Criar opções de resposta adequadas a cada pergunta.
Utilizar unidades explícitas para litros, horas, minutos e outras medidas.
Validar números.
Validar perguntas obrigatórias.
Validar respostas condicionais.
Garantir que os valores sejam preservados no rascunho.
Garantir que a revisão final apresente todas as respostas corretamente.
Garantir que o coach consiga consultar cada resposta após o envio.
Atualizar os templates padrão das contas existentes de maneira idempotente, adicionando somente as perguntas que estiverem faltando.
Garantir que novos templates padrão já incluam as perguntas.
Não duplicar perguntas em execuções repetidas.
Não sobrescrever os templates personalizados dos coaches.
Não modificar respostas de check-ins históricos já enviados.
[x] 7. REFINAR A EXPERIÊNCIA DE PREENCHIMENTO DO CHECK-IN
Manter o fluxo guiado por etapas.
Manter o indicador de progresso.
Manter os controles visuais atuais que facilitam a resposta.
Tornar o preenchimento mais fluido.
Mostrar os erros próximos aos campos correspondentes.
Evitar que o formulário avance quando houver campos obrigatórios inválidos.
Garantir que o envio não aconteça enquanto as fotos estiverem sendo processadas.
Garantir que as quatro fotos estejam salvas antes da conclusão.
Mostrar um resumo de revisão coerente com as quatro fotos.
Ajustar os textos de ajuda.
Evitar textos longos desnecessários.
Garantir que a barra fixa de ações não cubra perguntas ou mensagens de erro.
Testar retomada de rascunho e reenvio após falhas.
[x] 8. REORGANIZAR O HOME DO ALUNO SEM PERDER O DESTAQUE DO CHECK-IN
Preservar o cartão amarelo de check-in quando ele estiver disponível.
Manter esse cartão como uma das ações mais importantes da semana.
Melhorar a hierarquia visual do restante da tela.
Aumentar a clareza dos cartões de treino e nutrição.
Mostrar a próxima refeição com horário e estado.
Mostrar o treino relevante para o dia.
Organizar as informações em uma agenda diária clara.
Manter a mensagem do coach acessível.
Manter o progresso resumido.
Evitar excesso de cartões concorrentes.
Evitar textos e números pequenos demais.
Mostrar uma ação principal em cada bloco relevante.
Garantir que a página seja prática em uso diário no celular.
[x] 9. CORRIGIR A SOBREPOSIÇÃO DA NAVEGAÇÃO INFERIOR DO ALUNO
Revisar a navegação inferior fixa.
Garantir que todo o conteúdo das páginas tenha espaço suficiente para não ficar escondido atrás dela.
Considerar a altura real da barra e a área segura do dispositivo.
Corrigir o Home.
Corrigir Check-in.
Corrigir Treino.
Corrigir Nutrição.
Corrigir Progresso.
Corrigir Conta.
Corrigir drawers, modais e formulários com ações fixas.
Garantir que o último cartão e o último botão de cada página possam ser vistos e utilizados.
Testar em telas de 375 px, 390 px e 430 px.
Não resolver o problema simplesmente escondendo informações.
[x] 10. IMPLEMENTAR O RELÓGIO E A CONTAGEM REGRESSIVA DAS REFEIÇÕES
Utilizar os horários já definidos no plano nutricional.
Preservar o fuso horário utilizado atualmente pelo aplicativo.
Fazer Home e Nutrição utilizarem a mesma lógica para identificar a refeição atual e a próxima.
Atualizar a indicação de horário sem exigir recarregamento da página.
Mostrar contagens regressivas como Em 40 min, Em 20 min e Em 10 min, conforme a proximidade.
Mostrar Agora quando a refeição chegar ao horário previsto.
Atualizar a contagem enquanto o aluno mantém a tela aberta.
Utilizar atualização periódica do relógio, sem criar uma consulta desnecessária ao backend a cada segundo.
Garantir que a mudança de horário atualize também a refeição destacada.
Após o horário previsto, mostrar um estado contextual e não punitivo quando a refeição ainda não tiver sido registrada.
Quando a refeição for marcada como realizada, atualizar a apresentação de acordo com o registro.
Respeitar os horários específicos de cada dia da semana.
Não inventar horários quando o plano não os possuir.
Quando a próxima refeição for no dia seguinte, indicar isso claramente.
[x] 11. MOSTRAR AS CALORIAS DE CADA ALIMENTO, REFEIÇÃO E DIA
Manter o resumo nutricional diário.
Melhorar sua hierarquia visual.
Mostrar calorias previstas no plano.
Mostrar calorias consumidas ou registradas quando houver dados para isso.
Mostrar o total de calorias de cada refeição.
Mostrar as calorias de cada alimento diretamente na lista quando estiverem disponíveis.
Manter quantidade e nome do alimento claramente visíveis.
Não obrigar o aluno a abrir os detalhes de cada refeição apenas para descobrir suas calorias.
Manter macros completos e substituições acessíveis sob demanda.
Evitar exibir todos os macros de todos os alimentos simultaneamente.
Evitar excesso de informações.
Garantir que os totais correspondam aos valores nutricionais disponíveis.
Quando algum valor não estiver disponível, mostrar um estado apropriado em vez de inventar números.
Preservar o registro alimentar opcional existente.
[x] 12. REORDENAR E REFORMULAR A ÁREA PROGRESSO DO ALUNO
Colocar a comparação de fotos como primeiro conteúdo principal da página.
Mostrar as fotos da semana mais recente disponível.
Permitir escolher outra semana para comparação.
Permitir alternar entre Frente, Lateral esquerda, Lateral direita e Costas nas fotos novas.
Mostrar claramente os períodos comparados.
Utilizar comparação lado a lado ou slider quando apropriado.
Preservar a visualização dos registros antigos com posição lateral genérica.
Não misturar uma foto antiga com uma posição nova que não esteja comprovada.
Se existir somente uma semana com fotos, mostrar as imagens e explicar que uma comparação entre semanas estará disponível quando houver outro registro.
Não deixar um grande cartão de resumo indisponível ocupando o topo da página.
Manter um caminho claro para consultar métricas, gráficos e histórico.
Garantir que a primeira impressão da página seja visual, útil e relevante.
[ ] 13. MELHORAR MÉTRICAS, HISTÓRICO E RESUMO DE EVOLUÇÃO DO ALUNO
Manter os gráficos de evolução existentes.
Organizar as métricas depois da comparação de fotos.
Preservar os filtros de período.
Garantir que gráfico, resumo e indicadores correspondam ao período selecionado.
Mostrar o histórico semanal em uma linha do tempo.
Mostrar check-ins enviados.
Mostrar avaliações concluídas.
Mostrar orientações recebidas.
Mostrar metas e métricas disponíveis.
Criar uma síntese visual das mudanças observadas quando houver dados suficientes.
Evitar mensagens extensas.
Diferenciar um resumo baseado em regras de um resumo efetivamente produzido por IA.
Não simular que a IA foi executada quando isso não aconteceu.
Não inventar resultados, tendências ou diagnósticos.
Utilizar dados demonstrativos coerentes quando necessário.
Corrigir inconsistências entre os números das semanas e os rótulos das fotos.
[x] 14. CORRIGIR O CRONÔMETRO DE DESCANSO DO TREINO
Preservar o tempo restante quando o descanso for pausado.
Adicionar um controle claro de pausar e retomar o cronômetro.
Permitir retomar a contagem sem reiniciar o tempo total.
Quando o treino completo for pausado, preservar o estado do descanso.
Ao retomar o treino, restaurar o cronômetro quando houver um descanso em andamento.
Não eliminar silenciosamente o cronômetro ao pausar uma sessão.
Manter a ação de pular o descanso.
Substituir o botão +15 s por +30 s.
Atualizar o rótulo acessível do botão.
Garantir que o acréscimo de 30 segundos funcione durante a contagem.
Manter os registros de séries já concluídas.
Testar o fluxo: iniciar descanso, pausar, retomar, acrescentar 30 segundos, concluir e pausar o treino completo.
Garantir que o cronômetro não fique duplicado nem apresente dois estados simultâneos.
[x] 15. DIFERENCIAR ACOMPANHAMENTO DE AVALIAÇÕES
Manter Acompanhamento como visão geral da operação semanal.
Mostrar progresso geral.
Mostrar principais pendências.
Mostrar situações que merecem atenção.
Exibir apenas algumas ações prioritárias.
Criar acesso direto à fila completa.
Manter Avaliações como a área operacional dedicada.
Mostrar todos os alunos que possuem avaliações ou estados relacionados ao ciclo.
Manter filtros para avaliação pendente, aguardando aluno e concluídas.
Permitir abrir ou continuar cada avaliação.
Evitar repetir a fila completa nas duas telas.
Eliminar informações redundantes entre as páginas.
Manter os estados consistentes.
Se as duas telas continuarem desempenhando exatamente a mesma função depois da reformulação, avaliar a fusão delas em vez de duplicar interfaces.
[ ] 16. REFORMULAR A AVALIAÇÃO INDIVIDUAL DO COACH
Reduzir o excesso de informação simultânea.
Evitar repetir o mesmo peso, aderência e energia em várias seções.
Criar uma seção claramente identificada como Recebido nesta semana.
Mostrar a data e o horário do envio.
Mostrar o peso atual.
Mostrar as respostas do check-in atual.
Mostrar as quatro fotos, conforme a disponibilidade e o histórico.
Mostrar as métricas atuais de maneira compacta.
Criar uma área separada para Comparar com outra semana.
Identificar explicitamente a semana atual e a comparativa.
Mostrar diferenças calculadas a partir dos períodos selecionados.
Criar uma área compacta para o contexto histórico.
Permitir expandir as informações de semanas anteriores.
Diferenciar visualmente dados atuais de dados históricos.
Evitar colocar respostas antigas como se fossem respostas do check-in atual.
Manter a nota privada do coach.
Manter a orientação do aluno.
Destacar a ação para finalizar a avaliação.
Fazer o coach conseguir compreender a semana atual sem percorrer toda a página.
Garantir que a experiência funcione também no celular.
[x] 17. MELHORAR O ACESSO AO HISTÓRICO DA AVALIAÇÃO
Permitir consultar semanas anteriores a partir do histórico do aluno.
Identificar cada semana por número e período.
Mostrar os dados daquela semana, e não os dados da semana atual reaproveitados.
Permitir comparar a semana atual com uma semana anterior.
Diferenciar registros enviados, avaliações e orientações.
Manter registros históricos sem sobrescrevê-los.
Mostrar claramente quando uma semana não tiver fotos ou determinadas métricas.
Evitar preencher ausências com valores fictícios.
Manter os históricos acessíveis sem sobrecarregar a tela inicial da avaliação.
[x] 18. REFORMULAR A LISTA DE ALUNOS DO COACH
Corrigir os botões cujo texto ultrapassa os limites do componente.
Corrigir especificamente ações como Copiar link do convite e Ver acompanhamento.
Não resolver o problema apenas diminuindo a fonte até ficar difícil de ler.
Utilizar botões com largura adequada.
Utilizar rótulos curtos e claros quando necessário.
Manter uma ação principal por situação.
Colocar ações secundárias em um menu contextual quando apropriado.
Manter acompanhamento e financeiro visualmente separados.
Melhorar alinhamento e espaçamento.
Reduzir a quantidade de pequenos textos na mesma linha.
Manter informações complementares disponíveis sem dar o mesmo peso a tudo.
Utilizar uma apresentação adequada para desktop.
Transformar as linhas em cartões organizados no celular.
Garantir que nenhum texto ou botão seja cortado.
[x] 19. REFINAR A BARRA LATERAL DO COACH
Aumentar moderadamente o tamanho dos ícones.
Ajustar o alinhamento vertical dos ícones e textos.
Melhorar o espaçamento entre itens.
Manter o tamanho do texto confortável.
Padronizar as áreas clicáveis.
Manter o indicador da seção ativa.
Preservar a identidade visual atual.
Evitar aumentar os elementos indiscriminadamente para preencher espaço.
Garantir consistência visual entre todas as áreas.
[x] 20. PRESERVAR O SISTEMA DE TREINO DO COACH E REFINAR ONDE NECESSÁRIO
Preservar a estrutura atual de biblioteca de exercícios.
Preservar templates e programas.
Preservar a configuração de séries, repetições e cargas.
Preservar RIR, descanso e cadência.
Preservar aquecimento e cardio.
Preservar supersets, circuitos e substituições.
Corrigir somente problemas reais de clareza e usabilidade encontrados na revisão.
Melhorar alinhamento e hierarquia dos controles.
Evitar adicionar ferramentas desnecessárias.
Garantir que os parâmetros configurados apareçam corretamente na pré-visualização do aluno.
Garantir que o aluno consiga consultar e usar corretamente as configurações relevantes.
Não reconstruir essa área sem necessidade.
[x] 21. REFINAR O SISTEMA DE NUTRIÇÃO DO COACH
Preservar a biblioteca de alimentos.
Preservar as refeições, equivalências e templates.
Melhorar a leitura dos totais.
Melhorar a visualização de calorias e macros.
Melhorar a organização das refeições.
Manter a possibilidade de duplicar e reutilizar estruturas existentes.
Garantir que quantidades e valores nutricionais estejam coerentes.
Melhorar a pré-visualização como aluno.
Garantir que observações e substituições configuradas sejam apresentadas corretamente.
Não reconstruir o editor inteiro.
Evitar aumentar a complexidade sem resolver uma necessidade concreta.
[x] 22. REFINAR A PÁGINA MINHA CONTA DO ALUNO
Preservar as informações pessoais existentes.
Organizar melhor o perfil.
Manter a seção Meu Plano.
Destacar a situação da assinatura.
Melhorar a apresentação da próxima cobrança, quando aplicável.
Manter acesso a notificações.
Organizar preferências.
Manter privacidade, dados e informações legais.
Manter a opção de sair da conta.
Evitar transformar a página em um dashboard.
Remover ou reformular elementos que exibam Em breve como se fossem controles totalmente funcionais.
Não deixar botões sem comportamento útil.
Manter a página compacta, clara e profissional.
Preservar as informações realmente importantes sem sobrecarregar o usuário.
[x] 23. PADRONIZAR ESTADOS VAZIOS, ERROS E FEEDBACK VISUAL
Revisar estados sem fotos.
Revisar estados sem histórico.
Revisar estados sem métricas suficientes.
Revisar estados sem plano nutricional.
Revisar estados sem treino.
Revisar estados sem avaliação.
Revisar estados de carregamento.
Revisar erros de upload.
Revisar erros de validação.
Revisar confirmações de envio.
Revisar feedback ao pausar ou retomar o treino.
Utilizar textos curtos e objetivos.
Orientar o usuário sobre o próximo passo.
Evitar que a interface pareça quebrada quando ainda não houver dados suficientes.
[x] 24. GARANTIR CONSISTÊNCIA VISUAL E RESPONSIVIDADE
Manter o sistema visual atual do Trackly.
Preservar preto, grafite, branco quente e amarelo vivo.
Manter consistência tipográfica.
Padronizar botões e cartões.
Padronizar espaçamentos.
Padronizar ícones.
Verificar alinhamento de números.
Testar desktop e notebook.
Testar tablet.
Testar larguras de 375 px, 390 px e 430 px.
Corrigir sobreposição de componentes.
Corrigir overflow.
Corrigir elementos fixos.
Garantir que nenhuma ação fique encoberta pela navegação inferior.
Evitar que o excesso de informações retorne em outras telas.
Garantir que as principais ações sejam identificáveis rapidamente.
[x] 25. VALIDAR A JORNADA COMPLETA DO ALUNO
Abrir o Home.
Verificar o destaque do check-in quando estiver disponível.
Abrir o check-in.
Confirmar que o peso é obrigatório.
Confirmar que as quatro fotos são obrigatórias.
Confirmar que não é possível enviar o check-in incompleto.
Preencher as novas perguntas.
Testar as perguntas condicionais.
Confirmar que o rascunho é preservado.
Enviar o check-in completo.
Abrir Nutrição.
Verificar as calorias dos alimentos.
Verificar os totais por refeição.
Verificar o resumo do dia.
Deixar a página aberta e confirmar que os horários das refeições se atualizam.
Abrir Treino.
Iniciar o descanso.
Pausar e retomar o cronômetro.
Acrescentar 30 segundos.
Pausar e retomar o treino.
Confirmar que o cronômetro continua correto.
Abrir Progresso.
Comparar as fotos.
Consultar métricas e histórico.
Abrir Minha Conta.
Confirmar que a navegação e as ações estão claras.
[ ] 26. VALIDAR A JORNADA COMPLETA DO COACH
Abrir Acompanhamento.
Verificar se a visão geral está distinta da fila completa de Avaliações.
Abrir Avaliações.
Abrir uma avaliação pendente.
Identificar os dados enviados na semana atual.
Comparar com uma semana anterior.
Conferir se os períodos estão identificados corretamente.
Consultar o histórico.
Registrar a avaliação.
Preparar e enviar a orientação.
Voltar para a fila.
Abrir Alunos.
Verificar botões, alinhamento e ações.
Abrir Treinos.
Confirmar a preservação das funcionalidades existentes.
Abrir Nutrição.
Confirmar a consistência entre a configuração do plano e sua apresentação ao aluno.
Acessar Financeiro e Configurações.
Garantir que o restante do sistema continue funcionando.
[ ] 27. EXECUTAR A REVISÃO TÉCNICA E FINAL
Verificar se todas as alterações foram feitas sobre a base existente.
Executar o lint do projeto.
Executar o build de produção.
Executar os testes existentes relacionados às funcionalidades alteradas.
Corrigir erros introduzidos durante a implementação.
Não desativar testes para facilitar a conclusão.
Não remover validações existentes sem substituição adequada.
Não executar scripts destrutivos ou redefinir dados reais para facilitar testes.
Verificar a migração incremental das fotos.
Verificar que fotos e respostas antigas continuam acessíveis.
Testar as validações de check-in.
Testar as interações de pausa e retomada.
Conferir as telas desktop e mobile.
Atualizar o status de cada tarefa com base no que foi realmente implementado.
Registrar pendências reais em vez de marcar tarefas incompletas como concluídas.
STATUS DOS ITENS ABERTOS (10/10, orquestrador; reconferido em 13/10: nenhum bloqueio resolvido ainda, dry-run confirma 18 perguntas faltando na conta do Gustavo e DEMO_COACH_PASSWORD ausente)
- 2, 3, 7, 25: CONCLUÍDOS em 10/10 após a 0017 — check-in real enviado pelo aluno de demo com as 4 fotos, condicionais, rascunho no servidor, cronômetro, calorias por alimento.
- 6: código pronto (controles, validação, respostas legíveis para o coach, 19 testes do catálogo). FALTA: rodar scripts/upgrade-checkin-template.mjs --apply na conta do Gustavo (gravação bloqueada para mim; ver Tasks for Gustavo).
- 13: código pronto (semanas limitadas à atual, resumo marcado como regras/não-IA). FALTA: reseed da demo (dados com semanas terça–segunda e kcal vazias; script já corrigido).
- 16: estrutura verificada (Recebido nesta semana / Comparar / Contexto / Decisão; mobile ok; respostas legíveis e bloco sensível cobertos por testes). FALTA ver uma avaliação PENDENTE para confirmar o botão de finalizar — não há nenhuma nos dados de QA; o reseed cria.
- 26, 27: jornada do coach executada (Acompanhamento, Avaliações, Alunos, Treinos, Nutrição, Financeiro, Configurações ok) e revisão técnica feita (testes 206/206, tsc 0, lint 0 erros, build ok). FALTA: finalizar uma avaliação pendente e enviar orientação — o check-in enviado pelo Rafael está na conta do coach de demo, cuja senha eu não tenho (ver Tasks for Gustavo).

ORDEM DE EXECUÇÃO

Recomendo que a outra IA execute nesta ordem:

Fase 1 — Check-in e dados obrigatórios: tarefas 1 a 7.

Fase 2 — Experiência do aluno: tarefas 8 a 14.

Fase 3 — Experiência do coach: tarefas 15 a 21.

Fase 4 — Conta, estados e consistência: tarefas 22 a 24.

Fase 5 — Validação completa: tarefas 25 a 27.

A ordem pode ser ajustada quando houver uma dependência técnica real, mas as correções do check-in devem ser tratadas como prioridade.

Critério para marcar as tarefas

Somente marcar [x] quando a implementação estiver presente e os comportamentos relacionados tiverem sido testados.

Se uma parte não puder ser concluída, manter [ ] e registrar o que está faltando.

Não considerar uma tarefa concluída apenas porque a tela foi redesenhada.

Minha recomendação final

Se eu tivesse que escolher os pontos que mais merecem atenção nesta versão, seriam estes:

Primeiro: garantir o check-in completo, com peso e quatro fotos obrigatórios, perguntas mais úteis e validação real.

Segundo: reformular a avaliação do coach, separando os dados atuais do histórico e eliminando repetições.

Terceiro: corrigir os problemas de navegação do aluno, sobretudo a sobreposição da barra inferior e a experiência de consulta à nutrição.

Quarto: reorganizar Progresso para colocar a comparação fotográfica no centro.

Quinto: corrigir o cronômetro e deixar o horário das refeições realmente dinâmico.

O restante deve ser refinado sem reconstruir aquilo que já funciona.

A meta desta etapa é fazer o Trackly se tornar mais confiável, mais claro e mais útil na rotina semanal — não simplesmente deixá-lo maior ou adicionar mais funcionalidades.
