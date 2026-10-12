"use client"

import { useId } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, ListChecks } from "lucide-react"
import { listContainer, listItem } from "@/components/motion/presets"
import type { GithubRepoLabelData } from "@/features/github/types"
import { formatBillingBrl, formatHours } from "@/features/finance/format"
import type { ClienteCostGroupDto } from "../../types"
import { ClienteCostTaskRow } from "./ClienteCostTaskRow"

interface ClienteCostGroupProps {
    group: ClienteCostGroupDto
    open: boolean
    onToggle: () => void
    /** Índice de repositórios do cliente (avatar/descrição do GitHub) e rota da tarefa. */
    repoIndex?: ReadonlyMap<string, GithubRepoLabelData>
    hrefFor: (taskId: string) => string
}

/**
 * Grupo de tarefas concluídas de um **repositório**, expansível — o mesmo desenho do grupo do
 * Financeiro do dono (cabeçalho com contagem, horas e valor; abertura animada). O portal agrupa por
 * repositório (o cliente já é o da sessão) e mostra o valor como **Custo**.
 */
export function ClienteCostGroup({ group, open, onToggle, repoIndex, hrefFor }: ClienteCostGroupProps) {
    const reduceMotion = useReducedMotion()
    const listId = useId()

    return (
        <motion.div variants={listItem} className="overflow-hidden rounded-lg border bg-card">
            <h3>
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={open}
                    aria-controls={listId}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }} className="flex shrink-0 text-muted-foreground" aria-hidden>
                        <ChevronDown className="h-4 w-4" />
                    </motion.span>
                    <span className="min-w-0 flex-1">
                        <span className="truncate text-sm font-semibold" title={group.repo}>
                            {group.repo}
                        </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <ListChecks className="h-3 w-3" aria-hidden />
                            {group.taskCount} {group.taskCount === 1 ? "tarefa" : "tarefas"}
                        </span>
                        <span title="Horas no período">{formatHours(group.totalClientHours)}</span>
                        <strong className="font-mono text-sm text-success">{formatBillingBrl(group.totalCostBrl)}</strong>
                    </span>
                </button>
            </h3>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        id={listId}
                        key="tasks"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <motion.ul variants={listContainer} initial="hidden" animate="visible" className="space-y-2 border-t p-2">
                            {group.tasks.map((task) => (
                                <ClienteCostTaskRow key={task.id} task={task} repoIndex={repoIndex} href={hrefFor(task.id)} />
                            ))}
                        </motion.ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
