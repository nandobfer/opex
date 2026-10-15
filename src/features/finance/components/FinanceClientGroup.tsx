"use client"

import { useId } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, ListChecks } from "lucide-react"
import { listContainer, listItem } from "@/components/motion/presets"
import { formatBillingBrl, formatHours } from "../format"
import type { FinanceClientGroupDto } from "../types"
import { FinanceServiceRow } from "./FinanceServiceRow"
import { FinanceTaskRow } from "./FinanceTaskRow"

interface FinanceClientGroupProps {
    group: FinanceClientGroupDto
    open: boolean
    onToggle: () => void
}

/**
 * Grupo de itens de um cliente (tarefas concluídas **e** serviços), **expansível**: o cabeçalho mostra
 * o nome do cliente, as contagens (tarefas e serviços), as horas do cliente e o faturamento do
 * período; ao abrir, revela as tarefas (`FinanceTaskRow`) e os serviços (`FinanceServiceRow`). Anima
 * com Framer Motion e respeita movimento reduzido.
 */
export function FinanceClientGroup({ group, open, onToggle }: FinanceClientGroupProps) {
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
                        <span className="truncate text-sm font-semibold" title={group.clientName}>
                            {group.clientName}
                        </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-xs text-muted-foreground max-md:w-full max-md:basis-full max-md:justify-start max-md:pt-1" data-testid="finance-group-metrics">
                        <span className="inline-flex items-center gap-1">
                            <ListChecks className="h-3 w-3" aria-hidden />
                            {group.taskCount} {group.taskCount === 1 ? "tarefa" : "tarefas"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            {group.serviceCount} {group.serviceCount === 1 ? "serviço" : "serviços"}
                        </span>
                        <span title="Horas do cliente no período">{formatHours(group.totalClientHours)}</span>
                        <strong className="font-mono text-sm text-success">{formatBillingBrl(group.totalBillingBrl)}</strong>
                    </span>
                </button>
            </h3>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        id={listId}
                        key="items"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <motion.ul variants={listContainer} initial="hidden" animate="visible" className="space-y-2 border-t p-2">
                            {group.tasks.map((item) => (item.kind === "service" ? <FinanceServiceRow key={item.id} service={item} /> : <FinanceTaskRow key={item.id} task={item} />))}
                        </motion.ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
