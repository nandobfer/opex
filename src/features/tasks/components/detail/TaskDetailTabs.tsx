"use client"

import { useId, type ComponentType } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { TaskDetailDto } from "../../types"
import { CommentsSection, DescriptionSection, HistorySection, TechnicalSpecSection, TimeLogsSection } from "./TaskDetailSections"

export type TaskDetailTabId = "description" | "spec" | "comments" | "history" | "time"

interface TabDef {
    id: TaskDetailTabId
    label: string
    Component: ComponentType<{ task: TaskDetailDto }>
    count: ((task: TaskDetailDto) => number) | null
}

const TABS: readonly TabDef[] = [
    { id: "description", label: "Descrição", Component: DescriptionSection, count: null },
    { id: "spec", label: "Especificação técnica", Component: TechnicalSpecSection, count: null },
    { id: "comments", label: "Comentários", Component: CommentsSection, count: (task) => task.comments.length },
    { id: "history", label: "Histórico", Component: HistorySection, count: (task) => task.history.length },
    { id: "time", label: "Horas", Component: TimeLogsSection, count: (task) => task.timeLogs.length },
]

/** Abas da página da tarefa. A seção ativa é renderizada como **componente** (nunca chamada como
 * função), para que cada aba tenha o próprio escopo de hooks. O controle da aba é do pai, para
 * preservar a aba selecionada ao alternar entre visão e edição. */
export function TaskDetailTabs({ task, value, onValueChange }: { task: TaskDetailDto; value: TaskDetailTabId; onValueChange: (tab: TaskDetailTabId) => void }) {
    const baseId = useId()
    const active = TABS.find((item) => item.id === value) ?? TABS[0]
    const Section = active.Component

    return (
        <>
            <div role="tablist" aria-label="Seções da tarefa" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b pb-px">
                {TABS.map((item) => {
                    const isActive = value === item.id
                    const count = item.count?.(task)
                    return (
                        <button
                            key={item.id}
                            id={tabElementId(baseId, item.id)}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            aria-controls={panelElementId(baseId, item.id)}
                            onClick={() => onValueChange(item.id)}
                            className={cn("relative whitespace-nowrap px-3 pb-2.5 pt-1 text-sm transition-colors", isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                            {item.label}
                            {count ? <span className="ml-1.5 rounded bg-muted px-1.5 font-mono text-[11px]">{count}</span> : null}
                            {isActive && <motion.span layoutId="task-detail-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                        </button>
                    )
                })}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={value}
                    id={panelElementId(baseId, value)}
                    role="tabpanel"
                    aria-labelledby={tabElementId(baseId, value)}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.18 }}
                >
                    <Section task={task} />
                </motion.div>
            </AnimatePresence>
        </>
    )
}

const tabElementId = (baseId: string, id: TaskDetailTabId) => `${baseId}-tab-${id}`
const panelElementId = (baseId: string, id: TaskDetailTabId) => `${baseId}-panel-${id}`
