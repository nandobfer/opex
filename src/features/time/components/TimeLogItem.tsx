"use client"

import { useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { format } from "date-fns"
import { Check, CalendarClock, Loader2, MoreHorizontal, Pencil, Square, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { listItem } from "@/components/motion/presets"
import { cn } from "@/lib/utils"
import { taskPath } from "@/features/tasks/constants"
import { formatMinutes } from "@/features/tasks/format"
import type { TimeLogDto } from "../types"
import { RunningClock } from "./TimerButton"

interface TimeLogItemProps {
    log: TimeLogDto
    savingDescription: boolean
    onSaveDescription: (description: string) => Promise<boolean>
    onEditPeriod: () => void
    onDelete: () => void
    onStop: () => void
}

const hour = (iso: string) => format(new Date(iso), "HH:mm")

/** Um apontamento: tarefa, início–fim, duração, descrição (edição na linha) e ações. */
export function TimeLogItem({ log, savingDescription, onSaveDescription, onEditPeriod, onDelete, onStop }: TimeLogItemProps) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState("")

    const startEdit = () => {
        setDraft(log.description ?? "")
        setEditing(true)
    }
    const save = async () => {
        if (draft.trim() === (log.description ?? "")) return setEditing(false)
        if (await onSaveDescription(draft.trim())) setEditing(false)
    }

    return (
        <motion.li
            layout="position"
            variants={listItem}
            className={cn("group rounded-lg border bg-card p-3 transition-colors", log.active && "border-success/60 bg-success/5")}
            data-testid={`time-log-${log.id}`}
        >
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {log.taskId && log.taskCode ? (
                            <Link href={taskPath(log.taskId)} className="font-mono text-xs font-semibold text-primary hover:underline">
                                {log.taskCode}
                            </Link>
                        ) : null}
                        <span className="truncate text-sm font-medium" title={log.taskTitle ?? undefined}>
                            {log.taskTitle ?? "Sem tarefa"}
                        </span>
                        {log.productName && <span className="text-xs text-muted-foreground">· {log.productName}</span>}
                    </div>

                    <AnimatePresence mode="wait" initial={false}>
                        {editing ? (
                            <motion.form
                                key="edit"
                                initial={{ opacity: 0, y: -2 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="mt-2 flex items-center gap-1.5"
                                onSubmit={(event) => {
                                    event.preventDefault()
                                    void save()
                                }}
                            >
                                <Input
                                    autoFocus
                                    value={draft}
                                    maxLength={2000}
                                    onChange={(event) => setDraft(event.target.value)}
                                    onKeyDown={(event) => event.key === "Escape" && setEditing(false)}
                                    placeholder="O que foi feito?"
                                    aria-label="Descrição do apontamento"
                                    className="h-8 text-sm"
                                    disabled={savingDescription}
                                />
                                <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={savingDescription} aria-label="Salvar descrição">
                                    {savingDescription ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                                </Button>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setEditing(false)} disabled={savingDescription} aria-label="Cancelar edição">
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                </Button>
                            </motion.form>
                        ) : (
                            <motion.button
                                key="view"
                                type="button"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={startEdit}
                                className={cn("mt-1 block max-w-full text-left text-sm transition-colors hover:text-primary", !log.description && "italic text-muted-foreground")}
                                title="Editar descrição"
                            >
                                {log.description ?? "Sem descrição — clique para adicionar"}
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs tabular-nums text-muted-foreground">
                        {hour(log.startTime)} – {log.endTime ? hour(log.endTime) : "agora"}
                    </span>
                    {log.active ? (
                        <>
                            <span className="inline-flex items-center gap-1.5 rounded bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                                <motion.span className="h-1.5 w-1.5 rounded-full bg-success" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} aria-hidden />
                                <RunningClock startTime={log.startTime} />
                            </span>
                            <Button type="button" variant="destructive" size="sm" className="h-7 gap-1.5" onClick={onStop}>
                                <Square className="h-3 w-3" aria-hidden /> Parar
                            </Button>
                        </>
                    ) : (
                        <span className="min-w-[64px] text-right font-mono text-sm font-semibold">{formatMinutes(log.duration)}</span>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Ações do apontamento">
                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={startEdit} className="gap-2">
                                <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar descrição
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={onEditPeriod} disabled={log.active} className="gap-2">
                                <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Editar período
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={onDelete} disabled={log.active} className="gap-2 text-destructive focus:text-destructive" title={log.active ? "Pare o timer antes de excluir" : undefined}>
                                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Excluir
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </motion.li>
    )
}
