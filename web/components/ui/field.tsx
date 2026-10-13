import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Campos de formulário. 16px de fonte (`text-base`) evita o zoom automático do iOS ao focar;
 * altura mínima de 44px. As constantes servem para quem precisa aplicar o estilo direto em um
 * elemento próprio (ex.: `<input>` dentro de um layout específico).
 */
/** Base sem cor de borda — para quem precisa trocar a borda por estado (ex.: erro de validação). */
export const inputBaseClass =
  "w-full min-w-0 min-h-11 rounded-md border bg-surface-sunken px-3 py-2 text-base text-ink " +
  "placeholder:text-ink-faint outline-none transition-colors " +
  "focus:border-brand focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-[invalid=true]:border-danger";

export const inputClass = `${inputBaseClass} border-line-control hover:border-ink-faint`;

/** Campo numérico compacto (série de treino: carga/reps). */
export const numberInputClass = inputClass.replace("w-full ", "") + " w-20 px-2 text-center";

export const textareaClass = `${inputClass} min-h-24 resize-y leading-relaxed`;

const CHEVRON =
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23b4b1a9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]";

export const selectClass = `${inputClass} appearance-none bg-no-repeat pr-9 ${CHEVRON} bg-[length:1.1rem] bg-[position:right_0.75rem_center]`;

export const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-ink";
export const helperClass = "text-xs font-normal text-ink-muted";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${textareaClass} ${className}`} {...rest} />;
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${selectClass} ${className}`} {...rest}>
      {children}
    </select>
  );
}

/** Rótulo + controle + ajuda opcional (`<label>` envolvendo o controle). */
export function Field({
  label,
  helper,
  children,
  className = "",
}: {
  label: string;
  helper?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`${labelClass} ${className}`}>
      <span>{label}</span>
      {children}
      {helper && <span className={helperClass}>{helper}</span>}
    </label>
  );
}
