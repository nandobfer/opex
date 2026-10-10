"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Info, Loader2, MousePointerClick, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useTaskDetail } from "@/features/tasks/hooks/useTasks"
import { useAgenticSettings, useStartWorkbench, useWorkbenchByTask } from "../../hooks/useAgentic"
import type { CentralDto } from "../../types"
import { WorkbenchView } from "./WorkbenchView"

/** Painel da direita: nada selecionado, tarefa sem mesa (abrir) ou a mesa de trabalho. */
export function WorkbenchPane({ central, taskId }: { central: CentralDto; taskId: string | null }) {
    const workbench = useWorkbenchByTask(taskId)
    const view = !taskId ? "empty" : workbench.isLoading ? "loading" : workbench.isError ? "error" : workbench.data ? "workbench" : "start"
    return (
        <Card className="flex min-h-[520px] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="flex min-h-0 flex-1 flex-col">
                    {view === "empty" && (
                        <div className="flex flex-1 items-center justify-center p-6">
                            <EmptyState icon={MousePointerClick} title="Selecione uma tarefa" description={`Escolha uma tarefa de ${central.projectName} para abrir a mesa de trabalho.`} />
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

function StartWorkbench({ central, taskId }: { central: CentralDto; taskId: string }) {
    const task = useTaskDetail(taskId)
    const settings = useAgenticSettings()
    const start = useStartWorkbench()
    const availability = settings.data?.availability
    const blocked = !central.config.enabled ? "A central está desativada" : availability && !availability.available ? availability.reason : null
    const otherProject = task.data && task.data.project?.id !== central.projectId

    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            {task.isLoading ? (
                <Skeleton className="h-16 w-80" />
            ) : task.data ? (
                <div className="max-w-xl space-y-1">
                    <p className="font-mono text-sm font-semibold text-primary">{task.data.code}</p>
                    <h2 className="text-lg font-semibold">{task.data.title}</h2>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">{apiErrorMessage(task.error, "Não foi possível carregar a tarefa")}</p>
            )}
            <p className="max-w-lg text-sm text-muted-foreground">
                A mesa começa gerando o plano com o agente de planejamento, no diretório <span className="font-mono text-foreground">{central.config.sessionDirectory}</span>. Você revisa o plano antes de qualquer alteração no código.
            </p>
            <Button type="button" className="gap-1.5" disabled={Boolean(blocked) || Boolean(otherProject) || !task.data || start.isPending} onClick={() => start.mutate({ centralId: central.id, taskId })}>
                {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                Abrir mesa e gerar o plano
            </Button>
            {(blocked || otherProject) && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5" aria-hidden /> {otherProject ? `A tarefa não é do projeto ${central.projectName}` : blocked}
                </p>
            )}
        </div>
    )
}
