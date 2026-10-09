import { isTaskStatus, TASK_STATUS_ACCENT, TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "./constants"

/**
 * Colunas do quadro: as 7 do Go! Sipal (fixas, mover para elas altera a tarefa na plataforma) e
 * as customizadas (status pessoais, só nO Opex). Módulo PURO (cliente e servidor).
 */

export const CUSTOM_COLUMN_PREFIX = "custom-"
export const CUSTOM_COLUMN_KEY = /^custom-[a-z0-9]{6,32}$/

export const isCustomColumnKey = (key: string | null | undefined): boolean => typeof key === "string" && key.startsWith(CUSTOM_COLUMN_PREFIX)

export const COLUMN_COLORS = ["violet", "sky", "emerald", "amber", "rose", "cyan", "orange", "pink", "lime", "zinc"] as const
export type ColumnColor = (typeof COLUMN_COLORS)[number]

/** Classes completas (o Tailwind só gera o que aparece literal no código). */
export const COLUMN_COLOR_STYLES: Record<ColumnColor, { label: string; border: string; dot: string; swatch: string }> = {
    violet: { label: "Violeta", border: "border-t-violet-400", dot: "bg-violet-400", swatch: "bg-violet-500" },
    sky: { label: "Azul", border: "border-t-sky-400", dot: "bg-sky-400", swatch: "bg-sky-500" },
    emerald: { label: "Verde", border: "border-t-emerald-400", dot: "bg-emerald-400", swatch: "bg-emerald-500" },
    amber: { label: "Âmbar", border: "border-t-amber-400", dot: "bg-amber-400", swatch: "bg-amber-500" },
    rose: { label: "Rosa", border: "border-t-rose-400", dot: "bg-rose-400", swatch: "bg-rose-500" },
    cyan: { label: "Ciano", border: "border-t-cyan-400", dot: "bg-cyan-400", swatch: "bg-cyan-500" },
    orange: { label: "Laranja", border: "border-t-orange-400", dot: "bg-orange-400", swatch: "bg-orange-500" },
    pink: { label: "Pink", border: "border-t-pink-400", dot: "bg-pink-400", swatch: "bg-pink-500" },
    lime: { label: "Lima", border: "border-t-lime-400", dot: "bg-lime-400", swatch: "bg-lime-500" },
    zinc: { label: "Cinza", border: "border-t-zinc-400", dot: "bg-zinc-400", swatch: "bg-zinc-500" },
}

/** Ícones disponíveis para colunas customizadas (componentes em `components/column-icons.tsx`). */
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

export interface CustomColumnDto {
    key: string
    name: string
    color: ColumnColor
    icon: ColumnIcon
    description: string | null
    /** Limite de cards (WIP); `null` = sem limite. */
    wipLimit: number | null
}

export interface TaskBoardDto {
    columns: CustomColumnDto[]
    /** Ordem de todas as colunas (chaves: status do Go! Sipal ou `custom-…`). */
    layout: string[]
}

/** Coluna pronta para a tela (Go! Sipal ou customizada). */
export interface BoardColumnView {
    key: string
    kind: "go" | "custom"
    label: string
    border: string
    dot: string
    custom: CustomColumnDto | null
}

/**
 * Normaliza a ordem salva: as colunas do Go! Sipal ficam sempre todas e na ordem do fluxo; cada
 * customizada fica logo depois da coluna do Go! Sipal que a precede (ou no início). Chaves
 * desconhecidas/repetidas saem; customizadas que faltam vão para o fim.
 */
export function normalizeLayout(order: readonly string[], customKeys: readonly string[]): string[] {
    const customs = new Set(customKeys)
    const anchored = new Map<TaskStatus | null, string[]>()
    const placed = new Set<string>()
    const push = (anchor: TaskStatus | null, key: string) => {
        placed.add(key)
        anchored.set(anchor, [...(anchored.get(anchor) ?? []), key])
    }
    let anchor: TaskStatus | null = null
    for (const key of order) {
        if (isTaskStatus(key)) anchor = key
        else if (customs.has(key) && !placed.has(key)) push(anchor, key)
    }
    const last = TASK_STATUSES[TASK_STATUSES.length - 1]!
    for (const key of customKeys) if (!placed.has(key)) push(last, key)

    const result = [...(anchored.get(null) ?? [])]
    for (const status of TASK_STATUSES) result.push(status, ...(anchored.get(status) ?? []))
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

export function goColumnView(status: TaskStatus): BoardColumnView {
    return { key: status, kind: "go", label: TASK_STATUS_LABELS[status], border: TASK_STATUS_ACCENT[status].border, dot: TASK_STATUS_ACCENT[status].dot, custom: null }
}

export function customColumnView(column: CustomColumnDto): BoardColumnView {
    const style = COLUMN_COLOR_STYLES[column.color] ?? COLUMN_COLOR_STYLES.violet
    return { key: column.key, kind: "custom", label: column.name, border: style.border, dot: style.dot, custom: column }
}

/** Colunas na ordem do quadro (sem quadro carregado: só as do Go! Sipal). */
export function buildBoardColumns(board: TaskBoardDto | undefined): BoardColumnView[] {
    const customs = new Map((board?.columns ?? []).map((column) => [column.key, column]))
    const layout = normalizeLayout(board?.layout ?? [], [...customs.keys()])
    return layout.map((key) => (isTaskStatus(key) ? goColumnView(key) : customColumnView(customs.get(key)!)))
}

/** Coluna em que a tarefa aparece: a customizada, se houver; senão o status do Go! Sipal. */
export const columnKeyOf = (task: { status: TaskStatus; localColumn?: string | null }): string => task.localColumn ?? task.status
