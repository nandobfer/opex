"use client"

import { useId } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { TaskDescription, TaskTechnicalSpec } from "@/features/tasks/components/detail/TaskDetailSections"
import type { ClienteTaskDetailDto } from "../../types"
import { ClienteAttachmentsSection } from "./ClienteAttachmentsSection"
import { ClienteCommentsSection } from "./ClienteCommentsSection"

export type ClienteTaskTabId = "description" | "spec" | "attachments" | "comments"

interface TabDef {
    id: ClienteTaskTabId
    label: string
    count: ((task: ClienteTaskDetailDto) => number) | null
}

/** Só as abas que o cliente pode ver: sem Histórico nem Horas apontadas (dados internos). */
const TABS: readonly TabDef[] = [
    { id: "description", label: "Descrição", count: null },
    { id: "spec", label: "Especificação técnica", count: null },
    { id: "attachments", label: "Anexos", count: (task) => task.attachmentsCount },
    { id: "comments", label: "Comentários", count: (task) => task.comments.length },
]

function Section({ task, id }: { task: ClienteTaskDetailDto; id: ClienteTaskTabId }) {
    if (id === "description") return <TaskDescription description={task.description} />
    if (id === "spec") return <TaskTechnicalSpec technicalSpec={task.technicalSpec} />
    if (id === "attachments") return <ClienteAttachmentsSection task={task} />
    return <ClienteCommentsSection taskId={task.id} comments={task.comments} />
}

/** Abas da página da tarefa do cliente (Descrição, Especificação técnica e Comentários). */
export function ClienteTaskTabs({ task, value, onValueChange }: { task: ClienteTaskDetailDto; value: ClienteTaskTabId; onValueChange: (tab: ClienteTaskTabId) => void }) {
    const baseId = useId()
    return (
        <>
            <div role="tablist" aria-label="Seções da tarefa" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b pb-px">
                {TABS.map((item) => {
                    const isActive = value === item.id
                    const count = item.count?.(task)
                    return (
                        <button
                            key={item.id}
                            id={`${baseId}-tab-${item.id}`}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            aria-controls={`${baseId}-panel-${item.id}`}
                            onClick={() => onValueChange(item.id)}
                            className={cn("relative whitespace-nowrap px-3 pb-2.5 pt-1 text-sm transition-colors", isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                            {item.label}
                            {count ? <span className="ml-1.5 rounded bg-muted px-1.5 font-mono text-[11px]">{count}</span> : null}
                            {isActive && <motion.span layoutId="cliente-task-detail-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                        </button>
                    )
                })}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={value}
                    id={`${baseId}-panel-${value}`}
                    role="tabpanel"
                    aria-labelledby={`${baseId}-tab-${value}`}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.18 }}
                >
                    <Section task={task} id={value} />
                </motion.div>
            </AnimatePresence>
        </>
    )
}
