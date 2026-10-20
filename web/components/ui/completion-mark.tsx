/**
 * Marca de conclusão (V5, item 2): círculo verde que "salta" (`.tk-pop`), solta um pulso
 * (`.tk-success`) e desenha o ✓ (`.tk-check-draw`) — uma vez só, ao montar. Usar quando algo
 * IMPORTANTE acaba de ser concluído: treino finalizado, check-in enviado, avaliação concluída.
 * Com movimento reduzido aparece pronta, sem animação. Decorativa (`aria-hidden`): o texto de
 * confirmação ao lado é quem informa o estado.
 *
 * `soft`: fundo translúcido verde com ✓ verde (para cartões claros); padrão = verde sólido.
 * `animate={false}`: mesma marca estática (ex.: estado já concluído ao recarregar a página).
 */
export function CompletionMark({
  size = 56,
  soft = false,
  animate = true,
  className = "",
}: {
  size?: number;
  soft?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const icon = Math.round(size * 0.5);
  return (
    <span
      aria-hidden
      className={`${animate ? "tk-success" : ""} inline-flex shrink-0 items-center justify-center self-start rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        className={`${animate ? "tk-pop" : ""} flex size-full items-center justify-center rounded-full ${
          soft ? "bg-success-tint text-success" : "bg-success text-on-accent"
        }`}
      >
        <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" className={animate ? "tk-check-draw" : ""} />
        </svg>
      </span>
    </span>
  );
}
