"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Archive, ArchiveRestore, ArrowRightLeft, Flag, Loader2, X } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { BoardColumnView } from "../board"
import type { TaskPriority } from "../constants"
import type { BulkProgress } from "../hooks/useBulkTasks"
import type { TaskDto } from "../types"
import { ColumnBadge } from "./TaskBadges"
import { TaskPriorityMenu } from "./TaskPriorityMenu"

interface TaskBulkBarProps {
    tasks: readonly TaskDto[]
    columns: readonly BoardColumnView[]
    progress: BulkProgress | null
    onMove: (column: string) => void
    onPriority: (priority: TaskPriority) => void
    onArchive: (archive: boolean) => void
    onClear: () => void
}

const same = <T,>(values: T[]): T | undefined => (values.length && values.every((value) => value === values[0]) ? values[0] : undefined)

/** Espaço que o conteúdo reserva no fim enquanto a barra flutuante está aberta. */
export const BULK_BAR_CLEARANCE = "pb-24"
export const BULK_BAR_CLEARANCE_PX = 96

/** Barra flutuante com as ações das tarefas selecionadas (aparece com 1+ selecionadas). */
export function TaskBulkBar({ tasks, columns, progress, onMove, onPriority, onArchive, onClear }: TaskBulkBarProps) {
    const [confirmArchive, setConfirmArchive] = useState(false)
    const count = tasks.length
    const running = progress !== null
    const allArchived = count > 0 && tasks.every((task) => task.archived)
    const column = same(tasks.map((task) => task.columnId))
    const priority = same(tasks.map((task) => task.priority)) ?? null

    return (
        <>
            <AnimatePresence>
                {count > 0 && (
                    <motion.div
                        key="bulk-bar"
                        role="toolbar"
                        aria-label="Ações das tarefas selecionadas"
                        initial={{ opacity: 0, y: 40, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 40, scale: 0.96 }}
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="fixed bottom-6 left-1/2 z-40 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-primary/40 bg-card/95 shadow-2xl shadow-primary/20 backdrop-blur"
                    >
                        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                            <span className="mr-1 flex items-center gap-1.5 text-sm font-semibold">
                                <AnimatedNumber value={count} className="rounded-md bg-primary px-2 py-0.5 font-mono text-xs text-primary-foreground tabular-nums" />
                                {count === 1 ? "selecionada" : "selecionadas"}
                            </span>

                            <div className="ml-auto flex flex-wrap items-center gap-1.5">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild disabled={running}>
                                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
                                            <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden /> Mover
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="center" side="top">
                                        <DropdownMenuLabel className="text-xs">Mover para…</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {columns.map((item) => (
                                            <DropdownMenuItem key={item.key} disabled={item.key === column} onSelect={() => onMove(item.key)}>
                                                <ColumnBadge column={item} />
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <TaskPriorityMenu
                                    value={priority}
                                    onChange={onPriority}
                                    disabled={running}
                                    align="center"
                                    trigger={
                                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
                                            <Flag className="h-3.5 w-3.5" aria-hidden /> Prioridade
                                        </Button>
                                    }
                                />

                                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={running} onClick={() => setConfirmArchive(true)}>
                                    {allArchived ? <ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> : <Archive className="h-3.5 w-3.5" aria-hidden />}
                                    {allArchived ? "Desarquivar" : "Arquivar"}
                                </Button>

                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClear} disabled={running} aria-label="Limpar seleção" title="Limpar seleção (Esc)">
                                    <X className="h-4 w-4" aria-hidden />
                                </Button>
                            </div>
                        </div>

                        <AnimatePresence initial={false}>
                            {progress && (
                                <motion.div key="progress" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t px-3 py-2">
                                    <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground" role="status">
                                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                        {progress.label}: {progress.done} de {progress.total}
                                    </div>
                                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                                        <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} transition={{ duration: 0.25 }} />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{allArchived ? "Desarquivar" : "Arquivar"} {count === 1 ? "1 tarefa" : `${count} tarefas`}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {allArchived ? "Elas voltam a aparecer no quadro." : "Elas somem do quadro (aparecem só com o filtro Arquivadas). Dá para desfazer logo depois pelo aviso."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onArchive(!allArchived)}>{allArchived ? "Desarquivar" : "Arquivar"}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
