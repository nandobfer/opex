"use client"

import { AnimatePresence, motion } from "framer-motion"
import { MousePointerClick } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useWorkbenchByTask } from "../../hooks/useAgentic"
import type { CentralDto } from "../../types"
import { StartWorkbench } from "./StartWorkbench"
import { WorkbenchView } from "./WorkbenchView"

/**
 * Painel da direita: nada selecionado, tarefa sem mesa (abrir) ou a mesa de trabalho. `scopeName` é o
 * produto escolhido no seletor (`null` em "Todos os projetos"), usado só no aviso sem tarefa.
 */
export function WorkbenchPane({ central, taskId, scopeName }: { central: CentralDto; taskId: string | null; scopeName: string | null }) {
    const workbench = useWorkbenchByTask(taskId)
    const view = !taskId ? "empty" : workbench.isLoading ? "loading" : workbench.isError ? "error" : workbench.data ? "workbench" : "start"
    return (
        <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="flex min-h-0 flex-1 flex-col">
                    {view === "empty" && (
                        <div className="flex flex-1 items-center justify-center p-6">
                            <EmptyState icon={MousePointerClick} title="Selecione uma tarefa" description={scopeName ? `Escolha uma tarefa de ${scopeName} para abrir a mesa de trabalho.` : "Escolha uma tarefa para abrir a mesa de trabalho."} />
                        </div>
                    )}
                    {view === "loading" && (
                        <div className="space-y-3 p-4" aria-label="Carregando a mesa">
                            <Skeleton className="h-10 w-2/3" />
                            <Skeleton className="h-64 w-full" />
                        </div>
                    )}
                    {view === "error" && <ErrorState title="Não foi possível carregar a mesa" description={apiErrorMessage(workbench.error, "Tente novamente.")} onRetry={() => void workbench.refetch()} />}
                    {view === "start" && taskId && <StartWorkbench central={central} taskId={taskId} />}
                    {view === "workbench" && workbench.data && <WorkbenchView workbench={workbench.data} central={central} />}
                </motion.div>
            </AnimatePresence>
        </Card>
    )
}
