/**
 * Catálogo do QUESTIONÁRIO INICIAL do aluno (V5, itens 9–10; plano de dados §7). Módulo PURO (sem
 * I/O, sem "server-only"): usado pelo formulário guiado do portal (client), pelo servidor (validação
 * no rascunho e no envio), pela tela "respostas enviadas" e pela seção do coach.
 *
 * Versão `v2.1-lufteam-2026-10` (v2 sem lesão/dor e anticoncepcional): adaptada aos formulários reais do coach ("Formulário Inicial
 * LufTTeam" → seção comum, para TODOS os pacotes; "Formulário Dieta LufTTeam" → seção Nutrição,
 * só Nutrição e Híbrido). NÃO há seção de treino: o coach monta o treino a partir da seção comum
 * (experiências com treino/dieta/hormônio, rotina). Para trocar perguntas: edite
 * `QUESTIONNAIRE_STEPS` e suba `QUESTIONNAIRE_VERSION` — o banco guarda as respostas por `key` junto
 * com `catalog_version`, então respostas antigas continuam legíveis: chaves que saíram do catálogo
 * (inclusive a seção Treino da v1) ficam descritas em `LEGACY_QUESTIONS` (rótulo, opções e
 * sensibilidade) e aparecem em "Outras respostas".
 *
 * Estrutura: seções (`common` sempre; `nutrition` conforme o pacote — `sectionsFor` em
 * `packages.ts`), cada seção em etapas curtas (uma por tela) e cada etapa com perguntas. Cada
 * pergunta tem `key`, tipo de controle, obrigatoriedade, limites, opções, condição de visibilidade
 * e o flag `sensitive`. `training` continua no tipo `QuestionnaireSection` (o banco aceita e envios
 * da v1 o têm), mas não tem etapas.
 *
 * Sensível (LGPD art. 11 — saúde; e renda): sintomas, alergias, intolerâncias, doenças,
 * medicamentos, intestino, Bristol, urina, experiência com hormônio e renda vão
 * para `sensitive_answers` (coluna separada da 0022), nunca para `answers`. Só o próprio aluno e a
 * seção "Questionário inicial" do perfil (coach) leem; nunca fila, dashboard, admin, notificação,
 * WhatsApp ou IA. Nada é guardado em localStorage/sessionStorage: o rascunho fica no servidor.
 *
 * Lesão/dor/restrição e anticoncepcional NÃO são mais perguntados (v2.1); envios e rascunhos antigos
 * com essas chaves continuam legíveis e sensíveis via `LEGACY_QUESTIONS`.
 *
 * Dados pessoais: só o que serve ao protocolo. Nome, e-mail e telefone já vêm do convite e NÃO são
 * perguntados de novo. CPF do formulário original NÃO é coletado (desnecessário para o serviço).
 * Idade é derivada da data de nascimento.
 */
import type { QuestionnaireSection } from "./packages";

/** Versão gravada em `onboarding_questionnaires.catalog_version` (≤ 40 caracteres). */
export const QUESTIONNAIRE_VERSION = "v2.1-lufteam-2026-10";

/**
 * Tipos de pergunta:
 *  - `choice` seleção única (`display: "select"` = lista suspensa, para listas longas)
 *  - `multi` múltipla escolha · `number` número com limites · `time` horário (HH:MM)
 *  - `text` texto curto · `notes` texto livre maior · `date` data (AAAA-MM-DD)
 *  - `matrix` grade: uma resposta (coluna = `options`) por linha (`rows`); valor = { linha: coluna }
 */
export type QuestionInput = "choice" | "multi" | "number" | "text" | "notes" | "date" | "time" | "matrix";

export type QuestionOption = { value: string; label: string; /** rótulo curto (pílulas da grade) */ short?: string };

/** Valor armazenado: texto, número, lista (múltipla escolha) ou mapa linha → coluna (grade). */
export type AnswerValue = string | number | string[] | Record<string, string>;
export type AnswerMap = Record<string, AnswerValue>;

/** Contexto da validação. `today` = hoje em São Paulo (AAAA-MM-DD); ausente → data do sistema. */
export type QuestionnaireContext = { today?: string };

export type QuestionnaireQuestion = {
  key: string;
  input: QuestionInput;
  label: string;
  help?: string;
  placeholder?: string;
  unit?: string;
  options?: QuestionOption[];
  /** `matrix`: linhas da grade. */
  rows?: QuestionOption[];
  /** `choice`: como exibir (padrão = cartões). */
  display?: "select";
  /** `number`: limites e passo (1 = inteiro, 0.1 = uma casa decimal). */
  min?: number;
  max?: number;
  step?: number;
  /** `text`/`notes`: limite de caracteres. */
  maxLength?: number;
  /** `multi`: opção exclusiva (ex.: "nenhum") — marcada sozinha. */
  exclusiveOption?: string;
  required: boolean;
  sensitive?: boolean;
  /** Visível com estas respostas? Ausente = sempre. Pergunta oculta não é validada nem salva. */
  visibleWhen?: (answers: AnswerMap) => boolean;
};

export type QuestionnaireStep = {
  id: string;
  section: QuestionnaireSection;
  title: string;
  hint: string;
  questions: QuestionnaireQuestion[];
};

export const SECTION_META: Readonly<Record<QuestionnaireSection, { label: string; description: string }>> = {
  common: { label: "Sobre você", description: "Dados básicos, objetivo, experiência e rotina." },
  // Sem etapas na v2 (o coach monta o treino a partir da seção comum); fica só para ler envios da v1.
  training: { label: "Treino", description: "Respostas de treino da versão anterior do questionário." },
  nutrition: { label: "Nutrição", description: "Saúde, sintomas, preferências, intestino e hábitos." },
};

export const SECTION_ORDER: readonly QuestionnaireSection[] = ["common", "training", "nutrition"];

export const YES = "yes";
export const NO = "no";
const YES_NO: QuestionOption[] = [
  { value: YES, label: "Sim" },
  { value: NO, label: "Não" },
];

export const SHORT_TEXT_MAX = 200;
export const NOTES_MAX = 1000;
const LONG_NOTES_MAX = 1500;

const isYes = (a: AnswerMap, key: string) => a[key] === YES;

const UF: [string, string][] = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"],
  ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
  ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"],
  ["SE", "Sergipe"], ["TO", "Tocantins"],
];

/** Colunas da grade de sintomas, da menor para a maior frequência. */
export const FREQUENCY_OPTIONS: QuestionOption[] = [
  { value: "never", label: "Nunca", short: "Nunca" },
  { value: "rarely", label: "Raramente", short: "Raramente" },
  { value: "sometimes", label: "Ocasionalmente", short: "Às vezes" },
  { value: "often", label: "Frequentemente", short: "Frequente" },
];

const SYMPTOM_ROWS: QuestionOption[] = [
  { value: "headache", label: "Dor de cabeça" },
  { value: "insomnia", label: "Insônia" },
  { value: "sore_throat", label: "Dor de garganta" },
  { value: "mouth_ulcers", label: "Aftas" },
  { value: "acne", label: "Acne" },
  { value: "hair_loss", label: "Perda de cabelo" },
  { value: "excessive_sweating", label: "Suor excessivo" },
  { value: "asthma", label: "Asma ou bronquite" },
  { value: "nausea", label: "Náuseas ou vômito" },
  { value: "diarrhea", label: "Diarreia" },
  { value: "constipation", label: "Constipação (intestino preso)" },
  { value: "heartburn", label: "Azia" },
  { value: "muscle_pain", label: "Dor muscular (não causada por exercício)" },
  { value: "joint_pain", label: "Dor articular (não causada por exercício)" },
  { value: "fatigue", label: "Fadiga" },
  { value: "hyperactivity", label: "Hiperatividade" },
  { value: "anxiety", label: "Ansiedade" },
  { value: "depression", label: "Depressão" },
  { value: "often_sick", label: "Fica doente com frequência" },
];

// ---------------------------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------------------------

export const QUESTIONNAIRE_STEPS: readonly QuestionnaireStep[] = [
  // ---- Comum a todos ("Formulário Inicial LufTTeam") ------------------------------------------
  {
    id: "common_body",
    section: "common",
    title: "Seus dados básicos",
    hint: "Usamos só para calcular idade e ajustar o plano ao seu corpo.",
    questions: [
      {
        key: "birth_date",
        input: "date",
        label: "Data de nascimento",
        help: "Pedimos a data, e não a idade, para ela se manter sempre atualizada.",
        required: true,
      },
      {
        key: "height_cm",
        input: "number",
        label: "Altura",
        unit: "cm",
        placeholder: "Ex.: 172",
        min: 100,
        max: 250,
        step: 1,
        required: true,
      },
      {
        key: "weight_kg",
        input: "number",
        label: "Peso atual",
        help: "Uma medida recente já serve. Não vira registro do check-in semanal.",
        unit: "kg",
        placeholder: "Ex.: 78,5",
        min: 30,
        max: 300,
        step: 0.1,
        required: true,
      },
      {
        key: "gender",
        input: "choice",
        label: "Sexo biológico",
        help: "Opcional. Ajuda a estimar gasto de energia e cargas.",
        options: [
          { value: "feminino", label: "Feminino" },
          { value: "masculino", label: "Masculino" },
        ],
        required: false,
      },
      {
        key: "state",
        input: "choice",
        display: "select",
        label: "Estado onde você mora",
        options: UF.map(([value, label]) => ({ value, label })),
        required: false,
      },
    ],
  },
  {
    id: "common_goal",
    section: "common",
    title: "Seu objetivo",
    hint: "O que você quer alcançar com o acompanhamento.",
    questions: [
      {
        key: "goal",
        input: "choice",
        label: "Qual é o seu principal objetivo?",
        options: [
          { value: "fat_loss", label: "Emagrecer" },
          { value: "muscle_gain", label: "Ganhar massa muscular" },
          { value: "recomposition", label: "Perder gordura e ganhar músculo" },
          { value: "health", label: "Saúde e condicionamento" },
          { value: "performance", label: "Desempenho em um esporte" },
          { value: "other", label: "Outro" },
        ],
        required: true,
      },
      {
        key: "goal_detail",
        input: "notes",
        label: "Conte um pouco mais sobre o seu objetivo",
        help: "Um número que quer alcançar, um físico de referência, se a prioridade é ganhar massa ou perder gordura.",
        placeholder: "Ex.: chegar a 72 kg com mais definição no abdômen até março",
        maxLength: NOTES_MAX,
        required: true,
      },
    ],
  },
  {
    id: "common_background",
    section: "common",
    title: "Sua experiência",
    hint: "O que você já viveu com treino, dieta e acompanhamento.",
    questions: [
      {
        key: "experience_training",
        input: "text",
        label: "Experiência com treino",
        help: "Há quanto tempo treina, o que pratica, quantas vezes por semana e onde (academia, casa…).",
        placeholder: "Ex.: musculação há 2 anos, 4x por semana na academia",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
      {
        key: "experience_diet",
        input: "text",
        label: "Experiência com dieta",
        placeholder: "Ex.: já fiz low carb por 3 meses",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
      {
        key: "experience_hormones",
        input: "text",
        label: "Experiência com hormônios",
        help: "Se já usou ou usa algum protocolo hormonal. Se nunca usou, deixe em branco.",
        maxLength: SHORT_TEXT_MAX,
        required: false,
        sensitive: true,
      },
      {
        key: "previous_online_coach",
        input: "choice",
        label: "Já trabalhou com algum coach online antes?",
        options: YES_NO,
        required: false,
      },
      {
        key: "previous_online_coach_detail",
        input: "text",
        label: "Qual ou quais?",
        maxLength: SHORT_TEXT_MAX,
        required: false,
        visibleWhen: (a) => isYes(a, "previous_online_coach"),
      },
      {
        key: "referral",
        input: "text",
        label: "Conheceu a consultoria por alguma influencer ou atleta?",
        help: "Coloque o @ do Instagram ou o cupom. Opcional.",
        placeholder: "Ex.: @perfil ou CUPOM10",
        maxLength: 120,
        required: false,
      },
    ],
  },
  {
    id: "common_routine",
    section: "common",
    title: "Rotina",
    hint: "Assim o plano cabe no seu dia a dia.",
    questions: [
      {
        key: "occupation",
        input: "text",
        label: "Qual é a sua ocupação (trabalho)?",
        placeholder: "Ex.: analista, trabalho sentado das 9h às 18h",
        maxLength: SHORT_TEXT_MAX,
        required: true,
      },
      {
        key: "daily_activity",
        input: "choice",
        label: "Como é o seu dia a dia?",
        options: [
          { value: "sedentary", label: "Fico sentado a maior parte do tempo" },
          { value: "moderate", label: "Fico em pé ou caminho bastante" },
          { value: "heavy", label: "Trabalho com esforço físico" },
          { value: "varies", label: "Varia muito" },
        ],
        required: true,
      },
      {
        key: "sleep_time",
        input: "time",
        label: "Que horas você costuma dormir?",
        required: false,
      },
      {
        key: "wake_time",
        input: "time",
        label: "Que horas você costuma acordar?",
        required: false,
      },
      {
        key: "best_period",
        input: "choice",
        label: "Qual período do dia costuma ser melhor para você se dedicar ao plano?",
        options: [
          { value: "morning", label: "Manhã" },
          { value: "afternoon", label: "Tarde" },
          { value: "evening", label: "Noite" },
          { value: "varies", label: "Varia" },
        ],
        required: false,
      },
      {
        key: "general_notes",
        input: "notes",
        label: "Observações",
        help: "Algo mais sobre sua rotina que o coach deva saber? Opcional.",
        maxLength: NOTES_MAX,
        required: false,
      },
    ],
  },

  // ---- Nutrição ("Formulário Dieta LufTTeam") ----------------------------------------------------
  {
    id: "nutrition_current",
    section: "nutrition",
    title: "Sua alimentação hoje",
    hint: "Como você come hoje, sem julgamento.",
    questions: [
      {
        key: "current_diet",
        input: "text",
        label: "Você já segue alguma dieta?",
        placeholder: "Ex.: não sigo nenhuma / dieta de um nutricionista há 2 meses",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
      {
        key: "meals_per_day",
        input: "number",
        label: "Quantas refeições por dia são o ideal para a sua rotina?",
        unit: "refeições",
        min: 1,
        max: 10,
        step: 1,
        required: true,
      },
      {
        key: "sweets_craving",
        input: "choice",
        label: "Você tem muita vontade de comer doces?",
        options: [
          { value: "yes", label: "Sim, com frequência" },
          { value: "sometimes", label: "Às vezes" },
          { value: "no", label: "Não" },
        ],
        required: false,
      },
    ],
  },
  {
    id: "nutrition_symptoms",
    section: "nutrition",
    title: "Sintomas",
    hint: "Com que frequência você sente cada um. Fica visível só para você e seu coach.",
    questions: [
      {
        key: "symptoms",
        input: "matrix",
        label: "Sintomas: com que frequência você sente cada um?",
        help: "Uma resposta por linha.",
        rows: SYMPTOM_ROWS,
        options: FREQUENCY_OPTIONS,
        required: true,
        sensitive: true,
      },
      {
        key: "symptoms_extra",
        input: "text",
        label: "Algum outro sintoma que queira contar?",
        help: "Se não houver, deixe em branco ou escreva \"Nenhum\".",
        maxLength: SHORT_TEXT_MAX,
        required: false,
        sensitive: true,
      },
    ],
  },
  {
    id: "nutrition_health",
    section: "nutrition",
    title: "Saúde",
    hint: "Alergias, intolerâncias e condições de saúde. Fica visível só para você e seu coach.",
    questions: [
      {
        key: "food_allergies",
        input: "text",
        label: "Você tem alguma alergia alimentar?",
        placeholder: "Ex.: nenhuma / camarão",
        maxLength: SHORT_TEXT_MAX,
        required: false,
        sensitive: true,
      },
      {
        key: "food_intolerances",
        input: "text",
        label: "Você tem alguma intolerância alimentar?",
        placeholder: "Ex.: nenhuma / lactose",
        maxLength: SHORT_TEXT_MAX,
        required: false,
        sensitive: true,
      },
      {
        key: "health_conditions",
        input: "notes",
        label: "Tem alguma alteração hormonal, disfunção, doença ou exame recente?",
        help: "Ex.: pressão alta, diabetes, doença celíaca, síndrome do intestino irritável, SOP, endometriose.",
        maxLength: NOTES_MAX,
        required: false,
        sensitive: true,
      },
    ],
  },
  {
    id: "nutrition_preferences",
    section: "nutrition",
    title: "Preferências alimentares",
    hint: "Um plano que você gosta é um plano que você segue.",
    questions: [
      {
        key: "carb_sources",
        input: "text",
        label: "Fontes de carboidrato que você prefere",
        placeholder: "Ex.: arroz, batata, macarrão",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
      {
        key: "protein_sources",
        input: "text",
        label: "Fontes de proteína que você prefere",
        placeholder: "Ex.: ovo, carne vermelha, frango, peixe",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
      {
        key: "fat_sources",
        input: "text",
        label: "Fontes de gordura que você prefere",
        placeholder: "Ex.: abacate, azeite, pasta de amendoim",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
      {
        key: "fruits",
        input: "text",
        label: "Frutas de que você gosta",
        help: "Cite pelo menos 3, se puder.",
        placeholder: "Ex.: banana, maçã, morango",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
      {
        key: "vegetables",
        input: "text",
        label: "Vegetais de que você gosta",
        placeholder: "Ex.: alface, tomate, brócolis",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
      {
        key: "disliked_foods",
        input: "text",
        label: "Tem algum alimento de que você não gosta?",
        placeholder: "Ex.: peixe, fígado",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
      {
        key: "must_have_foods",
        input: "text",
        label: "Algum alimento que você faz questão de ter no plano?",
        placeholder: "Ex.: café com leite pela manhã",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
    ],
  },
  {
    id: "nutrition_gut",
    section: "nutrition",
    title: "Intestino e hidratação",
    hint: "Ajuda a ajustar fibras e água. Fica visível só para você e seu coach.",
    questions: [
      {
        key: "bowel_habits",
        input: "text",
        label: "Como está o seu intestino?",
        help: "Evacua todo dia? Com que frequência?",
        placeholder: "Ex.: todo dia pela manhã / a cada 2 ou 3 dias",
        maxLength: SHORT_TEXT_MAX,
        required: false,
        sensitive: true,
      },
      {
        key: "bristol_type",
        input: "choice",
        label: "Como costumam ser as suas fezes? (Escala de Bristol)",
        help: "Escolha o tipo mais comum para você.",
        options: [
          { value: "1", label: "Tipo 1 · bolinhas duras e separadas, difíceis de evacuar" },
          { value: "2", label: "Tipo 2 · formato de salsicha, mas encaroçado" },
          { value: "3", label: "Tipo 3 · formato de salsicha, com rachaduras na superfície" },
          { value: "4", label: "Tipo 4 · formato de salsicha ou cobra, liso e macio" },
          { value: "5", label: "Tipo 5 · pedaços macios, com bordas bem definidas" },
          { value: "6", label: "Tipo 6 · pedaços moles e pastosos, bordas irregulares" },
          { value: "7", label: "Tipo 7 · totalmente líquido, sem pedaços sólidos" },
        ],
        required: true,
        sensitive: true,
      },
      {
        key: "urine_color",
        input: "choice",
        label: "Qual costuma ser a cor da sua urina? (Escala de Armstrong)",
        options: [
          { value: "1-3", label: "1 a 3 · clara a amarelo-claro" },
          { value: "4-6", label: "4 a 6 · amarelo-escuro" },
          { value: "7-8", label: "7 a 8 · âmbar a marrom" },
        ],
        required: true,
        sensitive: true,
      },
    ],
  },
  {
    id: "nutrition_routine",
    section: "nutrition",
    title: "Rotina e hábitos",
    hint: "Como a comida se encaixa na sua semana.",
    questions: [
      {
        key: "eating_routine",
        input: "notes",
        label: "Como é a sua rotina de alimentação hoje?",
        help: "Alimentos, quantidades, horários das refeições e horários de trabalho ou estudo.",
        placeholder: "Ex.: 7h café com pão e ovo; 12h almoço no trabalho (arroz, feijão, frango)…",
        maxLength: LONG_NOTES_MAX,
        required: false,
      },
      {
        key: "diet_difficulty",
        input: "text",
        label: "Qual é a sua maior dificuldade ao seguir um plano alimentar?",
        placeholder: "Ex.: fome à noite, comer fora no trabalho",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
      {
        key: "weekend_habits",
        input: "notes",
        label: "Como costuma ser o seu fim de semana?",
        help: "Comidas, bebidas, lugares que frequenta.",
        maxLength: NOTES_MAX,
        required: false,
      },
      {
        key: "household_income",
        input: "choice",
        label: "Qual é a renda por pessoa da sua casa?",
        help: "Ajuda o coach a montar um plano que caiba no seu bolso. Fica visível só para você e seu coach.",
        options: [
          { value: "lt_1", label: "Menos de um salário mínimo (R$ 1.518,00)" },
          { value: "2", label: "Dois salários mínimos (R$ 3.036,00)" },
          { value: "3", label: "Três salários mínimos (R$ 4.554,00)" },
          { value: "gt_3", label: "Mais de três salários mínimos" },
          { value: "undisclosed", label: "Prefiro não informar" },
        ],
        required: true,
        sensitive: true,
      },
    ],
  },
  {
    id: "nutrition_meds",
    section: "nutrition",
    title: "Suplementos e medicamentos",
    hint: "Medicamentos ficam visíveis só para você e seu coach.",
    questions: [
      {
        key: "supplements",
        input: "text",
        label: "Você usa ou pretende usar suplementos?",
        placeholder: "Ex.: whey, creatina, pré-treino",
        maxLength: SHORT_TEXT_MAX,
        required: false,
      },
      {
        key: "medications",
        input: "text",
        label: "Usa algum remédio prescrito por médico?",
        placeholder: "Ex.: nenhum / antidepressivo",
        maxLength: SHORT_TEXT_MAX,
        required: false,
        sensitive: true,
      },
    ],
  },
  {
    id: "nutrition_notes",
    section: "nutrition",
    title: "Observações",
    hint: "Última etapa da nutrição.",
    questions: [
      {
        key: "nutrition_notes",
        input: "notes",
        label: "Observações",
        help: "Qualquer coisa que o coach deva saber sobre sua alimentação. Opcional.",
        maxLength: NOTES_MAX,
        required: false,
      },
    ],
  },
];

/**
 * Perguntas de versões anteriores que saíram do catálogo (v1-provisorio-2026-10, incluindo a
 * seção Treino inteira). Servem só para
 * LER respostas antigas (rótulo, opções, sensibilidade) — nunca são perguntadas nem salvas.
 */
export const LEGACY_QUESTIONS: Readonly<Record<string, { label: string; options?: QuestionOption[]; sensitive?: boolean }>> = {
  // seção Treino da v1 (removida na v2: o coach monta o treino a partir da seção comum)
  training_experience: {
    label: "Há quanto tempo treina",
    options: [
      { value: "none", label: "Nunca treinei" },
      { value: "beginner", label: "Menos de 6 meses" },
      { value: "intermediate", label: "De 6 meses a 2 anos" },
      { value: "advanced", label: "Mais de 2 anos" },
    ],
  },
  current_activities: {
    label: "O que pratica hoje",
    options: [
      { value: "strength", label: "Musculação" },
      { value: "running", label: "Corrida ou caminhada" },
      { value: "functional", label: "Funcional ou cross" },
      { value: "sports", label: "Esportes" },
      { value: "other", label: "Outro" },
      { value: "none", label: "Nada no momento" },
    ],
  },
  current_sessions_per_week: { label: "Vezes por semana que se exercita hoje" },
  training_days_per_week: { label: "Dias por semana que pode treinar" },
  session_length: {
    label: "Tempo por treino",
    options: [
      { value: "30", label: "Até 30 min" },
      { value: "45", label: "Cerca de 45 min" },
      { value: "60", label: "Cerca de 1 hora" },
      { value: "90", label: "1h30 ou mais" },
    ],
  },
  training_location: {
    label: "Onde vai treinar",
    options: [
      { value: "full_gym", label: "Academia completa" },
      { value: "small_gym", label: "Academia pequena ou de condomínio" },
      { value: "home", label: "Em casa" },
      { value: "outdoor", label: "Ao ar livre" },
    ],
  },
  equipment: {
    label: "Equipamentos à disposição",
    options: [
      { value: "dumbbells", label: "Halteres" },
      { value: "barbell", label: "Barra e anilhas" },
      { value: "machines", label: "Máquinas" },
      { value: "bands", label: "Elásticos" },
      { value: "kettlebell", label: "Kettlebell" },
      { value: "bench", label: "Banco" },
      { value: "none", label: "Nenhum" },
    ],
  },
  training_notes: { label: "Observações sobre treino" },
  // v2: removidas na v2.1 (decisão do coach); sensíveis (saúde) se vierem em envio/rascunho antigo
  has_injuries: { label: "Você tem alguma lesão, dor ou restrição de movimento?", options: YES_NO, sensitive: true },
  injuries_detail: { label: "Lesão, dor ou restrição: o que é e o que piora", sensitive: true },
  contraceptive: { label: "Usa anticoncepcional? Qual e qual a dose?", sensitive: true },
  // seção comum / nutrição da v1
  expectations: { label: "O que você espera dos próximos meses?" },
  schedule: { label: "Seus horários principais" },
  available_days: {
    label: "Dias com tempo para se dedicar ao plano",
    options: [
      { value: "mon", label: "Seg" },
      { value: "tue", label: "Ter" },
      { value: "wed", label: "Qua" },
      { value: "thu", label: "Qui" },
      { value: "fri", label: "Sex" },
      { value: "sat", label: "Sáb" },
      { value: "sun", label: "Dom" },
    ],
  },
  meal_times: { label: "Horários em que costuma comer" },
  eating_habits: {
    label: "Hábitos na rotina",
    options: [
      { value: "snacking", label: "Belisco entre as refeições" },
      { value: "eat_out", label: "Como fora com frequência" },
      { value: "skip_breakfast", label: "Pulo o café da manhã" },
      { value: "late_meals", label: "Como tarde da noite" },
      { value: "low_water", label: "Bebo pouca água" },
      { value: "sweets", label: "Como doces com frequência" },
      { value: "none", label: "Nenhum destes" },
    ],
  },
  who_cooks: {
    label: "Quem prepara a maior parte das refeições",
    options: [
      { value: "self", label: "Eu mesmo" },
      { value: "family", label: "Alguém da casa" },
      { value: "ready", label: "Compro pronta / delivery" },
      { value: "mixed", label: "Varia" },
    ],
  },
  favorite_foods: { label: "Alimentos que mais gosta" },
  has_food_restrictions: { label: "Tem alergia, intolerância ou restrição alimentar?", options: YES_NO, sensitive: true },
  food_restrictions: {
    label: "Restrições alimentares",
    options: [
      { value: "lactose", label: "Lactose" },
      { value: "gluten", label: "Glúten" },
      { value: "vegetarian", label: "Vegetariano" },
      { value: "vegan", label: "Vegano" },
      { value: "seafood", label: "Frutos do mar" },
      { value: "nuts", label: "Amendoim ou castanhas" },
      { value: "other", label: "Outra" },
    ],
    sensitive: true,
  },
  food_restrictions_detail: { label: "Detalhes da restrição", sensitive: true },
};

// ---------------------------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------------------------

const QUESTION_BY_KEY: ReadonlyMap<string, QuestionnaireQuestion> = new Map(
  QUESTIONNAIRE_STEPS.flatMap((s) => s.questions.map((q) => [q.key, q] as const))
);

export function getQuestion(key: string): QuestionnaireQuestion | undefined {
  return QUESTION_BY_KEY.get(key);
}

/** Sensível no catálogo atual ou numa versão anterior. */
export function isSensitiveKey(key: string): boolean {
  return QUESTION_BY_KEY.get(key)?.sensitive === true || LEGACY_QUESTIONS[key]?.sensitive === true;
}

/** Normaliza a lista de seções: só válidas, sem repetição, na ordem canônica, `common` sempre. */
export function normalizeSections(sections: readonly string[] | null | undefined): QuestionnaireSection[] {
  const set = new Set<string>(sections ?? []);
  set.add("common");
  return SECTION_ORDER.filter((s) => set.has(s));
}

/** Etapas das seções pedidas (ordem: comum → nutrição). */
export function stepsFor(sections: readonly string[] | null | undefined): QuestionnaireStep[] {
  const wanted = new Set(normalizeSections(sections));
  return QUESTIONNAIRE_STEPS.filter((s) => wanted.has(s.section));
}

export function isQuestionVisible(q: QuestionnaireQuestion, answers: AnswerMap): boolean {
  return q.visibleWhen ? q.visibleWhen(answers) : true;
}

export function visibleQuestions(step: QuestionnaireStep, answers: AnswerMap): QuestionnaireQuestion[] {
  return step.questions.filter((q) => isQuestionVisible(q, answers));
}

// ---------------------------------------------------------------------------------------------
// Normalização e validação
// ---------------------------------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const MIN_AGE = 12;
export const MAX_AGE = 100;

function systemToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function isRealDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Idade completa em anos numa data (AAAA-MM-DD). `null` se alguma data for inválida. */
export function ageOn(birthDate: string, today: string): number | null {
  if (!isRealDate(birthDate) || !isRealDate(today)) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Converte número digitado (aceita vírgula) em `number`; `null` se não for número finito. */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Resposta vazia (não respondida)? */
export function isEmptyAnswer(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === "string") return raw.trim() === "";
  if (Array.isArray(raw)) return raw.length === 0;
  if (isPlainObject(raw)) return Object.keys(raw).length === 0;
  return false;
}

type Check = { ok: true; value: AnswerValue | null } | { ok: false; error: string };

function stepDecimals(step: number | undefined): number {
  if (!step || step >= 1) return 0;
  const s = String(step);
  return s.includes(".") ? s.split(".")[1].length : 0;
}

/**
 * Normaliza + valida UMA resposta pelo tipo da pergunta (sem olhar obrigatoriedade).
 * Vazio → `{ ok: true, value: null }`. Grade parcial é válida aqui (o rascunho aceita parcial);
 * a exigência de todas as linhas fica em `validateStep`.
 */
export function checkAnswer(q: QuestionnaireQuestion, raw: unknown, ctx: QuestionnaireContext = {}): Check {
  if (isEmptyAnswer(raw)) return { ok: true, value: null };

  switch (q.input) {
    case "number": {
      const n = parseNumber(raw);
      if (n === null) return { ok: false, error: "Digite um número válido." };
      const decimals = stepDecimals(q.step);
      const factor = 10 ** decimals;
      if (decimals === 0 && !Number.isInteger(n)) return { ok: false, error: "Use um número inteiro." };
      const rounded = Math.round(n * factor) / factor;
      if (q.min !== undefined && rounded < q.min) {
        return { ok: false, error: `O valor mínimo é ${q.min}${q.unit ? ` ${q.unit}` : ""}.` };
      }
      if (q.max !== undefined && rounded > q.max) {
        return { ok: false, error: `O valor máximo é ${q.max}${q.unit ? ` ${q.unit}` : ""}.` };
      }
      return { ok: true, value: rounded };
    }
    case "choice": {
      if (typeof raw !== "string") return { ok: false, error: "Escolha uma opção." };
      const v = raw.trim();
      if (!q.options?.some((o) => o.value === v)) return { ok: false, error: "Escolha uma das opções." };
      return { ok: true, value: v };
    }
    case "multi": {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : null;
      if (!list || list.some((v) => typeof v !== "string")) return { ok: false, error: "Escolha uma ou mais opções." };
      const values = [...new Set((list as string[]).map((v) => v.trim()).filter(Boolean))];
      if (values.length === 0) return { ok: true, value: null };
      if (values.some((v) => !q.options?.some((o) => o.value === v))) {
        return { ok: false, error: "Escolha apenas opções da lista." };
      }
      if (q.exclusiveOption && values.includes(q.exclusiveOption) && values.length > 1) {
        const label = q.options?.find((o) => o.value === q.exclusiveOption)?.label ?? q.exclusiveOption;
        return { ok: false, error: `"${label}" não pode ser marcado junto com outras opções.` };
      }
      // ordem estável = ordem das opções
      const ordered = (q.options ?? []).map((o) => o.value).filter((v) => values.includes(v));
      return { ok: true, value: ordered };
    }
    case "matrix": {
      if (!isPlainObject(raw)) return { ok: false, error: "Resposta inválida." };
      const rows = q.rows ?? [];
      const cols = q.options ?? [];
      const out: Record<string, string> = {};
      for (const [row, col] of Object.entries(raw)) {
        if (col === null || col === undefined || col === "") continue;
        if (!rows.some((r) => r.value === row) || typeof col !== "string" || !cols.some((c) => c.value === col)) {
          return { ok: false, error: "Escolha apenas opções da grade." };
        }
      }
      // ordem estável = ordem das linhas
      for (const r of rows) {
        const col = raw[r.value];
        if (typeof col === "string" && col !== "") out[r.value] = col;
      }
      return { ok: true, value: Object.keys(out).length > 0 ? out : null };
    }
    case "text":
    case "notes": {
      if (typeof raw !== "string") return { ok: false, error: "Resposta inválida." };
      const v = raw.trim().replace(/\r\n/g, "\n");
      const max = q.maxLength ?? (q.input === "notes" ? NOTES_MAX : SHORT_TEXT_MAX);
      if (v.length > max) return { ok: false, error: `Use no máximo ${max} caracteres.` };
      return { ok: true, value: v };
    }
    case "time": {
      if (typeof raw !== "string") return { ok: false, error: "Informe um horário válido." };
      const m = TIME_RE.exec(raw.trim());
      if (!m) return { ok: false, error: "Informe um horário válido (ex.: 23:00)." };
      return { ok: true, value: `${m[1].padStart(2, "0")}:${m[2]}` };
    }
    case "date": {
      if (typeof raw !== "string" || !isRealDate(raw.trim())) return { ok: false, error: "Informe uma data válida." };
      const v = raw.trim();
      const today = ctx.today ?? systemToday();
      if (v < "1900-01-01" || v > today) return { ok: false, error: "A data não pode estar no futuro." };
      if (q.key === "birth_date") {
        const age = ageOn(v, today);
        if (age === null || age < MIN_AGE || age > MAX_AGE) {
          return { ok: false, error: `Confira a data: a idade precisa estar entre ${MIN_AGE} e ${MAX_AGE} anos.` };
        }
      }
      return { ok: true, value: v };
    }
  }
}

/** Linhas da grade ainda sem resposta (na ordem do catálogo). */
export function missingMatrixRows(q: QuestionnaireQuestion, value: unknown): QuestionOption[] {
  const v = isPlainObject(value) ? value : {};
  return (q.rows ?? []).filter((r) => typeof v[r.value] !== "string" || v[r.value] === "");
}

export type FieldErrors = Record<string, string>;

/** Valida as perguntas VISÍVEIS de uma etapa, incluindo obrigatoriedade. */
export function validateStep(step: QuestionnaireStep, answers: AnswerMap, ctx: QuestionnaireContext = {}): FieldErrors {
  const errors: FieldErrors = {};
  for (const q of visibleQuestions(step, answers)) {
    const res = checkAnswer(q, answers[q.key], ctx);
    if (!res.ok) errors[q.key] = res.error;
    else if (q.required && q.input === "matrix") {
      const missing = missingMatrixRows(q, res.value).length;
      if (missing > 0) {
        errors[q.key] = missing === 1 ? "Falta responder 1 linha." : `Faltam responder ${missing} linhas.`;
      }
    } else if (q.required && res.value === null) {
      errors[q.key] = q.input === "multi" || q.input === "choice" ? "Escolha uma opção." : "Campo obrigatório.";
    }
  }
  return errors;
}

export type QuestionnaireValidation =
  | { ok: true }
  | { ok: false; errors: FieldErrors; firstStepId: string; firstKey: string };

/** Valida o questionário inteiro das seções (envio). Aponta a primeira etapa com problema. */
export function validateQuestionnaire(
  sections: readonly string[] | null | undefined,
  answers: AnswerMap,
  ctx: QuestionnaireContext = {}
): QuestionnaireValidation {
  const all: FieldErrors = {};
  let firstStepId: string | null = null;
  let firstKey: string | null = null;
  for (const step of stepsFor(sections)) {
    const errs = validateStep(step, answers, ctx);
    const keys = Object.keys(errs);
    if (keys.length > 0 && firstStepId === null) {
      firstStepId = step.id;
      firstKey = keys[0];
    }
    Object.assign(all, errs);
  }
  if (firstStepId === null || firstKey === null) return { ok: true };
  return { ok: false, errors: all, firstStepId, firstKey };
}

export type SplitAnswers = { answers: AnswerMap; sensitive_answers: AnswerMap };

/**
 * Limpa as respostas para gravar (rascunho ou envio): só chaves do catálogo nas seções pedidas,
 * só perguntas visíveis, valores normalizados; inválidas e vazias são descartadas (o rascunho
 * aceita parcial). Divide em `answers` / `sensitive_answers` pelo flag `sensitive`.
 */
export function sanitizeAnswers(
  sections: readonly string[] | null | undefined,
  raw: Record<string, unknown> | null | undefined,
  ctx: QuestionnaireContext = {}
): SplitAnswers {
  const input: Record<string, unknown> = raw && typeof raw === "object" ? raw : {};
  // 1ª passada: valores normalizados (para as condições de visibilidade usarem valores limpos)
  const normalized: AnswerMap = {};
  const steps = stepsFor(sections);
  for (const step of steps) {
    for (const q of step.questions) {
      const res = checkAnswer(q, input[q.key], ctx);
      if (res.ok && res.value !== null) normalized[q.key] = res.value;
    }
  }
  const out: SplitAnswers = { answers: {}, sensitive_answers: {} };
  for (const step of steps) {
    for (const q of step.questions) {
      if (!(q.key in normalized) || !isQuestionVisible(q, normalized)) continue;
      (q.sensitive ? out.sensitive_answers : out.answers)[q.key] = normalized[q.key];
    }
  }
  return out;
}

/** Junta as duas colunas lidas do banco num mapa só (para o formulário / a leitura). */
export function mergeStoredAnswers(answers: unknown, sensitive: unknown): AnswerMap {
  const out: AnswerMap = {};
  for (const src of [answers, sensitive]) {
    if (!isPlainObject(src)) continue;
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
      else if (Array.isArray(v) && v.every((x) => typeof x === "string")) out[k] = v as string[];
      else if (isPlainObject(v) && Object.values(v).every((x) => typeof x === "string")) {
        out[k] = v as Record<string, string>;
      }
    }
  }
  return out;
}

/** Campos copiados para `clients` no envio (só onde ainda estiverem vazios — regra da RPC). */
export function profileFieldsFrom(answers: AnswerMap): {
  heightCm: number | null;
  birthDate: string | null;
  gender: "feminino" | "masculino" | null;
} {
  const h = answers.height_cm;
  const b = answers.birth_date;
  const g = answers.gender;
  return {
    heightCm: typeof h === "number" && Number.isFinite(h) ? Math.round(h) : null,
    birthDate: typeof b === "string" && isRealDate(b) ? b : null,
    gender: g === "feminino" || g === "masculino" ? g : null,
  };
}

/** `current_step` gravado quando o aluno chegou à revisão final (não é uma etapa do catálogo). */
export const REVIEW_STEP_ID = "review";

/** `current_step` aceitável para as seções (etapa do catálogo ou a revisão); senão `null`. */
export function normalizeCurrentStep(sections: readonly string[] | null | undefined, step: unknown): string | null {
  if (typeof step !== "string") return null;
  if (step === REVIEW_STEP_ID) return step;
  return stepsFor(sections).some((s) => s.id === step) ? step : null;
}

/** Índice para retomar (`current_step` salvo); revisão = `steps.length`; desconhecida → 0. */
export function resumeStepIndex(steps: readonly QuestionnaireStep[], currentStep: string | null | undefined): number {
  if (currentStep === REVIEW_STEP_ID) return steps.length;
  const i = currentStep ? steps.findIndex((s) => s.id === currentStep) : -1;
  return i >= 0 ? i : 0;
}

// ---------------------------------------------------------------------------------------------
// Exibição
// ---------------------------------------------------------------------------------------------

const NUMBER_FMT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export const NOT_ANSWERED = "Não respondido";

/** Grade agrupada por coluna, da MAIOR frequência para a menor (o que mais importa primeiro). */
export type MatrixSummary = { value: string; label: string; rows: string[] }[];

export function summarizeMatrix(key: string, value: unknown): MatrixSummary {
  const q = QUESTION_BY_KEY.get(key);
  if (!q || q.input !== "matrix" || !isPlainObject(value)) return [];
  const rows = q.rows ?? [];
  return [...(q.options ?? [])]
    .reverse()
    .map((col) => ({
      value: col.value,
      label: col.label,
      rows: rows.filter((r) => value[r.value] === col.value).map((r) => r.label),
    }))
    .filter((g) => g.rows.length > 0);
}

/** Texto legível de uma resposta (tela "respostas enviadas" e coach). Vazio → "Não respondido". */
export function formatAnswer(key: string, value: unknown, ctx: QuestionnaireContext = {}): string {
  if (isEmptyAnswer(value)) return NOT_ANSWERED;
  const q = QUESTION_BY_KEY.get(key);
  const options = q?.options ?? LEGACY_QUESTIONS[key]?.options;
  const optLabel = (v: string) => options?.find((o) => o.value === v)?.label ?? v;
  if (q?.input === "matrix") {
    const groups = summarizeMatrix(key, value);
    return groups.length ? groups.map((g) => `${g.label}: ${g.rows.join(", ")}`).join(" · ") : NOT_ANSWERED;
  }
  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(" · ");
  }
  if (Array.isArray(value)) return value.map((v) => optLabel(String(v))).join(", ");
  if (!q) return optLabel(String(value));
  switch (q.input) {
    case "number": {
      const n = typeof value === "number" ? value : parseNumber(value);
      return n === null ? String(value) : `${NUMBER_FMT.format(n)}${q.unit ? ` ${q.unit}` : ""}`;
    }
    case "choice":
      return optLabel(String(value));
    case "date": {
      const s = String(value);
      if (!isRealDate(s)) return s;
      if (q.key === "birth_date") {
        const age = ageOn(s, ctx.today ?? systemToday());
        return age === null ? formatDateBR(s) : `${formatDateBR(s)} (${age} anos)`;
      }
      return formatDateBR(s);
    }
    default:
      return String(value);
  }
}

export type AnswerItem = {
  key: string;
  label: string;
  value: string;
  sensitive: boolean;
  /** Só para grades: linhas agrupadas por coluna (maior frequência primeiro). */
  matrix?: MatrixSummary;
};

export type AnswerGroup = {
  section: QuestionnaireSection;
  label: string;
  steps: {
    id: string;
    title: string;
    items: AnswerItem[];
  }[];
};

export type DisplayOptions = QuestionnaireContext & {
  /** Esconde perguntas sem resposta (útil para envios de versões antigas do catálogo). */
  hideEmpty?: boolean;
};

/**
 * Respostas agrupadas por seção/etapa para leitura. Mostra as perguntas visíveis com as respostas
 * dadas; chaves que não estão mais no catálogo (versão antiga) entram em `extra` ("Outras
 * respostas"), com o rótulo e a sensibilidade de `LEGACY_QUESTIONS` quando conhecidos.
 */
export function groupAnswersForDisplay(
  sections: readonly string[] | null | undefined,
  answers: AnswerMap,
  opts: DisplayOptions = {}
): { groups: AnswerGroup[]; extra: AnswerItem[] } {
  const groups: AnswerGroup[] = [];
  const shown = new Set<string>();
  for (const section of normalizeSections(sections)) {
    // Seção sem etapas no catálogo atual (Treino da v1): as respostas dela vão para `extra`.
    if (!QUESTIONNAIRE_STEPS.some((s) => s.section === section)) continue;
    const steps = QUESTIONNAIRE_STEPS.filter((s) => s.section === section).map((step) => ({
      id: step.id,
      title: step.title,
      items: visibleQuestions(step, answers)
        .filter((q) => !opts.hideEmpty || !isEmptyAnswer(answers[q.key]))
        .map((q): AnswerItem => {
          shown.add(q.key);
          const item: AnswerItem = {
            key: q.key,
            label: q.label,
            value: formatAnswer(q.key, answers[q.key], opts),
            sensitive: q.sensitive === true,
          };
          if (q.input === "matrix") item.matrix = summarizeMatrix(q.key, answers[q.key]);
          return item;
        }),
    }));
    groups.push({ section, label: SECTION_META[section].label, steps: steps.filter((s) => s.items.length > 0) });
  }
  const extra = Object.keys(answers)
    .filter((k) => !shown.has(k) && !QUESTION_BY_KEY.has(k))
    .map((k): AnswerItem => ({
      key: k,
      label: LEGACY_QUESTIONS[k]?.label ?? k,
      value: formatAnswer(k, answers[k], opts),
      sensitive: LEGACY_QUESTIONS[k]?.sensitive === true,
    }));
  return { groups, extra };
}
