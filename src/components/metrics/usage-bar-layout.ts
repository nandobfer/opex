/**
 * Classes da barra de consumo compacta (`UsageBar`/`UsageBars` com `compact`, OPE-218): rótulo e % numa linha
 * e, abaixo, uma faixa de altura fixa com a trilha ou o texto sem valor. Compartilhadas com os skeletons.
 */

/** Célula compacta: rótulo em cima, faixa da trilha embaixo. */
export const USAGE_BAR_COMPACT_CLASS = "min-w-0 space-y-0.5"
/** Linha do rótulo e do % na célula compacta. */
export const USAGE_BAR_COMPACT_LABEL_CLASS = "flex items-baseline justify-between gap-1 text-[10px] leading-3"
/** Faixa de altura fixa onde fica a trilha (`h-1.5`) ou o texto sem valor, para as células terem a mesma altura. */
export const USAGE_BAR_COMPACT_TRACK_ROW_CLASS = "flex h-2.5 items-center"
