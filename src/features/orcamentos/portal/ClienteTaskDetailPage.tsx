"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, FileSearch, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { ArchivedBadge, TaskTypeBadge } from "@/features/tasks/components/TaskBadges"
import { TaskSummaryCard } from "@/features/tasks/components/detail/TaskSummaryCard"
import { clienteTarefasPath } from "../constants"
import { repoLabelIndex } from "../logic"
import { useClienteOptions, useClienteRealtime, useClienteTask, useSetClienteTaskPriority } from "./hooks"
import { ClienteTaskSidebar } from "./components/ClienteTaskSidebar"
import { ClienteTaskTabs, type ClienteTaskTabId } from "./components/ClienteTaskTabs"

/** Página da tarefa do cliente (`/cliente/tarefa/[id]`): detalhes equivalentes, somente leitura. */
export function ClienteTaskDetailPage({ id }: { id: string }) {
    const reduceMotion = useReducedMotion()
    const query = useClienteTask(id)
    const options = useClienteOptions()
    const priority = useSetClienteTaskPriority()
    const [tab, setTab] = useState<ClienteTaskTabId>("description")
    const task = query.data
    useClienteRealtime()
    const repoIndex = useMemo(() => repoLabelIndex(options.data?.projects ?? []), [options.data])

    const view = query.isLoading ? "loading" : query.isError ? (apiErrorCode(query.error) === "TASK_NOT_FOUND" ? "missing" : "error") : "ready"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={clienteTarefasPath()}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Tarefas
                    </Link>
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Atualizar tarefa">
                    <motion.span animate={{ rotate: query.isFetching ? 360 : 0 }} transition={query.isFetching ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </motion.span>
                    Atualizar
                </Button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                    {view === "loading" && (
                        <div className="grid gap-4 lg:grid-cols-[1fr_320px]" aria-label="Carregando tarefa">
                            <div className="space-y-3">
                                <Skeleton className="h-8 w-2/3" />
                                <Skeleton className="h-64 w-full" />
                            </div>
                            <Skeleton className="h-96 w-full" />
                        </div>
                    )}
                    {view === "missing" && (
                        <EmptyState icon={FileSearch} title="Tarefa não encontrada" description="Ela pode ter sido removida ou não faz parte das tarefas que você solicitou.">
                            <Button asChild size="sm" variant="outline">
                                <Link href={clienteTarefasPath()}>Voltar para Tarefas</Link>
                            </Button>
                        </EmptyState>
                    )}
                    {view === "error" && <ErrorState title="Não foi possível carregar a tarefa" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />}
                    {view === "ready" && task && (
                        <div className="space-y-4">
                            <header className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-sm font-semibold text-primary">{task.code}</span>
                                    <TaskTypeBadge type={task.taskType} long />
                                    {task.archived && <ArchivedBadge />}
                                </div>
                                <h1 className="text-xl font-semibold leading-tight md:text-2xl">{task.title}</h1>
                            </header>

                            <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
                                <div className="min-w-0 space-y-4">
                                    {task.summary && <TaskSummaryCard summary={task.summary} />}
                                    <Card className="min-w-0">
                                        <CardContent className="space-y-4 pt-4">
                                            <ClienteTaskTabs task={task} value={tab} onValueChange={setTab} />
                                        </CardContent>
                                    </Card>
                                </div>
                                <ClienteTaskSidebar task={task} repoIndex={repoIndex} onUpdate={(value) => priority.mutate({ task, priority: value })} updating={priority.isPending} />
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </motion.section>
    )
}
