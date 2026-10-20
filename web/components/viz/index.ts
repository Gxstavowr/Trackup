/**
 * Blocos de visualização da V5 (linguagem da referência docs/v5-referencia-vega.png).
 * Todos recebem dados REAIS já calculados por quem chama — nenhum traz dado de exemplo.
 *
 *  StatCard / KpiRow   linha de indicadores (valor grande, rótulo, apoio, delta)
 *  StatusDonut         distribuição por situação + legenda (% e valor)
 *  ProgressRing        anel de progresso (fração real), centro customizável
 *  AreaChart           série temporal escura com ponto destacado (client)
 *  UpdatedAtStrip      faixa "Detalhes · última atualização: 15h32"
 *  MeterBar            barra de medição (meta x realizado) com preenchimento animado
 *  StepStrip           linha do tempo horizontal de etapas (feito / atual / a fazer)
 *  Segmented / Tabs    (em components/ui) — pílulas com seleção clara
 */
export { StatCard, KpiRow } from "./stat-card";
export { StatusDonut, type DonutSegment } from "./status-donut";
export { ProgressRing } from "./progress-ring";
export { AreaChart, type AreaPoint, type AreaValueFormat } from "./area-chart";
export { UpdatedAtStrip } from "./updated-at";
export { TONE_COLOR, TONE_TEXT, formatPercent, type VizTone } from "./tones";
export { MeterBar } from "./meter-bar";
export { StepStrip, type StripStep, type StepState } from "./step-strip";
