/**
 * Leiaute da página Novo/Editar ambiente (OPE-211), compartilhado com o skeleton para os dois terem as
 * mesmas colunas e larguras.
 */

/** Índice das seções à esquerda (no `lg`) e as seções à direita. */
export const EDITOR_GRID = "grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]"
/** Coluna das seções (uma embaixo da outra). */
export const EDITOR_SECTIONS = "flex min-w-0 flex-col gap-6"
/** Serviços do compose: lista à esquerda e o painel do serviço à direita (no `lg`). */
export const SERVICES_GRID = "grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]"
/** Linha da lista de serviços (o skeleton usa a mesma altura). */
export const SERVICE_LIST_ROW = "flex min-h-14 w-full flex-col items-start gap-1 rounded-lg px-3 py-2 text-left"
