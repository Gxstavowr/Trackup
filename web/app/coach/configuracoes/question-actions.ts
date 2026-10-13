"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCoach } from "../require-coach";
import type { SettingsFormState } from "./actions";
import { WEIGHT_QUESTION_KEY } from "@/lib/checkin-steps";
import { normalizeHelpText } from "@/lib/checkin-catalog";

// ---------------------------------------------------------------------------------------------
// Perguntas do check-in semanal (Configurações > Acompanhamento semanal)
//
// Modelo de dados: as respostas (`checkin_answers`) apontam para a pergunta pela CHAVE de texto
// (`question_key`), sem FK. Por isso:
//  - perguntas do sistema (chave fixa: weight_kg, adherence_pct, energy, notes…) alimentam
//    métricas, avaliação e evolução -> só rótulo/ajuda/obrigatória/ordem mudam; chave e tipo ficam;
//  - perguntas do coach têm chave `q_xxxxxxxxxx`; se já têm respostas, mudar texto/tipo/unidade
//    cria uma NOVA versão (chave nova) e arquiva a antiga (active=false) — as respostas antigas
//    seguem lendo o rótulo antigo na avaliação. Sem respostas, a pergunta é editada/excluída.
//    A ajuda (`help_text`, 0019) não muda o significado: é editada no lugar, sem versão nova.
// A policy `checkin_questions_by_template` já deixa o coach escrever; nada usa admin aqui.
// ---------------------------------------------------------------------------------------------

const PATH = "/coach/configuracoes";
// "boolean" = Sim ou não (controle de dois botões no check-in; resposta gravada como yes/no).
const TYPES = ["number", "scale", "boolean", "text"] as const;
// `tracks` é lido por lib/checkin-steps.ts para decidir a etapa do formulário do aluno.
const STEP_TRACKS: Record<string, string> = {
  body: "measures",
  food: "nutrition",
  training: "training",
  wellbeing: "emotional",
};
const MAX_ACTIVE_QUESTIONS = 30;

type Supa = Awaited<ReturnType<typeof createClient>>;
type QRow = {
  id: string;
  key: string;
  label: string;
  type: string;
  unit: string | null;
  help_text: string | null;
  tracks: string | null;
  required: boolean;
  sort_order: number;
};

const isCustomKey = (key: string) => key.startsWith("q_");
/** Perguntas que o coach não pode tornar opcionais (regra do produto: peso em todo check-in). */
const isLockedRequiredKey = (key: string) => key === WEIGHT_QUESTION_KEY;
const newKey = () => `q_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
const clean = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function loadTemplate() {
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("checkin_templates")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return { supabase, templateId: template?.id as string | undefined };
}

async function activeQuestions(supabase: Supa, templateId: string) {
  const { data } = await supabase
    .from("checkin_questions")
    .select("id, key, label, type, unit, help_text, tracks, required, sort_order")
    .eq("template_id", templateId)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as QRow[];
}

async function hasAnswers(supabase: Supa, key: string) {
  const { count } = await supabase
    .from("checkin_answers")
    .select("id", { count: "exact", head: true })
    .eq("question_key", key);
  return (count ?? 0) > 0;
}

function done(ok: string): SettingsFormState {
  revalidatePath(PATH);
  revalidatePath("/portal/checkin");
  return { ok };
}

/** Cria ou edita uma pergunta (id vazio = nova). */
export async function saveQuestionAction(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  await requireCoach();
  const id = String(formData.get("id") ?? "");
  const label = clean(formData.get("label"), 140);
  const type = String(formData.get("type") ?? "");
  const unit = clean(formData.get("unit"), 12);
  const step = String(formData.get("step") ?? "");
  const required = formData.get("required") === "on";
  // Ajuda curta abaixo da pergunta. Não muda o significado: editar só ela nunca cria versão nova.
  const helpText = normalizeHelpText(formData.get("help_text"));
  if (label.length < 3) return { error: "Escreva a pergunta (mínimo 3 letras)." };

  const { supabase, templateId } = await loadTemplate();
  if (!templateId) return { error: "Não encontramos o modelo de check-in da sua conta." };
  const list = await activeQuestions(supabase, templateId);

  if (!id) {
    if (!(TYPES as readonly string[]).includes(type)) return { error: "Escolha o tipo de resposta." };
    if (!STEP_TRACKS[step]) return { error: "Escolha em qual etapa a pergunta aparece." };
    if (list.length >= MAX_ACTIVE_QUESTIONS) {
      return { error: `O check-in aceita até ${MAX_ACTIVE_QUESTIONS} perguntas ativas.` };
    }
    const { error } = await supabase.from("checkin_questions").insert({
      template_id: templateId,
      key: newKey(),
      label,
      type,
      unit: type === "number" && unit ? unit : null,
      help_text: helpText,
      tracks: STEP_TRACKS[step],
      required,
      sort_order: list.reduce((m, q) => Math.max(m, q.sort_order), -1) + 1,
    });
    if (error) {
      console.error("Falha ao criar pergunta:", error.message);
      return { error: "Não foi possível salvar a pergunta." };
    }
    return done("Pergunta adicionada. Alunos com check-in aberto já a veem.");
  }

  const current = list.find((q) => q.id === id);
  if (!current) return { error: "Pergunta não encontrada." };

  // Pergunta do sistema: só rótulo, ajuda e obrigatória (chave/tipo/etapa alimentam métricas e avaliação).
  // O peso (V3) é SEMPRE obrigatório: o servidor ignora o checkbox e grava `required = true`.
  if (!isCustomKey(current.key)) {
    const { error } = await supabase
      .from("checkin_questions")
      .update({ label, help_text: helpText, required: isLockedRequiredKey(current.key) ? true : required })
      .eq("id", id)
      .eq("template_id", templateId);
    if (error) return { error: "Não foi possível salvar a pergunta." };
    return done("Pergunta atualizada.");
  }

  if (!(TYPES as readonly string[]).includes(type)) return { error: "Escolha o tipo de resposta." };
  if (!STEP_TRACKS[step]) return { error: "Escolha em qual etapa a pergunta aparece." };
  const newUnit = type === "number" && unit ? unit : null;
  const meaningChanged = label !== current.label || type !== current.type || newUnit !== current.unit;

  if (meaningChanged && (await hasAnswers(supabase, current.key))) {
    // Nova versão: a antiga fica arquivada e as respostas antigas continuam intactas.
    const { error: insErr } = await supabase.from("checkin_questions").insert({
      template_id: templateId,
      key: newKey(),
      label,
      type,
      unit: newUnit,
      help_text: helpText,
      tracks: STEP_TRACKS[step],
      required,
      sort_order: current.sort_order,
    });
    if (insErr) return { error: "Não foi possível salvar a pergunta." };
    const { error: arcErr } = await supabase
      .from("checkin_questions")
      .update({ active: false })
      .eq("id", id)
      .eq("template_id", templateId);
    if (arcErr) return { error: "Não foi possível arquivar a versão anterior." };
    return done("Nova versão criada. A anterior foi arquivada e as respostas antigas continuam salvas.");
  }

  const { error } = await supabase
    .from("checkin_questions")
    .update({ label, type, unit: newUnit, help_text: helpText, tracks: STEP_TRACKS[step], required })
    .eq("id", id)
    .eq("template_id", templateId);
  if (error) return { error: "Não foi possível salvar a pergunta." };
  return done("Pergunta atualizada.");
}

/** Sobe ou desce uma pergunta ativa (reescreve a ordem 0..n). */
export async function moveQuestionAction(formData: FormData): Promise<void> {
  await requireCoach();
  const id = String(formData.get("id") ?? "");
  const dir = formData.get("dir") === "up" ? -1 : 1;
  const { supabase, templateId } = await loadTemplate();
  if (!templateId) return;
  const list = await activeQuestions(supabase, templateId);
  const i = list.findIndex((q) => q.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(
    list.map((q, idx) =>
      q.sort_order === idx
        ? null
        : supabase.from("checkin_questions").update({ sort_order: idx }).eq("id", q.id).eq("template_id", templateId)
    )
  );
  revalidatePath(PATH);
  revalidatePath("/portal/checkin");
}

/** Remove: sem respostas -> exclui; com respostas -> arquiva. Perguntas do sistema não saem. */
export async function removeQuestionAction(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  await requireCoach();
  const id = String(formData.get("id") ?? "");
  const { supabase, templateId } = await loadTemplate();
  if (!templateId) return { error: "Modelo de check-in não encontrado." };
  const current = (await activeQuestions(supabase, templateId)).find((q) => q.id === id);
  if (!current) return { error: "Pergunta não encontrada." };
  if (!isCustomKey(current.key)) {
    return { error: "Perguntas do sistema não podem ser removidas: elas alimentam a avaliação e a evolução." };
  }
  if (await hasAnswers(supabase, current.key)) {
    const { error } = await supabase
      .from("checkin_questions")
      .update({ active: false })
      .eq("id", id)
      .eq("template_id", templateId);
    if (error) return { error: "Não foi possível arquivar a pergunta." };
    return done("Pergunta arquivada. As respostas já enviadas continuam salvas.");
  }
  const { error } = await supabase.from("checkin_questions").delete().eq("id", id).eq("template_id", templateId);
  if (error) return { error: "Não foi possível remover a pergunta." };
  return done("Pergunta removida.");
}
