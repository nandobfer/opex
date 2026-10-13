"use client"

import { useId } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, Coins, Hash } from "lucide-react"
import { listContainer, listItem } from "@/components/motion/presets"
import { formatMinutes } from "@/features/tasks/format"
import type { TimeLogTask } from "../grouping"
import { formatCostUsd, formatTokens } from "../format"
import { TimeLogItem } from "./TimeLogItem"

interface TimeLogTaskGroupProps {
    group: TimeLogTask
    open: boolean
    onToggle: () => void
}

/**
 * Grupo de apontamentos de uma task/mesa **expansível** (nível abaixo do dia em Horas agênticas): o
 * cabeçalho mostra código, título, contagem, total de minutos e o consumo (tokens e custo); ao abrir,
 * revela os apontamentos item a item (`TimeLogItem`, **somente leitura**). Anima com Framer Motion e
 * respeita movimento reduzido.
 */
export function TimeLogTaskGroup({ group, open, onToggle }: TimeLogTaskGroupProps) {
    const reduceMotion = useReducedMotion()
    const listId = useId()
    const count = group.logs.length

    return (
        <motion.div variants={listItem} className="overflow-hidden rounded-lg border bg-card">
            <h3>
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={open}
                    aria-controls={listId}
                    className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <motion.span
                        animate={{ rotate: open ? 0 : -90 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                        className="flex shrink-0 text-muted-foreground"
                        aria-hidden
                    >
                        <ChevronDown className="h-4 w-4" />
                    </motion.span>
                    <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {group.taskCode && <span className="font-mono text-xs font-semibold text-primary">{group.taskCode}</span>}
                            <span className="truncate text-sm font-medium" title={group.taskTitle ?? undefined}>
                                {group.taskTitle ?? "Sem tarefa"}
                            </span>
                            {group.hasActive && (
                                <span className="inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                                    <motion.span className="h-1.5 w-1.5 rounded-full bg-success" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} aria-hidden />
                                    Em execução
                                </span>
                            )}
                        </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-xs text-muted-foreground max-md:w-full max-md:basis-full max-md:justify-start max-md:pt-1" data-testid="time-group-metrics">
                        <span>
                            {count} {count === 1 ? "apontamento" : "apontamentos"}
                        </span>
                        {group.totalTokens > 0 && (
                            <span className="inline-flex items-center gap-1">
                                <Hash className="h-3 w-3" aria-hidden />
                                {formatTokens(group.totalTokens)} tokens
                            </span>
                        )}
                        {group.totalCostUsd > 0 && (
                            <span className="inline-flex items-center gap-1">
                                <Coins className="h-3 w-3" aria-hidden />
                                {formatCostUsd(group.totalCostUsd)}
                            </span>
                        )}
                        <strong className="font-mono text-sm text-foreground">{formatMinutes(group.totalMinutes)}</strong>
                    </span>
                </button>
            </h3>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        id={listId}
                        key="logs"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <motion.ul variants={listContainer} initial="hidden" animate="visible" className="space-y-2 border-t p-2">
                            {group.logs.map((log) => (
                                <TimeLogItem key={log.id} log={log} />
                            ))}
                        </motion.ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
