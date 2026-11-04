"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FileCode2 } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { Markdown } from "@/components/ui/markdown"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import type { TaskDetailDto } from "@/features/tasks/types"
import { WorkbenchTabs, type WorkbenchTab } from "./WorkbenchTabs"

type View = "description" | "spec"

const TABS: readonly WorkbenchTab<View>[] = [
    { id: "description", label: "Descrição" },
    { id: "spec", label: "Especificação" },
]

/** Altura do bloco de texto da tarefa (o skeleton usa a mesma). */
export const START_TASK_TEXT = "max-h-72 min-h-20 overflow-y-auto p-3"

/**
 * Bloco da tarefa na tela inicial da mesa: código, título e as abas **Descrição** e **Especificação**
 * (OPE-137, item 1) — a especificação técnica salva ou um estado vazio.
 */
export function StartTaskBlock({ query }: { query: { data?: TaskDetailDto; isLoading: boolean; error: unknown } }) {
    const [view, setView] = useState<View>("description")
    if (query.isLoading) {
        return (
            <div className="space-y-3" aria-label="Carregando a tarefa">
                <div className="space-y-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-2/3" />
                </div>
                <Skeleton className="h-28 w-full rounded-lg" />
            </div>
        )
    }
    const task = query.data
    if (!task) return <p className="text-sm text-muted-foreground">{apiErrorMessage(query.error, "Não foi possível carregar a tarefa")}</p>
    const text = view === "description" ? task.description : task.technicalSpec
    return (
        <div className="space-y-3">
            <div className="space-y-1">
                <p className="font-mono text-sm font-semibold text-primary">{task.code}</p>
                <h2 className="text-lg font-semibold">{task.title}</h2>
            </div>
            <div className="rounded-lg border bg-muted/30">
                <WorkbenchTabs tabs={TABS} value={view} onChange={setView} label="Texto da tarefa" indicatorId="start-workbench-task-tab" className="px-2 pt-1" />
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={view} role="tabpanel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className={START_TASK_TEXT}>
                        {text?.trim() ? (
                            <Markdown>{text}</Markdown>
                        ) : view === "spec" ? (
                            <EmptyState icon={FileCode2} title="Sem especificação técnica." description="Use Refinar tarefa para o Agente Refinador escrever a especificação." />
                        ) : (
                            <p className="text-sm text-muted-foreground">Sem descrição.</p>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}
