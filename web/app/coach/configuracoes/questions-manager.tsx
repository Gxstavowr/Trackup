"use client";

import { useActionState, useEffect, useState } from "react";
import { Badge, Button, Field, Icon, Input, Modal, Select, Textarea } from "@/components/ui";
import type { SettingsFormState } from "./actions";
import { moveQuestionAction, removeQuestionAction, saveQuestionAction } from "./question-actions";
import { HELP_TEXT_MAX_LENGTH, getCatalogQuestion, specForQuestion } from "@/lib/checkin-catalog";

export type ManagedQuestion = {
  id: string;
  key: string;
  label: string;
  type: string;
  unit: string | null;
  /** `checkin_questions.help_text`: ajuda curta que o aluno vê abaixo da pergunta. */
  helpText: string | null;
  required: boolean;
  step: string; // body | food | training | wellbeing
  answered: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  number: "Número",
  scale: "Escala de 1 a 5",
  text: "Texto livre",
  boolean: "Sim ou não",
  select: "Escolha",
  photos: "Fotos",
  "scale+text": "Escala e texto",
  "number+text": "Número e texto",
  stepper: "Contador",
};
/** Controle real das perguntas do catálogo do sistema (lib/checkin-catalog.ts). */
const INPUT_LABEL: Record<string, string> = {
  number: "Número",
  scale: "Escala de 1 a 5",
  choice: "Escolha",
  multi: "Múltipla escolha",
  toggle: "Sim ou não",
  text: "Texto livre",
  date: "Data",
};
function typeLabel(q: { key: string; type: string; unit: string | null }): string {
  return getCatalogQuestion(q.key) ? INPUT_LABEL[specForQuestion(q).input] : (TYPE_LABEL[q.type] ?? q.type);
}
const CONDITION_TEXT: Record<string, string> = {
  cardio_days: "Só aparece se o aluno fez cardio.",
  cardio_minutes: "Só aparece se o aluno fez cardio.",
  menstrual_cycle:
    "Aparece para alunas e para quem não tem o sexo informado (com a opção “Não se aplica”). Não aparece para alunos do sexo masculino — ajuste no perfil do aluno.",
  substances_types: "Só aparece se o aluno respondeu Sim ao uso de hormônios, estimulantes ou peptídeos.",
  substances_dose: "Só aparece se o aluno respondeu Sim ao uso de hormônios, estimulantes ou peptídeos.",
  substances_effects: "Só aparece se o aluno respondeu Sim ao uso de hormônios, estimulantes ou peptídeos.",
  blood_test_date: "Só aparece se o aluno marcou hormônios.",
};

const STEP_LABEL: Record<string, string> = {
  body: "Peso e Fotos",
  food: "Alimentação",
  training: "Treino",
  wellbeing: "Bem-estar",
};

const isCustom = (q: { key: string }) => q.key.startsWith("q_");
/** Peso: obrigatório em todo check-in (o servidor também trava — `question-actions.ts`). */
const isLockedRequired = (q: { key: string }) => q.key === "weight_kg";

/** Orientação do campo "Texto de ajuda" (ajuda padrão do catálogo e aviso de privacidade). */
function helpFieldHint(question: ManagedQuestion | null): string {
  const base = `Aparece em letra menor abaixo da pergunta. Até ${HELP_TEXT_MAX_LENGTH} caracteres.`;
  const cat = question ? getCatalogQuestion(question.key) : undefined;
  if (!cat?.help) return base;
  if (cat.sensitive) return `${base} O aviso “${cat.help}” continua aparecendo depois do seu texto.`;
  return `${base} Em branco, o aluno vê a ajuda padrão: “${cat.help}”`;
}

function Alert({ state }: { state: SettingsFormState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger-text">
      {state.error}
    </p>
  );
}

function QuestionForm({
  question,
  onDone,
}: {
  question: ManagedQuestion | null;
  onDone: (message: string) => void;
}) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(saveQuestionAction, null);
  const system = !!question && !isCustom(question);
  const [type, setType] = useState(question?.type ?? "scale");

  useEffect(() => {
    if (state?.ok) onDone(state.ok);
  }, [state, onDone]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={question?.id ?? ""} />
      <Field label="Pergunta" helper="É o texto que o aluno lê no check-in.">
        <Input name="label" defaultValue={question?.label ?? ""} required minLength={3} maxLength={140} />
      </Field>
      <Field
        label="Texto de ajuda (opcional)"
        helper={helpFieldHint(question)}
      >
        <Textarea name="help_text" defaultValue={question?.helpText ?? ""} rows={2} maxLength={HELP_TEXT_MAX_LENGTH} />
      </Field>

      {system ? (
        <p className="flex items-start gap-2 rounded-md bg-info-tint px-3 py-2 text-sm text-ink-muted">
          <span className="mt-0.5 shrink-0 text-info" aria-hidden>
            <Icon name="info" size={16} />
          </span>
          <span className="flex flex-col gap-1.5">
            <span>
              Esta é uma pergunta do sistema ({typeLabel(question)}). Ela alimenta a avaliação, a evolução e os sinais
              do aluno, então só o texto, a ajuda e a obrigatoriedade podem mudar. O tipo, as opções e a etapa ficam fixos para
              os gráficos e comparações continuarem funcionando.
            </span>
            {specForQuestion(question).options.length > 0 && (
              <span>Opções: {specForQuestion(question).options.map((o) => o.label).join(" · ")}.</span>
            )}
            {CONDITION_TEXT[question.key] && <span>{CONDITION_TEXT[question.key]}</span>}
            {getCatalogQuestion(question.key)?.sensitive && (
              <span>
                Resposta sensível: aparece só no check-in e na lista de respostas da avaliação deste aluno — nunca em
                resumos, notificações ou mensagens.
              </span>
            )}
          </span>
        </p>
      ) : (
        <>
          <Field label="Tipo de resposta">
            <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="scale">Escala de 1 a 5</option>
              <option value="number">Número</option>
              <option value="boolean">Sim ou não</option>
              <option value="text">Texto livre</option>
            </Select>
          </Field>
          {type === "number" && (
            <Field label="Unidade (opcional)" helper="Ex.: kg, cm, horas, litros.">
              <Input name="unit" defaultValue={question?.unit ?? ""} maxLength={12} />
            </Field>
          )}
          <Field label="Etapa do check-in">
            <Select name="step" defaultValue={question?.step ?? "wellbeing"}>
              {Object.entries(STEP_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      {question && isLockedRequired(question) ? (
        <div className="flex flex-col gap-1">
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-ink-muted">
            <input type="checkbox" checked disabled readOnly className="size-5 accent-[var(--brand)]" />
            Resposta obrigatória
            <Badge tone="accent">Obrigatório</Badge>
          </label>
          <p className="text-xs text-ink-faint">O peso é obrigatório em todo check-in e não pode ficar opcional.</p>
        </div>
      ) : (
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-ink">
          <input type="checkbox" name="required" defaultChecked={question?.required ?? false} className="size-5 accent-[var(--brand)]" />
          Resposta obrigatória
        </label>
      )}

      {question && !system && question.answered && (
        <p className="flex items-start gap-2 rounded-md bg-info-tint px-3 py-2 text-sm text-ink-muted">
          <span className="mt-0.5 shrink-0 text-info" aria-hidden>
            <Icon name="info" size={16} />
          </span>
          Esta pergunta já tem respostas. Se você mudar o texto, o tipo ou a unidade, criamos uma nova versão e
          arquivamos a atual: os check-ins já enviados continuam mostrando a pergunta original.
        </p>
      )}

      <Alert state={state} />
      <Button type="submit" disabled={pending} width="mobile" className="self-start">
        {pending ? "Salvando…" : question ? "Salvar pergunta" : "Adicionar pergunta"}
      </Button>
    </form>
  );
}

function RemoveForm({ question, onDone }: { question: ManagedQuestion; onDone: (message: string) => void }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(removeQuestionAction, null);
  useEffect(() => {
    if (state?.ok) onDone(state.ok);
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={question.id} />
      <p className="text-sm text-ink-muted">
        “{question.label}” deixa de aparecer nos próximos check-ins.{" "}
        {question.answered
          ? "Como já tem respostas, ela será arquivada: nada do que os alunos enviaram é apagado."
          : "Ninguém respondeu ainda, então ela será excluída."}
      </p>
      <Alert state={state} />
      <Button type="submit" variant="danger" disabled={pending} width="mobile" className="self-start">
        {pending ? "Removendo…" : question.answered ? "Arquivar pergunta" : "Excluir pergunta"}
      </Button>
    </form>
  );
}

export default function QuestionsManager({
  questions,
  archived,
}: {
  questions: ManagedQuestion[];
  archived: ManagedQuestion[];
}) {
  const [editing, setEditing] = useState<ManagedQuestion | "new" | null>(null);
  const [removing, setRemoving] = useState<ManagedQuestion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const finish = (message: string) => {
    setEditing(null);
    setRemoving(null);
    setNotice(message);
  };

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p role="status" className="tk-fade rounded-md border border-success/30 bg-success-tint px-3 py-2 text-sm text-success">
          {notice}
        </p>
      )}

      <ol className="flex flex-col divide-y divide-line rounded-md border border-line">
        {questions.map((q, i) => (
          <li key={q.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-ink">
                <span className="mr-2 tabular-nums text-ink-faint">{i + 1}.</span>
                {q.label}
              </p>
              {q.helpText && <p className="mt-0.5 text-xs text-ink-muted">{q.helpText}</p>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge>{typeLabel(q)}</Badge>
                {(specForQuestion(q).unit ?? q.unit) && <Badge>{specForQuestion(q).unit ?? q.unit}</Badge>}
                <Badge>{STEP_LABEL[q.step]}</Badge>
                {(q.required || isLockedRequired(q)) && <Badge tone="accent">Obrigatória</Badge>}
                {!isCustom(q) && <Badge tone="info">Sistema</Badge>}
                {CONDITION_TEXT[q.key] && <Badge>Condicional</Badge>}
                {getCatalogQuestion(q.key)?.sensitive && <Badge tone="warning">Sensível</Badge>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              {(["up", "down"] as const).map((dir) => (
                <form key={dir} action={moveQuestionAction}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="dir" value={dir} />
                  <button
                    type="submit"
                    disabled={dir === "up" ? i === 0 : i === questions.length - 1}
                    aria-label={`${dir === "up" ? "Subir" : "Descer"} a pergunta ${i + 1}`}
                    className="flex size-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-30"
                  >
                    <span className={dir === "up" ? "rotate-180" : ""}>
                      <Icon name="chevron-down" size={18} />
                    </span>
                  </button>
                </form>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setEditing(q)}>
                Editar
              </Button>
              {isCustom(q) && (
                <button
                  type="button"
                  onClick={() => setRemoving(q)}
                  aria-label={`Remover a pergunta ${i + 1}`}
                  className="flex size-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-danger-tint hover:text-danger-text"
                >
                  <Icon name="trash" size={18} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      <Button icon="plus" variant="secondary" onClick={() => setEditing("new")} width="mobile" className="self-start">
        Adicionar pergunta
      </Button>

      <p className="text-xs text-ink-muted">
        As perguntas marcadas como “Sistema” (peso, aderência, energia, observações…) alimentam a avaliação e a
        evolução dos alunos; por isso não podem ser removidas nem trocar de tipo. Mudanças valem para os check-ins
        ainda abertos; os já enviados não são alterados.
      </p>

      {archived.length > 0 && (
        <details className="rounded-md border border-line px-4 py-3">
          <summary className="min-h-6 cursor-pointer text-sm font-semibold text-ink">
            Perguntas arquivadas ({archived.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-muted">
            {archived.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0">{q.label}</span>
                <Badge tone="warning">Arquivada</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-faint">
            Não aparecem em novos check-ins, mas as respostas antigas continuam visíveis na avaliação.
          </p>
        </details>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" || editing === null ? "Nova pergunta" : "Editar pergunta"}
      >
        <QuestionForm key={editing === "new" ? "new" : (editing?.id ?? "none")} question={editing === "new" ? null : editing} onDone={finish} />
      </Modal>
      <Modal open={removing !== null} onClose={() => setRemoving(null)} title="Remover pergunta">
        {removing && <RemoveForm question={removing} onDone={finish} />}
      </Modal>
    </div>
  );
}
