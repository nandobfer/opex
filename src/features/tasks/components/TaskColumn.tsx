"use client"

import { useRef, type HTMLAttributes } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useVirtualizer } from "@tanstack/react-virtual"
import { AlertTriangle, ArrowLeft, ArrowRight, GripVertical, Inbox, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SelectionCheckbox } from "@/components/ui/selection-checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { BoardColumnView, CustomColumnDto } from "../board"
import { PLATFORM_COLUMN_LIMIT } from "../constants"
import type { TaskSelection } from "../hooks/useTaskSelection"
import type { TaskDto } from "../types"
import { ColumnIconView } from "./column-icons"
import { BULK_BAR_CLEARANCE_PX } from "./TaskBulkBar"
import { SortableTaskCard } from "./TaskCard"

const VIRTUALIZE_ABOVE = 50
const CARD_ESTIMATE = 130

export const columnSortableId = (key: string) => `col:${key}`
export const columnDropId = (key: string) => `drop:${key}`

export interface ColumnActions {
    onCreateAfter: (afterKey: string) => void
    onEdit: (column: CustomColumnDto) => void
    onDelete: (column: CustomColumnDto) => void
    onShift: (key: string, direction: -1 | 1) => void
}

interface TaskColumnProps {
    column: BoardColumnView
    tasks: readonly TaskDto[]
    /** Total na coluna sem filtros (limite de 200 do Go! Sipal, WIP e exclusão). */
    rawCount: number
    /** A plataforma devolveu o limite (200) desta coluna: pode haver tarefas fora do quadro. */
    limited: boolean
    /** Arrastando um card que não pode vir para esta coluna. */
    blocked: boolean
    /** Alguma coisa está sendo arrastada (desliga animações de layout e os "+"). */
    dragActive: boolean
    canShiftLeft: boolean
    canShiftRight: boolean
    currentUserId: string | null
    movingId: string | null
    selection: TaskSelection
    /** Ids arrastados junto com o card ativo (seleção múltipla). */
    draggingIds: ReadonlySet<string>
    highlightIds: ReadonlySet<string>
    actions: ColumnActions
    onOpen: (task: TaskDto) => void
}

/**
 * Coluna do kanban. As do Go! Sipal são fixas (selo com cadeado); as customizadas arrastam pela
 * alça e têm menu (editar, mover, excluir). Cards virtualizados acima de 50.
 */
export function TaskColumn(props: TaskColumnProps) {
    const { column, tasks, rawCount, limited, blocked, dragActive, currentUserId, movingId, selection, draggingIds, highlightIds, actions, onOpen } = props
    const custom = column.custom
    const sortable = useSortable({ id: columnSortableId(column.key), data: { type: "column", key: column.key }, disabled: { draggable: !custom, droppable: false } })
    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: columnDropId(column.key), data: { type: "zone", key: column.key }, disabled: blocked })
    const scrollRef = useRef<HTMLDivElement>(null)
    const virtualize = tasks.length > VIRTUALIZE_ABOVE
    // eslint-disable-next-line react-hooks/incompatible-library -- padrão do TanStack Virtual (mesmo do CRM)
    const virtualizer = useVirtualizer({ count: tasks.length, getScrollElement: () => scrollRef.current, estimateSize: () => CARD_ESTIMATE, overscan: 6 })

    const ids = tasks.map((task) => task.id)
    const columnState = selection.stateOf(ids)
    const selecting = selection.selected.size > 0
    const overWip = custom?.wipLimit != null && rawCount > custom.wipLimit

    const card = (task: TaskDto) => (
        <SortableTaskCard
            key={task.id}
            task={task}
            columnKey={column.key}
            mine={currentUserId !== null && task.assignee?.id === currentUserId}
            moving={movingId === task.id}
            hidden={draggingIds.has(task.id)}
            flash={highlightIds.has(task.id)}
            layoutEnabled={!dragActive}
            selection={{ selected: selection.selected.has(task.id), active: selecting, onToggle: () => selection.toggle(task.id) }}
            onOpen={() => onOpen(task)}
        />
    )

    return (
        <div
            ref={sortable.setNodeRef}
            style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
            className="group/insert relative flex shrink-0"
            data-column={column.key}
        >
            {sortable.isDragging && <div className="absolute inset-0 rounded-lg border-2 border-dashed border-primary/60 bg-primary/5" aria-hidden />}
            <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: sortable.isDragging ? 0 : blocked ? 0.45 : 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2 }}
                aria-label={column.label}
                data-status={column.key}
                className={cn(
                    "flex w-[290px] flex-col rounded-lg border border-t-4 bg-muted/40 p-2 transition-colors",
                    column.border,
                    custom && "bg-muted/25",
                    overWip && "border-x-warning/60 border-b-warning/60",
                    isOver && !blocked && "bg-primary/10 ring-1 ring-primary/40",
                )}
            >
                <header className="group/col mb-2 flex flex-col gap-1.5 border-b px-1 pb-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                            {custom && (
                                <button
                                    type="button"
                                    {...(sortable.attributes as HTMLAttributes<HTMLButtonElement>)}
                                    {...(sortable.listeners as HTMLAttributes<HTMLButtonElement>)}
                                    className="-ml-1 cursor-grab rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
                                    aria-label={`Arrastar a coluna ${column.label}`}
                                    title="Arrastar para reorganizar"
                                >
                                    <GripVertical className="h-3.5 w-3.5" aria-hidden />
                                </button>
                            )}
                            {custom && <ColumnIconView icon={custom.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                            <h2 className="truncate text-xs font-semibold uppercase tracking-wide" title={column.label}>
                                {column.label}
                            </h2>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <span className={cn("flex items-baseline rounded-sm border bg-background px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums", overWip && "border-warning/60 text-warning")}>
                                <AnimatedNumber value={custom?.wipLimit != null ? rawCount : tasks.length} />
                                {custom?.wipLimit != null && <span className="text-muted-foreground">/{custom.wipLimit}</span>}
                            </span>
                            {custom && <ColumnMenu {...props} custom={custom} />}
                        </div>
                    </div>

                    {/* 2ª linha: seleção da coluna · descrição · origem (faixa com o tom do tipo da coluna). */}
                    <div
                        className={cn(
                            "flex h-7 items-center gap-2 rounded-md border px-1.5",
                            custom ? "border-border/60 bg-muted/60" : "border-primary/20 bg-primary/10",
                        )}
                        data-testid={`column-meta-${column.key}`}
                    >
                        {tasks.length > 0 && (
                            <SelectionCheckbox
                                checked={columnState}
                                onToggle={() => selection.setMany(ids, columnState !== true)}
                                label={`Selecionar todas de ${column.label}`}
                                className={cn("shrink-0 transition-opacity", columnState === false && !selecting && "opacity-0 focus-visible:opacity-100 group-hover/col:opacity-100")}
                            />
                        )}
                        <div className="min-w-0 flex-1">
                            <AnimatePresence initial={false}>
                                {custom?.description && (
                                    <motion.div key={custom.description} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                        <Tooltip delayDuration={300}>
                                            <TooltipTrigger asChild>
                                                <p className="truncate text-[10px] leading-tight text-muted-foreground/80" data-testid="column-description">
                                                    {custom.description}
                                                </p>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom" align="start" className="max-w-[260px] whitespace-normal break-words text-xs">
                                                {custom.description}
                                            </TooltipContent>
                                        </Tooltip>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        {custom ? (
                            <Tooltip delayDuration={150}>
                                <TooltipTrigger asChild>
                                    <span className="shrink-0 rounded border border-border bg-background/60 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Pessoal</span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[240px] text-xs">Coluna pessoal: só nO Opex, sem efeito no Go! Sipal.</TooltipContent>
                            </Tooltip>
                        ) : (
                            <Tooltip delayDuration={150}>
                                <TooltipTrigger asChild>
                                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-primary/30 bg-primary/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-primary">
                                        <Lock className="h-2.5 w-2.5" aria-hidden /> Go! Sipal
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[240px] text-xs">Coluna do Go! Sipal: mover para cá altera a tarefa no Go! Sipal.</TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                </header>

                <AnimatePresence initial={false}>
                    {limited && (
                        <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-2 flex items-start gap-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning"
                        >
                            <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden /> O Go! Sipal envia no máximo {PLATFORM_COLUMN_LIMIT} tarefas desta coluna.
                        </motion.p>
                    )}
                    {overWip && (
                        <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-2 flex items-start gap-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning"
                        >
                            <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden /> Acima do limite de {custom?.wipLimit} tarefas.
                        </motion.p>
                    )}
                </AnimatePresence>

                {/* A lista fica com o resto da coluna (que tem a altura do quadro) e rola até a borda de baixo. */}
                <div ref={setDropRef} className="flex min-h-[200px] flex-1 basis-0 flex-col">
                    <div ref={scrollRef} className="-mr-1 flex min-h-0 flex-1 basis-0 flex-col gap-2 overflow-y-auto pr-1" data-testid={`column-cards-${column.key}`}>
                        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                            {tasks.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed py-8 text-center text-[11px] text-muted-foreground"
                                >
                                    <Inbox className="h-4 w-4" aria-hidden />
                                    Nenhuma tarefa
                                </motion.div>
                            ) : virtualize ? (
                                <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                                    {virtualizer.getVirtualItems().map((item) => {
                                        const task = tasks[item.index]!
                                        return (
                                            <div
                                                key={task.id}
                                                ref={virtualizer.measureElement}
                                                data-index={item.index}
                                                style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)`, paddingBottom: 8 }}
                                            >
                                                {card(task)}
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <AnimatePresence initial={false}>{tasks.map(card)}</AnimatePresence>
                            )}
                        </SortableContext>
                        {/* Com seleção, a barra de ações flutua sobre o quadro: a lista ganha espaço
                            para rolar o último card acima dela (a altura da coluna não muda). */}
                        <AnimatePresence initial={false}>
                            {selecting && tasks.length > 0 && (
                                <motion.div
                                    key="bulk-bar-clearance"
                                    aria-hidden
                                    data-testid="bulk-bar-clearance"
                                    className="shrink-0"
                                    initial={{ height: 0 }}
                                    animate={{ height: BULK_BAR_CLEARANCE_PX }}
                                    exit={{ height: 0 }}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.section>

            {!dragActive && (
                <div className="absolute -right-3 top-0 z-10 flex h-full w-3 items-start justify-center pt-1.5">
                    <button
                        type="button"
                        onClick={() => actions.onCreateAfter(column.key)}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-primary/50 bg-card text-primary opacity-0 shadow-sm transition-opacity hover:bg-primary hover:text-primary-foreground focus-visible:opacity-100 group-hover/insert:opacity-100"
                        aria-label={`Nova coluna depois de ${column.label}`}
                        title="Nova coluna aqui"
                    >
                        <Plus className="h-3 w-3" aria-hidden />
                    </button>
                </div>
            )}
        </div>
    )
}

function ColumnMenu({ column, custom, rawCount, canShiftLeft, canShiftRight, actions }: TaskColumnProps & { custom: CustomColumnDto }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={`Ações da coluna ${column.label}`}>
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.onEdit(custom)} className="gap-2">
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canShiftLeft} onSelect={() => actions.onShift(column.key, -1)} className="gap-2">
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Mover para a esquerda
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canShiftRight} onSelect={() => actions.onShift(column.key, 1)} className="gap-2">
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden /> Mover para a direita
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    disabled={rawCount > 0}
                    onSelect={() => actions.onDelete(custom)}
                    className="gap-2 text-destructive focus:text-destructive"
                    title={rawCount > 0 ? `Mova as ${rawCount} tarefa(s) antes de excluir` : undefined}
                >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> {rawCount > 0 ? `Excluir (mova as ${rawCount} tarefa(s) antes)` : "Excluir"}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
