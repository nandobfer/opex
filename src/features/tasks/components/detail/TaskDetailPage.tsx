"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, ExternalLink, FileSearch, KeyRound, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { IssueIconButton } from "@/features/github/components/shared"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { integrationPath } from "@/lib/integrations/catalog"
import { cn } from "@/lib/utils"
import { TASKS_PATH } from "../../constants"
import { useTaskBoard } from "../../hooks/useTaskBoard"
import { isSessionError, useTaskDetail, useTaskOptions, useTasksRealtime, useUpdateTask } from "../../hooks/useTasks"
import { buildPeople } from "../../people"
import { useTaskMoveFlow } from "../../hooks/useTaskMoveFlow"
import type { TaskDetailDto } from "../../types"
import { TimerButton } from "@/features/time/components/TimerButton"
import { TimerIndicator } from "@/features/time/components/TimerIndicator"
import { UnderstandTaskButton } from "@/features/ai/components/understand-task/UnderstandTaskButton"
import { WorkbenchButton } from "@/features/agentic/components/WorkbenchButton"
import { MoveUrlDialog } from "../MoveUrlDialog"
import { ArchivedBadge, IssueNoticeBadge, TaskTypeBadge } from "../TaskBadges"
import { isDraftTaskId } from "../../drafts"
import { DraftDetailPage } from "../draft/DraftDetailPage"
import { TaskStatusMenu } from "../TaskStatusMenu"
import { TaskDetailSidebar } from "./TaskDetailSidebar"
import { CommentsSection, DescriptionSection, HistorySection, PlanSection, TimeLogsSection } from "./TaskDetailSections"

const TABS = [
    { id: "description", label: "Descrição", render: DescriptionSection, count: null },
    { id: "plan", label: "Plano", render: PlanSection, count: null },
    { id: "comments", label: "Comentários", render: CommentsSection, count: (task: TaskDetailDto) => task.comments.length },
    { id: "history", label: "Histórico", render: HistorySection, count: (task: TaskDetailDto) => task.history.length },
    { id: "time", label: "Horas", render: TimeLogsSection, count: (task: TaskDetailDto) => task.timeLogs.length },
] as const

type TabId = (typeof TABS)[number]["id"]

/** Página da tarefa (`/tarefas/[id]`); ids `draft-…` abrem a página do rascunho. */
export function TaskDetailPage({ id }: { id: string }) {
    return isDraftTaskId(id) ? <DraftDetailPage id={id} /> : <GoTaskDetailPage id={id} />
}

/** Tarefa do Go! Sipal: leitura completa; status, responsável e prioridade são alteráveis. */
function GoTaskDetailPage({ id }: { id: string }) {
    const reduceMotion = useReducedMotion()
    const query = useTaskDetail(id)
    useTasksRealtime()
    const board = useTaskBoard(!query.isError)
    const flow = useTaskMoveFlow(board.columns)
    const options = useTaskOptions(!query.isError)
    const update = useUpdateTask()
    const [tab, setTab] = useState<TabId>("description")
    const task = query.data
    const currentUserId = options.data?.currentUserId ?? null
    const people = useMemo(() => buildPeople(options.data, task ? [task] : [], currentUserId), [options.data, task, currentUserId])

    const view = query.isLoading ? "loading" : query.isError ? (isSessionError(query.error) ? "session" : apiErrorCode(query.error) === "TASK_NOT_FOUND" ? "missing" : "error") : "ready"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={TASKS_PATH}>
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
                    {view === "session" && (
                        <EmptyState icon={KeyRound} title="Conecte-se ao Go! Sipal" description={apiErrorMessage(query.error, "Entre com o código enviado por e-mail.")}>
                            <Button asChild size="sm">
                                <Link href={integrationPath("go_sipal")}>Conectar ao Go! Sipal</Link>
                            </Button>
                        </EmptyState>
                    )}
                    {view === "missing" && (
                        <EmptyState icon={FileSearch} title="Tarefa não encontrada" description="Ela pode ter sido excluída no Go! Sipal ou o endereço está incorreto.">
                            <Button asChild size="sm" variant="outline">
                                <Link href={TASKS_PATH}>Voltar para Tarefas</Link>
                            </Button>
                        </EmptyState>
                    )}
                    {view === "error" && <ErrorState title="Não foi possível carregar a tarefa" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />}
                    {view === "ready" && task && (
                        <div className="space-y-4">
                            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-sm font-semibold text-primary">{task.code}</span>
                                        <TaskTypeBadge type={task.taskType} long />
                                        {task.archived && <ArchivedBadge />}
                                        {task.issue?.notice && <IssueNoticeBadge notice={task.issue.notice} />}
                                    </div>
                                    <h1 className="text-xl font-semibold leading-tight md:text-2xl">{task.title}</h1>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <TimerIndicator />
                                    <TimerButton task={task} size="md" withLabel />
                                    <TaskStatusMenu task={task} columns={board.columns} moving={flow.movingId === task.id} onMove={(current, status) => flow.move(current, status)} size="default" />
                                    <UnderstandTaskButton taskId={task.id} taskCode={task.code} />
                                    <WorkbenchButton taskId={task.id} productId={task.product?.id ?? null} />
                                    {task.issue && <IssueIconButton url={task.issue.url} repo={task.issue.repo} number={task.issue.number} />}
                                    <TooltipIconButton label="Abrir no Go! Sipal" href={task.platformUrl} external>
                                        <ExternalLink aria-hidden />
                                    </TooltipIconButton>
                                </div>
                            </header>

                            <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
                                <Card className="min-w-0">
                                    <CardContent className="space-y-4 pt-4">
                                        <div role="tablist" aria-label="Seções da tarefa" className="flex gap-1 overflow-x-auto border-b">
                                            {TABS.map((item) => {
                                                const active = tab === item.id
                                                const count = item.count?.(task)
                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        role="tab"
                                                        aria-selected={active}
                                                        onClick={() => setTab(item.id)}
                                                        className={cn("relative whitespace-nowrap px-3 pb-2.5 pt-1 text-sm transition-colors", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                                                    >
                                                        {item.label}
                                                        {count ? <span className="ml-1.5 rounded bg-muted px-1.5 font-mono text-[11px]">{count}</span> : null}
                                                        {active && <motion.span layoutId="task-detail-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        <AnimatePresence mode="wait" initial={false}>
                                            <motion.div key={tab} role="tabpanel" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
                                                {TABS.find((item) => item.id === tab)!.render({ task })}
                                            </motion.div>
                                        </AnimatePresence>
                                    </CardContent>
                                </Card>
                                <TaskDetailSidebar
                                    task={task}
                                    people={people}
                                    currentUserId={currentUserId}
                                    updating={update.isPending}
                                    onUpdate={(change) => update.mutate({ task, ...change })}
                                />
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            <MoveUrlDialog request={flow.request} submitting={flow.submitting} error={flow.dialogError} onConfirm={flow.confirmUrl} onCancel={flow.cancel} />
        </motion.section>
    )
}
