/**
 * Quadro de Tarefas dO Opex: colunas 100% configuráveis (o Opex é a fonte de verdade). Cada
 * tarefa pertence a UMA coluna. Módulo PURO (cliente e servidor).
 */

/** Chave de coluna: minúsculas, dígitos e hífen (ex.: `todo`, `col-3f8a1b2c`). */
export const COLUMN_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

export const COLUMN_COLORS = ["violet", "sky", "emerald", "amber", "rose", "cyan", "orange", "pink", "lime", "zinc"] as const
export type ColumnColor = (typeof COLUMN_COLORS)[number]

/** Classes completas (o Tailwind só gera o que aparece literal no código). */
export const COLUMN_COLOR_STYLES: Record<ColumnColor, { label: string; border: string; dot: string; swatch: string; text: string }> = {
    violet: { label: "Violeta", border: "border-t-violet-400", dot: "bg-violet-400", swatch: "bg-violet-500", text: "text-violet-400" },
    sky: { label: "Azul", border: "border-t-sky-400", dot: "bg-sky-400", swatch: "bg-sky-500", text: "text-sky-400" },
    emerald: { label: "Verde", border: "border-t-emerald-400", dot: "bg-emerald-400", swatch: "bg-emerald-500", text: "text-emerald-400" },
    amber: { label: "Âmbar", border: "border-t-amber-400", dot: "bg-amber-400", swatch: "bg-amber-500", text: "text-amber-400" },
    rose: { label: "Rosa", border: "border-t-rose-400", dot: "bg-rose-400", swatch: "bg-rose-500", text: "text-rose-400" },
    cyan: { label: "Ciano", border: "border-t-cyan-400", dot: "bg-cyan-400", swatch: "bg-cyan-500", text: "text-cyan-400" },
    orange: { label: "Laranja", border: "border-t-orange-400", dot: "bg-orange-400", swatch: "bg-orange-500", text: "text-orange-400" },
    pink: { label: "Pink", border: "border-t-pink-400", dot: "bg-pink-400", swatch: "bg-pink-500", text: "text-pink-400" },
    lime: { label: "Lima", border: "border-t-lime-400", dot: "bg-lime-400", swatch: "bg-lime-500", text: "text-lime-400" },
    zinc: { label: "Cinza", border: "border-t-zinc-400", dot: "bg-zinc-400", swatch: "bg-zinc-500", text: "text-zinc-400" },
}

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
    color: ColumnColor
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
    border: string
    dot: string
    column: TaskColumnDto
}

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
    const style = COLUMN_COLOR_STYLES[column.color] ?? COLUMN_COLOR_STYLES.violet
    return { key: column.key, label: column.name, border: style.border, dot: style.dot, column }
}

/** Colunas na ordem do quadro. */
export function buildBoardColumns(board: TaskBoardDto | undefined): BoardColumnView[] {
    const customs = new Map((board?.columns ?? []).map((column) => [column.key, column]))
    const layout = normalizeLayout(board?.layout ?? [], [...customs.keys()])
    return layout.map((key) => columnView(customs.get(key)!))
}

/** Coluna em que a tarefa aparece. */
export const columnKeyOf = (task: { columnId: string }): string => task.columnId
