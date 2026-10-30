import { Skeleton } from "@/components/ui/skeleton"
import { CONTENT_BLEED_X } from "@/features/layout/content-padding"
import { cn } from "@/lib/utils"
import type { BoardColumnView } from "../board"
import type { TaskTableColumn } from "../filters"
import { COMPACT_CARD_CLASS, KANBAN_BOARD_CLASS, KANBAN_CARD_CLASS, KANBAN_COLUMN_CARDS_CLASS, KANBAN_COLUMN_CLASS, KANBAN_COLUMN_HEADER_CLASS, KANBAN_COLUMN_META_CLASS } from "./board-layout"
import { TABLE_COLUMN_ORDER, TABLE_COLUMN_WIDTHS } from "./table-columns"
import { TASK_TABLE_RESPONSIVE, TASK_TABLE_ROW_HEIGHT } from "./TaskTable"

/** Cards por coluna (fixo por posição: nada aleatório, o mesmo no servidor e no cliente). */
const CARDS_PER_COLUMN = [3, 2, 4, 1, 2, 3, 1] as const
const TABLE_ROWS = 8
const COMPACT_CARDS = 4
/** Colunas do skeleton enquanto o quadro (layout das colunas) ainda não chegou. */
const PLACEHOLDER_COLUMNS = 4

interface TasksSkeletonProps {
    kanban: boolean
    /** Colunas visíveis do quadro; vazio = o quadro ainda não chegou (colunas neutras). */
    columns: readonly BoardColumnView[]
    /** Celular: a visão Tabela vira cards compactos. */
    mobile: boolean
}

/**
 * Carregamento de Tarefas com as dimensões do resultado final: no kanban, as mesmas colunas (borda
 * colorida, cabeçalho de duas linhas) e cards no formato do `TaskCard`; na tabela, o cabeçalho e as
 * linhas do `TaskTable` (ou os cards do `TaskCompactList` no celular).
 */
export function TasksSkeleton({ kanban, columns, mobile }: TasksSkeletonProps) {
    if (kanban) return <KanbanSkeleton columns={columns} />
    return mobile ? <CompactListSkeleton /> : <TableSkeleton />
}

function KanbanSkeleton({ columns }: { columns: readonly BoardColumnView[] }) {
    const shown = columns.length > 0 ? columns.map((column) => ({ key: column.key, border: column.border })) : Array.from({ length: PLACEHOLDER_COLUMNS }, (_, index) => ({ key: `placeholder-${index}`, border: "border-t-border" }))
    return (
        <div className={cn(KANBAN_BOARD_CLASS, "overflow-x-hidden", CONTENT_BLEED_X)} aria-label="Carregando tarefas" aria-busy="true" data-testid="kanban-skeleton">
            {shown.map((column, index) => (
                <div key={column.key} className="flex shrink-0">
                    <div className={cn(KANBAN_COLUMN_CLASS, column.border)} data-testid={`column-skeleton-${column.key}`}>
                        <div className={KANBAN_COLUMN_HEADER_CLASS}>
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                    <Skeleton className="h-3.5 w-3.5 rounded-sm" />
                                    <Skeleton className="h-3.5 w-3.5 rounded-sm" />
                                    <Skeleton className="h-3.5 w-24" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <Skeleton className="h-5 w-7 rounded-sm" />
                                    <Skeleton className="h-6 w-6" />
                                </div>
                            </div>
                            <div className={KANBAN_COLUMN_META_CLASS} />
                        </div>
                        <div className={KANBAN_COLUMN_CARDS_CLASS}>
                            <div className="flex flex-1 flex-col gap-2 overflow-hidden">
                                {Array.from({ length: CARDS_PER_COLUMN[index % CARDS_PER_COLUMN.length]! }, (_, card) => (
                                    <TaskCardSkeleton key={card} withRepo={(index + card) % 2 === 0} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

/** Formato do `TaskCard`: código, título em duas linhas, repositório opcional e rodapé com badges e issue. */
function TaskCardSkeleton({ withRepo }: { withRepo: boolean }) {
    return (
        <div className={KANBAN_CARD_CLASS} data-testid="task-card-skeleton">
            <div className="mb-1.5 flex h-4 items-center">
                <Skeleton className="h-3 w-16" />
            </div>
            <div className="mb-2 space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
            </div>
            {withRepo && (
                <div className="mb-2 flex items-center gap-2" data-testid="task-card-skeleton-repo">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            )}
            <div className="flex items-center justify-between gap-1.5 border-t pt-2">
                <div className="flex items-center gap-1">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-5 w-14" />
                </div>
                <Skeleton className="h-6 w-10 rounded-full" />
            </div>
        </div>
    )
}

const hide = (column: TaskTableColumn) => TASK_TABLE_RESPONSIVE[column] ?? ""

/** Mesmas colunas, larguras e ocultação responsiva do `TaskTable`; linhas na altura dele. */
function TableSkeleton() {
    return (
        <div className="rounded-md border bg-card" aria-label="Carregando tarefas" aria-busy="true" data-testid="table-skeleton">
            <table className="w-full table-fixed text-sm">
                <thead className="shadow-[0_1px_0_var(--color-border)]">
                    <tr>
                        <th className="h-10 w-[44px] px-3">
                            <Skeleton className="h-4 w-4 rounded-sm" />
                        </th>
                        {TABLE_COLUMN_ORDER.map((key) => (
                            <th key={key} className={cn("h-10 px-3", TABLE_COLUMN_WIDTHS[key], hide(key))} data-testid={`table-head-skeleton-${key}`}>
                                <Skeleton className="h-3 w-14" />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: TABLE_ROWS }, (_, row) => (
                        <tr key={row} className="border-b last:border-b-0" style={{ height: TASK_TABLE_ROW_HEIGHT }} data-testid="table-row-skeleton">
                            <td className="px-3">
                                <Skeleton className="h-4 w-4 rounded-sm" />
                            </td>
                            {TABLE_COLUMN_ORDER.map((key) => (
                                <td key={key} className={cn("px-3", hide(key))}>
                                    {key === "title" ? (
                                        <div className="space-y-1.5">
                                            <Skeleton className={cn("h-3.5", row % 2 ? "w-2/3" : "w-5/6")} />
                                            <Skeleton className="h-3 w-1/2" />
                                        </div>
                                    ) : (
                                        <Skeleton className={cn("h-4", key === "issue" ? "w-10" : "w-4/5")} />
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

/** Formato do `TaskCompactList`: barra com seleção, total e "Ordenar" seguida dos cards compactos. */
function CompactListSkeleton() {
    return (
        <div className="flex flex-col gap-3" aria-label="Carregando tarefas" aria-busy="true" data-testid="compact-list-skeleton">
            <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-sm" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="ml-auto h-8 w-36" />
            </div>
            <div className="flex flex-col gap-2">
                {Array.from({ length: COMPACT_CARDS }, (_, card) => (
                    <div key={card} className={COMPACT_CARD_CLASS} data-testid="compact-card-skeleton">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4 rounded-sm" />
                            <Skeleton className="h-3.5 w-20" />
                            <Skeleton className="ml-auto h-5 w-16" />
                        </div>
                        <div className="mt-2 space-y-1.5">
                            <Skeleton className="h-3.5 w-full" />
                            <Skeleton className="h-3.5 w-2/3" />
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                            <Skeleton className="h-5 w-14" />
                            <Skeleton className="h-5 w-12" />
                        </div>
                        <div className="mt-2 flex items-center gap-2 border-t pt-2">
                            <Skeleton className="h-4 w-1/3" />
                            <Skeleton className="h-4 w-1/4" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
