/**
 * Catálogo padrão de exercícios (pt-BR) que o coach pode importar para a própria biblioteca
 * ("Importar catálogo padrão" em /coach/treinos). Vai para a RPC `import_exercise_catalog`
 * (0007), que só insere na conta do coach autenticado e pula nomes que já existem.
 */
export type CatalogExercise = {
  name: string;
  category: string;
  muscle_group: string;
  equipment: string;
  instruction: string;
};

export const DEFAULT_EXERCISE_CATALOG: CatalogExercise[] = [
  { name: "Supino reto com barra", category: "Peito", muscle_group: "Peitoral", equipment: "Barra", instruction: "Deitado no banco, desça a barra até a linha do peito com os cotovelos a cerca de 45° do tronco e empurre de volta sem tirar o quadril do banco." },
  { name: "Supino inclinado com halteres", category: "Peito", muscle_group: "Peitoral", equipment: "Halteres", instruction: "No banco inclinado, desça os halteres alinhados à parte alta do peito e suba sem bater os halteres no topo." },
  { name: "Crucifixo na máquina", category: "Peito", muscle_group: "Peitoral", equipment: "Máquina", instruction: "Com as costas apoiadas, una os braços à frente do peito controlando a volta, sem deixar os ombros avançarem." },
  { name: "Flexão de braço", category: "Peito", muscle_group: "Peitoral", equipment: "Peso do corpo", instruction: "Corpo alinhado da cabeça aos calcanhares, desça o peito até perto do chão e empurre sem arquear a lombar." },
  { name: "Puxada frontal na polia", category: "Costas", muscle_group: "Dorsais", equipment: "Polia", instruction: "Puxe a barra até a altura do queixo levando os cotovelos para baixo e para trás, sem balançar o tronco." },
  { name: "Remada curvada com barra", category: "Costas", muscle_group: "Dorsais", equipment: "Barra", instruction: "Tronco inclinado com a coluna neutra, puxe a barra em direção ao abdômen e desça de forma controlada." },
  { name: "Remada baixa na polia", category: "Costas", muscle_group: "Dorsais", equipment: "Polia", instruction: "Sentado, puxe o triângulo até o abdômen aproximando as escápulas e retorne alongando as costas." },
  { name: "Barra fixa", category: "Costas", muscle_group: "Dorsais", equipment: "Barra fixa", instruction: "Pegada pouco acima da largura dos ombros; suba até o queixo passar da barra e desça com controle." },
  { name: "Desenvolvimento com halteres", category: "Ombros", muscle_group: "Deltoides", equipment: "Halteres", instruction: "Sentado com as costas apoiadas, empurre os halteres acima da cabeça e desça até a altura das orelhas." },
  { name: "Elevação lateral", category: "Ombros", muscle_group: "Deltoides", equipment: "Halteres", instruction: "Eleve os halteres lateralmente até a altura dos ombros, cotovelos levemente flexionados, sem impulso." },
  { name: "Crucifixo inverso", category: "Ombros", muscle_group: "Deltoides", equipment: "Halteres", instruction: "Com o tronco inclinado, abra os braços para os lados trabalhando a parte posterior do ombro." },
  { name: "Encolhimento de ombros", category: "Ombros", muscle_group: "Trapézio", equipment: "Halteres", instruction: "Eleve os ombros em direção às orelhas, segure um instante e desça devagar, sem rodar os ombros." },
  { name: "Rosca direta com barra", category: "Braços", muscle_group: "Bíceps", equipment: "Barra", instruction: "Cotovelos junto ao corpo, flexione os antebraços até a contração máxima e desça controlando." },
  { name: "Rosca alternada com halteres", category: "Braços", muscle_group: "Bíceps", equipment: "Halteres", instruction: "Alterne os braços girando o punho durante a subida, sem balançar o tronco." },
  { name: "Tríceps na polia (corda)", category: "Braços", muscle_group: "Tríceps", equipment: "Polia", instruction: "Cotovelos fixos ao lado do corpo, estenda os braços abrindo a corda no final do movimento." },
  { name: "Tríceps testa", category: "Braços", muscle_group: "Tríceps", equipment: "Barra", instruction: "Deitado, flexione apenas os cotovelos levando a barra em direção à testa e estenda sem abrir os cotovelos." },
  { name: "Agachamento livre", category: "Pernas", muscle_group: "Quadríceps", equipment: "Barra", instruction: "Barra apoiada nas costas, desça com o quadril para trás e joelhos alinhados aos pés até a coxa ficar paralela ao chão e suba empurrando o chão." },
  { name: "Leg press 45°", category: "Pernas", muscle_group: "Quadríceps", equipment: "Máquina", instruction: "Pés na largura dos ombros, desça até cerca de 90° de joelho sem descolar o quadril do banco e empurre sem travar os joelhos." },
  { name: "Cadeira extensora", category: "Pernas", muscle_group: "Quadríceps", equipment: "Máquina", instruction: "Estenda os joelhos até quase a extensão total e desça devagar, mantendo as costas apoiadas." },
  { name: "Mesa flexora", category: "Pernas", muscle_group: "Posterior de coxa", equipment: "Máquina", instruction: "Deitado, flexione os joelhos levando os calcanhares em direção aos glúteos e retorne de forma controlada." },
  { name: "Stiff com barra", category: "Pernas", muscle_group: "Posterior de coxa", equipment: "Barra", instruction: "Joelhos levemente flexionados, leve o quadril para trás deslizando a barra rente às pernas e volte contraindo os glúteos." },
  { name: "Afundo com halteres", category: "Pernas", muscle_group: "Quadríceps", equipment: "Halteres", instruction: "Dê um passo à frente e desça até o joelho de trás quase tocar o chão; volte empurrando o pé da frente." },
  { name: "Elevação pélvica", category: "Glúteos", muscle_group: "Glúteos", equipment: "Barra", instruction: "Costas apoiadas no banco, suba o quadril contraindo os glúteos até alinhar tronco e coxas e desça com controle." },
  { name: "Panturrilha em pé", category: "Pernas", muscle_group: "Panturrilha", equipment: "Máquina", instruction: "Suba na ponta dos pés o máximo possível, segure um instante e desça alongando completamente." },
  { name: "Prancha abdominal", category: "Abdômen", muscle_group: "Abdômen", equipment: "Peso do corpo", instruction: "Apoiado nos antebraços, mantenha o corpo reto contraindo abdômen e glúteos, sem deixar o quadril cair." },
  { name: "Abdominal na polia", category: "Abdômen", muscle_group: "Abdômen", equipment: "Polia", instruction: "Ajoelhado, flexione o tronco levando os cotovelos em direção aos joelhos, sem puxar com os braços." },
  { name: "Elevação de pernas", category: "Abdômen", muscle_group: "Abdômen", equipment: "Peso do corpo", instruction: "Pendurado ou deitado, eleve as pernas até 90° com o abdômen contraído e desça sem balançar." },
  { name: "Esteira (caminhada ou corrida)", category: "Cardio", muscle_group: "Cardio", equipment: "Esteira", instruction: "Mantenha postura ereta e ritmo constante conforme a intensidade prescrita (use o campo de duração do treino)." },
  { name: "Bicicleta ergométrica", category: "Cardio", muscle_group: "Cardio", equipment: "Bicicleta", instruction: "Ajuste o selim na altura do quadril e mantenha cadência constante conforme a intensidade prescrita." },
  { name: "Mobilidade de quadril", category: "Aquecimento", muscle_group: "Mobilidade", equipment: "Peso do corpo", instruction: "Círculos e agachamento profundo sem carga, ampliando a amplitude gradualmente antes do treino." },
];
