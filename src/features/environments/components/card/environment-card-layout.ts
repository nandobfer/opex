/**
 * Classes do card de ambiente (dono e portal, OPE-211), compartilhadas com o skeleton para ele ter a mesma
 * estrutura e as mesmas dimensões.
 */

export const ENV_CARD_CLASS = "overflow-hidden"
export const ENV_CARD_HEADER_CLASS = "flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between"
export const ENV_CARD_TITLE_CLASS = "flex min-w-0 flex-1 items-start gap-3"
export const ENV_CARD_ACTIONS_CLASS = "flex shrink-0 flex-wrap items-center gap-2"
export const ENV_CARD_SECTION_CLASS = "border-t px-4 py-3"
export const ENV_CARD_FOOTER_CLASS = "flex flex-col gap-1 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
export const ENV_CARD_LIST_CLASS = "space-y-3"

/** Colunas dos containers no `md` (Serviço · Situação · Portas · Recursos); abaixo, cada um vira um bloco empilhado. */
export const CONTAINER_GRID = {
    // Recursos com as barras (CPU, RAM, swap e disco; OPE-211): coluna fixa de 14rem para caber o detalhe.
    owner: "md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,2fr)_14rem] md:items-center md:gap-4",
    portal: "md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,2fr)] md:items-center md:gap-4",
} as const

export const CONTAINER_ROW_CLASS = "flex flex-col gap-1.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40 md:py-1.5"
/** Barras de uso da coluna Recursos (empilhadas) e da faixa "Uso do ambiente" (grade). */
export const CONTAINER_USAGE_CLASS = "min-w-0 flex-1 space-y-1.5"
export const ENV_USAGE_SUMMARY_CLASS = "mb-3 rounded-lg border bg-muted/20 px-3 py-2.5"
export const ENV_USAGE_GRID_CLASS = "grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 md:grid-cols-4"

export const CONTAINER_HEAD_CLASS = "hidden px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
