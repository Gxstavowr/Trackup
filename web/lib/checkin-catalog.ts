/**
 * Catálogo de perguntas DO SISTEMA do check-in (V3, tarefas 4–6). Regras PURAS (sem I/O, sem
 * "server-only"), usadas pelo formulário do aluno (client), pelo servidor (validação no envio),
 * pelo cadastro do coach (template padrão), pelo script de upgrade e pela avaliação do coach.
 *
 * Por que em código: `checkin_questions` não tem coluna de opções, de condição nem de "sensível"
 * (docs/v3-audit.md §2/§7). Tudo isso mora aqui, por `key`. O banco guarda só key/label/type/
 * unit/required/sort_order; para chaves do catálogo:
 *  - o TEXTO (`label`) e a obrigatoriedade (`required`) continuam vindo do banco (o coach edita);
 *  - o tipo de controle, as opções, a unidade, os limites, a etapa, a condição e o flag
 *    sensível vêm SEMPRE do catálogo (o coach não consegue quebrar uma pergunta do sistema).
 * Perguntas criadas pelo coach (`q_…`) e chaves fora do catálogo seguem o tipo do banco
 * (`specForQuestion`).
 *
 * Sensível: respostas sobre ciclo menstrual e uso de hormônios/estimulantes/peptídeos são dados
 * de saúde (LGPD art. 11). Nunca vão para o rascunho local (localStorage), dashboards, resumos,
 * notificações ou textos de WhatsApp — só aparecem no próprio check-in e na lista de respostas da
 * avaliação individual do coach. Nenhuma conclusão médica é tirada delas.
 */

export type CatalogStepId = "body" | "food" | "training" | "wellbeing";

/** Controle de UI. `date` e `multi` são guardados no banco como `text`/`select`. */
export type CheckinInputKind = "number" | "scale" | "choice" | "multi" | "toggle" | "text" | "date";

export type CheckinOption = { value: string; label: string };

/** Sexo do aluno normalizado a partir de `clients.gender` (texto livre). */
export type CheckinGender = "female" | "male" | "unknown";

export type CheckinContext = {
  gender: CheckinGender;
  /** "Hoje" em YYYY-MM-DD (America/Sao_Paulo) — limite das datas. Ausente: data do sistema. */
  today?: string;
};

export const DEFAULT_CHECKIN_CONTEXT: CheckinContext = { gender: "unknown" };

export type CatalogQuestion = {
  key: string;
  /** Valor da coluna `checkin_questions.type` (CHECK do banco). */
  dbType: "number" | "scale" | "select" | "boolean" | "text";
  input: CheckinInputKind;
  /** Texto padrão (template novo / upgrade). O coach pode reescrever no banco. */
  label: string;
  /** Ajuda curta abaixo da pergunta. */
  help?: string;
  unit?: string;
  options?: CheckinOption[];
  /** `number`: limites e passo (passo 1 = inteiro; 0,1 = uma casa decimal). */
  min?: number;
  max?: number;
  step?: number;
  /** `text`: limite de caracteres. */
  maxLength?: number;
  /** Obrigatória por padrão (template novo / upgrade). Vale só quando a pergunta está visível. */
  required: boolean;
  stepId: CatalogStepId;
  sensitive?: boolean;
  /** Visível com estas respostas + contexto? Ausente = sempre visível. */
  visibleWhen?: (answers: Record<string, string>, ctx: CheckinContext) => boolean;
  /** Sempre por último dentro da etapa (ex.: observações), mesmo se acrescentada depois. */
  pinLast?: boolean;
};

export const YES = "yes";
export const NO = "no";
const TOGGLE_OPTIONS: CheckinOption[] = [
  { value: YES, label: "Sim" },
  { value: NO, label: "Não" },
];

/** Opção extra da pergunta de ciclo quando o sexo do aluno não foi informado. */
export const NOT_APPLICABLE = "not_applicable";

const has = (answers: Record<string, string>, key: string) => (answers[key] ?? "").trim() !== "";
const multiValues = (raw: string | undefined) =>
  (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const cardioDone = (a: Record<string, string>) => has(a, "cardio_type") && a.cardio_type.trim() !== "none";
/**
 * Sim/Não normalizado com a MESMA regra da validação (`checkin-steps#validateAnswer`, toggle):
 * "sim"/"true"/"YES" contam como sim, para uma variante aceita no envio nunca esconder follow-ups.
 */
const isYes = (raw: string | undefined) => ["yes", "sim", "true"].includes((raw ?? "").trim().toLowerCase());
const usesSubstances = (a: Record<string, string>) => isYes(a.substances_use);

/**
 * Ordem = ordem do template padrão. Chaves já existentes antes do V3: weight_kg, adherence_pct,
 * energy, notes. `water_l` e `sleep_h` também são chaves de `metrics` (viram gráfico).
 */
export const CHECKIN_CATALOG: CatalogQuestion[] = [
  // ---- Peso e fotos -------------------------------------------------------------------------
  {
    key: "weight_kg",
    dbType: "number",
    input: "number",
    label: "Peso atual",
    help: "Em jejum, de manhã, depois de ir ao banheiro.",
    unit: "kg",
    min: 20,
    max: 500,
    step: 0.01,
    required: true,
    stepId: "body",
  },
  // ---- Alimentação --------------------------------------------------------------------------
  {
    key: "adherence_pct",
    dbType: "scale",
    input: "scale",
    label: "De 1 a 5, quanto você conseguiu seguir a dieta nesta semana?",
    help: "1 = quase nada · 5 = seguiu tudo.",
    required: true,
    stepId: "food",
  },
  {
    key: "water_l",
    dbType: "number",
    input: "number",
    label: "Quanta água você bebeu por dia, em média?",
    help: "Uma estimativa já ajuda.",
    unit: "L",
    min: 0,
    max: 15,
    step: 0.1,
    required: false,
    stepId: "food",
  },
  // ---- Treino -------------------------------------------------------------------------------
  {
    key: "training_performance",
    dbType: "select",
    input: "choice",
    label: "Como foi o seu desempenho nos treinos?",
    help: "Comparado com uma semana normal sua.",
    options: [
      { value: "below", label: "Abaixo do normal" },
      { value: "usual", label: "Como sempre" },
      { value: "above", label: "Acima do normal" },
    ],
    required: false,
    stepId: "training",
  },
  {
    key: "training_loads",
    dbType: "select",
    input: "choice",
    label: "E as cargas e repetições?",
    options: [
      { value: "improved", label: "Melhoraram" },
      { value: "stable", label: "Estáveis" },
      { value: "worse", label: "Pioraram" },
    ],
    required: false,
    stepId: "training",
  },
  {
    key: "cardio_type",
    dbType: "select",
    input: "choice",
    label: "Qual cardio você fez?",
    help: "Se fez mais de um, escolha o principal.",
    options: [
      { value: "none", label: "Não fiz cardio" },
      { value: "walk", label: "Caminhada" },
      { value: "run", label: "Corrida" },
      { value: "bike", label: "Bicicleta" },
      { value: "stairs", label: "Escada ou elíptico" },
      { value: "hiit", label: "HIIT / intervalado" },
      { value: "other", label: "Outro" },
    ],
    required: false,
    stepId: "training",
  },
  {
    key: "cardio_days",
    dbType: "number",
    input: "number",
    label: "Em quantos dias da semana?",
    unit: "dias",
    min: 0,
    max: 7,
    step: 1,
    required: false,
    stepId: "training",
    visibleWhen: cardioDone,
  },
  {
    key: "cardio_minutes",
    dbType: "number",
    input: "number",
    label: "Quanto durou cada sessão, em média?",
    unit: "min",
    min: 0,
    max: 300,
    step: 1,
    required: false,
    stepId: "training",
    visibleWhen: cardioDone,
  },
  {
    key: "training_notes",
    dbType: "text",
    input: "text",
    label: "Quer comentar algo sobre os treinos?",
    help: "Dor, exercício que não encaixou, recorde… (opcional)",
    maxLength: 1000,
    required: false,
    stepId: "training",
  },
  // ---- Bem-estar ----------------------------------------------------------------------------
  {
    key: "sleep_h",
    dbType: "number",
    input: "number",
    label: "Quantas horas você dormiu por noite, em média?",
    unit: "h",
    min: 0,
    max: 24,
    step: 0.5,
    required: false,
    stepId: "wellbeing",
  },
  {
    key: "sleep_quality",
    dbType: "select",
    input: "choice",
    label: "Como foi a qualidade do sono?",
    options: [
      { value: "bad", label: "Ruim" },
      { value: "fair", label: "Regular" },
      { value: "good", label: "Boa" },
      { value: "great", label: "Ótima" },
    ],
    required: false,
    stepId: "wellbeing",
  },
  {
    key: "energy",
    dbType: "scale",
    input: "scale",
    label: "Nível de energia",
    help: "1 = muito cansado(a) · 5 = com muita disposição.",
    required: false,
    stepId: "wellbeing",
  },
  {
    key: "mood",
    dbType: "select",
    input: "choice",
    label: "Como você se sentiu emocionalmente nesta semana?",
    options: [
      { value: "great", label: "Muito bem" },
      { value: "good", label: "Bem" },
      { value: "oscillating", label: "Oscilando" },
      { value: "down", label: "Desanimado(a)" },
      { value: "anxious", label: "Estressado(a) ou ansioso(a)" },
    ],
    required: false,
    stepId: "wellbeing",
  },
  {
    key: "bowel_frequency",
    dbType: "select",
    input: "choice",
    label: "Com que frequência o seu intestino funcionou?",
    options: [
      { value: "more_daily", label: "Mais de 1 vez por dia" },
      { value: "daily", label: "1 vez por dia" },
      { value: "alternate", label: "Dia sim, dia não" },
      { value: "rare", label: "Menos que isso" },
    ],
    required: false,
    stepId: "wellbeing",
  },
  {
    key: "bloating",
    dbType: "select",
    input: "choice",
    label: "Sentiu inchaço ou desconforto digestivo?",
    options: [
      { value: "no", label: "Não" },
      { value: "sometimes", label: "Às vezes" },
      { value: "frequent", label: "Com frequência" },
    ],
    required: false,
    stepId: "wellbeing",
  },
  {
    key: "menstrual_cycle",
    dbType: "select",
    input: "choice",
    label: "Como está o seu ciclo menstrual nesta semana?",
    help: "Ajuda o coach a entender variações de peso e retenção. Fica só entre você e seu coach.",
    options: [
      { value: "no_period", label: "Não menstruei nesta semana" },
      { value: "period", label: "Menstruei nesta semana" },
      { value: "pms", label: "Estou no período pré-menstrual" },
      { value: "irregular", label: "Ciclo irregular ou atrasado" },
      { value: "no_cycle", label: "Não menstruo (contraceptivo, menopausa…)" },
    ],
    required: false,
    stepId: "wellbeing",
    sensitive: true,
    // Masculino: some. Feminino: aparece. Não informado: aparece com "Não se aplica".
    visibleWhen: (_a, ctx) => ctx.gender !== "male",
  },
  {
    key: "substances_use",
    dbType: "boolean",
    input: "toggle",
    label: "Você usa hormônios, estimulantes ou peptídeos?",
    help: "Fica só entre você e seu coach.",
    required: false,
    stepId: "wellbeing",
    sensitive: true,
  },
  {
    key: "substances_types",
    dbType: "select",
    input: "multi",
    label: "O que você usa?",
    help: "Marque tudo o que se aplica.",
    options: [
      { value: "hormones", label: "Hormônios" },
      { value: "stimulants", label: "Estimulantes" },
      { value: "peptides", label: "Peptídeos" },
    ],
    required: true,
    stepId: "wellbeing",
    sensitive: true,
    visibleWhen: usesSubstances,
  },
  {
    key: "substances_dose",
    dbType: "text",
    input: "text",
    label: "Quais e em que dose?",
    help: "Nome, dose e frequência, do jeito que você usa.",
    maxLength: 500,
    required: false,
    stepId: "wellbeing",
    sensitive: true,
    visibleWhen: usesSubstances,
  },
  {
    key: "substances_effects",
    dbType: "text",
    input: "text",
    label: "Percebeu algum efeito nesta semana?",
    help: "Qualquer coisa que você notou (opcional).",
    maxLength: 1000,
    required: false,
    stepId: "wellbeing",
    sensitive: true,
    visibleWhen: usesSubstances,
  },
  {
    key: "blood_test_date",
    dbType: "text",
    input: "date",
    label: "Data do último exame de sangue enviado",
    help: "Se nunca enviou, deixe em branco.",
    required: false,
    stepId: "wellbeing",
    sensitive: true,
    visibleWhen: (a) => usesSubstances(a) && multiValues(a.substances_types).includes("hormones"),
  },
  {
    key: "notes",
    dbType: "text",
    input: "text",
    label: "Quer contar mais alguma coisa ao seu coach?",
    help: "Algo que o coach deveria saber sobre a semana.",
    maxLength: 2000,
    required: false,
    stepId: "wellbeing",
    pinLast: true,
  },
];

const BY_KEY = new Map(CHECKIN_CATALOG.map((q) => [q.key, q]));

export function getCatalogQuestion(key: string): CatalogQuestion | undefined {
  return BY_KEY.get(key);
}

export function isSensitiveKey(key: string): boolean {
  return BY_KEY.get(key)?.sensitive === true;
}

export const SENSITIVE_CHECKIN_KEYS: ReadonlySet<string> = new Set(
  CHECKIN_CATALOG.filter((q) => q.sensitive).map((q) => q.key)
);

/** Remove as chaves sensíveis de um mapa de respostas (rascunho local). */
export function withoutSensitive(answers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(answers).filter(([k]) => !SENSITIVE_CHECKIN_KEYS.has(k)));
}

// ---------------------------------------------------------------------------------------------
// Sexo do aluno
// ---------------------------------------------------------------------------------------------

const FEMALE = new Set(["f", "fem", "feminino", "feminina", "female", "woman", "mulher"]);
const MALE = new Set(["m", "masc", "masculino", "male", "man", "homem"]);

/** `clients.gender` é texto livre: normaliza sem nunca inferir (nome não conta). */
export function normalizeGender(raw: string | null | undefined): CheckinGender {
  const v = (raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (FEMALE.has(v)) return "female";
  if (MALE.has(v)) return "male";
  return "unknown";
}

/** Valor gravado em `clients.gender` pelo select do coach ("" = não informado -> null). */
export const GENDER_FORM_OPTIONS: CheckinOption[] = [
  { value: "feminino", label: "Feminino" },
  { value: "masculino", label: "Masculino" },
  { value: "", label: "Não informado" },
];

// ---------------------------------------------------------------------------------------------
// Especificação efetiva de uma pergunta (catálogo ou derivada do tipo do banco)
// ---------------------------------------------------------------------------------------------

export type QuestionSpecInput = {
  key: string;
  type: string;
  unit?: string | null;
  /** `checkin_questions.help_text` (0019): ajuda escrita pelo coach. Ausente/nulo = sem ajuda própria. */
  help_text?: string | null;
};

export type QuestionSpec = {
  input: CheckinInputKind;
  unit: string | null;
  options: CheckinOption[];
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  maxLength: number;
  stepId?: CatalogStepId;
  sensitive: boolean;
  pinLast: boolean;
  catalog: CatalogQuestion | null;
};

export const MAX_TEXT_LENGTH = 2000;

/** Limite de `checkin_questions.help_text` (mesmo CHECK da migration 0019). */
export const HELP_TEXT_MAX_LENGTH = 200;

/**
 * Normaliza a ajuda digitada pelo coach para gravar no banco: espaços colapsados, corte em
 * `HELP_TEXT_MAX_LENGTH`, vazio -> `null` (o CHECK do banco não aceita string vazia).
 */
export function normalizeHelpText(raw: unknown): string | null {
  const collapsed = String(raw ?? "").replace(/\s+/g, " ").trim();
  // Por code point (como `char_length` do Postgres), sem partir emoji ao meio.
  const text = Array.from(collapsed).slice(0, HELP_TEXT_MAX_LENGTH).join("").trim();
  return text === "" ? null : text;
}

/**
 * Ajuda efetiva exibida ao aluno. A do coach (`help_text`) substitui a do catálogo — exceto em
 * pergunta SENSÍVEL, em que o aviso de privacidade do catálogo ("Fica só entre você e seu
 * coach.") nunca some: a ajuda do coach vem antes e o aviso continua depois.
 */
export function resolveQuestionHelp(
  catalogHelp: string | undefined,
  helpText: string | null | undefined,
  sensitive: boolean
): string | undefined {
  const own = (helpText ?? "").trim();
  if (!own) return catalogHelp;
  if (sensitive && catalogHelp && catalogHelp !== own) return `${own} ${catalogHelp}`;
  return own;
}

/**
 * Como renderizar/validar uma pergunta. Catálogo vence; fora dele, pelo tipo do banco:
 * number/scale como sempre, boolean vira Sim/Não (opções sempre deriváveis — é o tipo "Sim ou
 * não" que o coach cria em Configurações), e o resto (select sem opções conhecidas, stepper,
 * combos) continua texto livre — comportamento anterior. A ajuda vem de `resolveQuestionHelp`.
 */
export function specForQuestion(question: QuestionSpecInput, ctx: CheckinContext = DEFAULT_CHECKIN_CONTEXT): QuestionSpec {
  const cat = BY_KEY.get(question.key);
  if (cat) {
    let options = cat.options ?? (cat.input === "toggle" ? TOGGLE_OPTIONS : []);
    if (cat.key === "menstrual_cycle" && ctx.gender === "unknown") {
      options = [...options, { value: NOT_APPLICABLE, label: "Não se aplica" }];
    }
    return {
      input: cat.input,
      unit: cat.unit ?? null,
      options,
      help: resolveQuestionHelp(cat.help, question.help_text, cat.sensitive === true),
      min: cat.min,
      max: cat.max,
      step: cat.step,
      maxLength: cat.maxLength ?? MAX_TEXT_LENGTH,
      stepId: cat.stepId,
      sensitive: cat.sensitive === true,
      pinLast: cat.pinLast === true,
      catalog: cat,
    };
  }
  const base = {
    unit: question.unit ?? null,
    help: resolveQuestionHelp(undefined, question.help_text, false),
    maxLength: MAX_TEXT_LENGTH,
    sensitive: false,
    pinLast: false,
    catalog: null,
  };
  if (question.type === "number") return { ...base, input: "number", options: [], min: 0, max: 100000 };
  if (question.type === "scale") return { ...base, input: "scale", options: [] };
  if (question.type === "boolean") return { ...base, input: "toggle", options: TOGGLE_OPTIONS };
  return { ...base, input: "text", options: [] };
}

/** Visível com estas respostas e este contexto? Fora do catálogo: sempre. */
export function isQuestionVisible(
  key: string,
  answers: Record<string, string>,
  ctx: CheckinContext = DEFAULT_CHECKIN_CONTEXT
): boolean {
  const cat = BY_KEY.get(key);
  return cat?.visibleWhen ? cat.visibleWhen(answers, ctx) : true;
}

// ---------------------------------------------------------------------------------------------
// Formatação (revisão do aluno + avaliação do coach)
// ---------------------------------------------------------------------------------------------

function formatNumberPt(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function unitFor(unit: string | null, n: number): string | null {
  const u = unit?.trim();
  if (!u) return null;
  // "1 dias" -> "1 dia" (mesma regra de week-comparison-format#unitForValue).
  return n === 1 && /[oa]s$/i.test(u) && u.length > 3 ? u.slice(0, -1) : u;
}

/** "2026-03-07" -> "07/03/2026" (sem fuso). */
export function formatIsoDatePt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Resposta pronta para leitura: rótulo das opções (não o valor gravado), unidade, data em
 * dd/mm/aaaa, "x de 5". Valor desconhecido (resposta antiga, opção removida) aparece cru — nunca
 * some. Use em toda tela que lista respostas (revisão do check-in, avaliação do coach).
 */
export function formatCheckinAnswer(question: QuestionSpecInput, value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (raw === "") return "";
  const spec = specForQuestion(question, { gender: "unknown" });
  switch (spec.input) {
    case "scale":
      return /^\d+$/.test(raw) ? `${raw} de 5` : raw;
    case "number": {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n)) return raw;
      const u = unitFor(spec.unit, n);
      return `${formatNumberPt(n)}${u ? ` ${u}` : ""}`;
    }
    case "choice":
    case "toggle": {
      const option = spec.options.find((o) => o.value === raw);
      if (option) return option.label;
      if (spec.input === "toggle") {
        const v = raw.toLowerCase();
        if (["sim", "true", "s"].includes(v)) return "Sim";
        if (["nao", "não", "false", "n"].includes(v)) return "Não";
      }
      return raw;
    }
    case "multi":
      return multiValues(raw)
        .map((v) => spec.options.find((o) => o.value === v)?.label ?? v)
        .join(", ");
    case "date":
      return formatIsoDatePt(raw);
    default:
      return raw;
  }
}

// ---------------------------------------------------------------------------------------------
// Template padrão + upgrade idempotente
// ---------------------------------------------------------------------------------------------

/** Linha pronta para `insert` em `checkin_questions` (sem `template_id`). */
export type CatalogQuestionRow = {
  key: string;
  label: string;
  type: CatalogQuestion["dbType"];
  unit: string | null;
  required: boolean;
  sort_order: number;
};

function toRow(q: CatalogQuestion, sortOrder: number): CatalogQuestionRow {
  return {
    key: q.key,
    label: q.label,
    type: q.dbType,
    unit: q.unit ?? null,
    required: q.required,
    sort_order: sortOrder,
  };
}

/** Template padrão de uma conta nova: o catálogo inteiro, na ordem. */
export function defaultTemplateRows(): CatalogQuestionRow[] {
  return CHECKIN_CATALOG.map((q, i) => toRow(q, i));
}

/**
 * Perguntas do catálogo que faltam num template, por `key` — considera TODAS as perguntas do
 * template (ativas e arquivadas: uma chave arquivada não volta duplicada). Nunca altera nem
 * reordena as existentes: as novas entram depois da maior `sort_order`, na ordem do catálogo.
 * Pura e idempotente: aplicar o resultado e chamar de novo devolve `[]`.
 */
export function missingCatalogQuestions(
  existing: { key: string; sort_order: number | null }[]
): CatalogQuestionRow[] {
  const keys = new Set(existing.map((q) => q.key));
  let next = existing.reduce((max, q) => Math.max(max, q.sort_order ?? 0), -1) + 1;
  const rows: CatalogQuestionRow[] = [];
  for (const q of CHECKIN_CATALOG) {
    if (keys.has(q.key)) continue;
    rows.push(toRow(q, next++));
  }
  return rows;
}
