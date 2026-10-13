"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { changePasswordAction, updateProfileAction, type SettingsFormState } from "./actions";

function Feedback({ state }: { state: SettingsFormState }) {
  if (!state) return null;
  return state.error ? (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger-text">
      {state.error}
    </p>
  ) : (
    <p role="status" className="tk-fade rounded-md border border-success/30 bg-success-tint px-3 py-2 text-sm text-success">
      {state.ok}
    </p>
  );
}

export function ProfileForm({
  name,
  accountName,
  niche,
}: {
  name: string;
  accountName: string;
  niche: string;
}) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(updateProfileAction, null);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Field label="Seu nome">
        <Input name="name" defaultValue={name} required minLength={2} maxLength={80} autoComplete="name" />
      </Field>
      <Field label="Nome da marca ou consultoria" helper="Aparece na identificação da sua conta.">
        <Input name="accountName" defaultValue={accountName} required minLength={2} maxLength={80} />
      </Field>
      <Field label="Nicho de atuação (opcional)" helper="Ex.: emagrecimento, hipertrofia, corrida.">
        <Input name="niche" defaultValue={niche} maxLength={60} />
      </Field>
      <Feedback state={state} />
      <Button type="submit" disabled={pending} width="mobile" className="self-start">
        {pending ? "Salvando…" : "Salvar perfil"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(changePasswordAction, null);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Field label="Nova senha" helper="Mínimo de 8 caracteres.">
        <Input type="password" name="password" required minLength={8} maxLength={72} autoComplete="new-password" />
      </Field>
      <Field label="Repita a nova senha">
        <Input type="password" name="confirm" required minLength={8} maxLength={72} autoComplete="new-password" />
      </Field>
      <Feedback state={state} />
      <Button type="submit" variant="secondary" disabled={pending} width="mobile" className="self-start">
        {pending ? "Alterando…" : "Alterar senha"}
      </Button>
    </form>
  );
}
