/**
 * Classes de layout do kanban (e do card compacto) compartilhadas pelos componentes reais
 * (`TaskBoard`, `TaskColumn`, `TaskCard`, `TaskCompactCard`) e pelo skeleton de carregamento
 * (`TasksSkeleton`): mudar aqui muda os dois, e o carregamento continua com as dimensões do
 * resultado final.
 */

/** Área do quadro: ocupa a altura que sobra na página e rola para os lados (a sangria fica com quem usa). */
export const KANBAN_BOARD_CLASS = "flex min-h-0 flex-1 gap-3 overflow-x-auto pb-3"

/** Coluna: 290px no desktop; no celular, quase a largura da tela com altura fixa de 80vh. */
export const KANBAN_COLUMN_CLASS = "flex w-[290px] max-md:h-[80vh] max-md:w-[85vw] max-md:max-w-[300px] flex-col rounded-lg border border-t-4 bg-muted/40 p-2"

/** Cabeçalho da coluna: título + contador e a faixa de seleção/descrição. */
export const KANBAN_COLUMN_HEADER_CLASS = "mb-2 flex flex-col gap-1.5 border-b px-1 pb-2"

/** Faixa abaixo do título da coluna (seleção e descrição). */
export const KANBAN_COLUMN_META_CLASS = "flex h-7 items-center gap-2 rounded-md border border-border/60 bg-muted/60 px-1.5"

/** Área dos cards da coluna. */
export const KANBAN_COLUMN_CARDS_CLASS = "flex min-h-[200px] max-md:min-h-0 flex-1 basis-0 flex-col"

/** Base do card de tarefa do kanban. */
export const KANBAN_CARD_CLASS = "rounded-md border bg-card p-2.5 shadow-xs"

/** Base do card compacto (visão Tabela no celular). */
export const COMPACT_CARD_CLASS = "w-full rounded-lg border bg-card p-3 text-left"
