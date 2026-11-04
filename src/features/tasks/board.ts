import type { CSSProperties } from "react"
import { DEFAULT_COLUMN_COLOR, normalizeColor } from "@/lib/colors"

/**
 * Quadro de Tarefas dO Opex: colunas 100% configuráveis (o Opex é a fonte de verdade). Cada
 * tarefa pertence a UMA coluna. Módulo PURO (cliente e servidor).
 */

/** Chave de coluna: minúsculas, dígitos e hífen (ex.: `todo`, `col-3f8a1b2c`). */
export const COLUMN_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

/** Ícones disponíveis para colunas (componentes em `components/column-icons.tsx`). */
export const COLUMN_ICON_KEYS = [
    "star",
    "flag",
    "bookmark",
    "clock",
    "hourglass",
    "pause",
    "eye",
    "search",
    "message",
    "users",
    "user",
    "bug",
    "wrench",
    "code",
    "test",
    "rocket",
    "check",
    "dot",
    "alert",
    "flame",
    "zap",
    "lightbulb",
    "inbox",
    "archive",
    "calendar",
    "target",
    "coffee",
    "heart",
    "brain",
    "shield",
    "package",
    "list",
] as const
export type ColumnIcon = (typeof COLUMN_ICON_KEYS)[number]

export interface TaskColumnDto {
    key: string
    name: string
    /** Cor `#RRGGBB` (seletor de cores; nomes antigos da paleta são convertidos na leitura). */
    color: string
    icon: ColumnIcon
    description: string | null
    /** Limite de cards (WIP); `null` = sem limite. */
    wipLimit: number | null
}

export interface TaskBoardDto {
    columns: TaskColumnDto[]
    /** Ordem das colunas (chaves). */
    layout: string[]
}

/** Coluna pronta para a tela. */
export interface BoardColumnView {
    key: string
    label: string
    /** Cor `#RRGGBB` da coluna (aplicada por `style`: é dado do usuário). */
    accent: string
    column: TaskColumnDto
}

/** Borda superior na cor da coluna. */
export const columnBorderStyle = (column: Pick<BoardColumnView, "accent">): CSSProperties => ({ borderTopColor: column.accent })

/** Bullet na cor da coluna. */
export const columnDotStyle = (column: Pick<BoardColumnView, "accent">): CSSProperties => ({ backgroundColor: column.accent })

/**
 * Normaliza a ordem salva: tira chaves desconhecidas/repetidas e completa com as colunas que
 * faltam, no fim. Sem colunas, devolve vazio.
 */
export function normalizeLayout(order: readonly string[], keys: readonly string[]): string[] {
    const known = new Set(keys)
    const seen = new Set<string>()
    const result: string[] = []
    for (const key of order) {
        if (known.has(key) && !seen.has(key)) {
            seen.add(key)
            result.push(key)
        }
    }
    for (const key of keys) {
        if (!seen.has(key)) {
            seen.add(key)
            result.push(key)
        }
    }
    return result
}

/** Coloca `key` logo depois de `afterKey` (sem `afterKey`: no fim). */
export function placeColumnAfter(layout: readonly string[], key: string, afterKey?: string | null): string[] {
    const without = layout.filter((item) => item !== key)
    if (afterKey === undefined || afterKey === null) return [...without, key]
    const index = without.indexOf(afterKey)
    if (index === -1) return [...without, key]
    return [...without.slice(0, index + 1), key, ...without.slice(index + 1)]
}

/**
 * Nova ordem completa a partir da reordenação das colunas VISÍVEIS (o filtro pode esconder
 * algumas): as posições ocupadas pelas visíveis recebem a nova sequência.
 */
export function mergeVisibleOrder(layout: readonly string[], visibleNewOrder: readonly string[]): string[] {
    const visible = new Set(visibleNewOrder)
    const queue = [...visibleNewOrder]
    return layout.map((key) => (visible.has(key) ? queue.shift()! : key))
}

export function columnView(column: TaskColumnDto): BoardColumnView {
    return { key: column.key, label: column.name, accent: normalizeColor(column.color) ?? DEFAULT_COLUMN_COLOR, column }
}

/** Colunas na ordem do quadro. */
export function buildBoardColumns(board: TaskBoardDto | undefined): BoardColumnView[] {
    const customs = new Map((board?.columns ?? []).map((column) => [column.key, column]))
    const layout = normalizeLayout(board?.layout ?? [], [...customs.keys()])
    return layout.map((key) => columnView(customs.get(key)!))
}

/** Coluna em que a tarefa aparece. */
export const columnKeyOf = (task: { columnId: string }): string => task.columnId
