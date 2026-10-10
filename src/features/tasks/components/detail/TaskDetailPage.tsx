"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, FileSearch, Pencil, RefreshCw, Trash2 } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { IssueIconButton } from "@/features/github/components/shared"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { TASKS_PATH } from "../../constants"
import { useTaskBoard } from "../../hooks/useTaskBoard"
import { useDeleteTask, useTaskDetail, useTaskOptions, useTasksRealtime, useUpdateTask } from "../../hooks/useTasks"
import { useTaskMoveFlow } from "../../hooks/useTaskMoveFlow"
import type { TaskDetailDto } from "../../types"
import { TimerIndicator } from "@/features/time/components/TimerIndicator"
import { UnderstandTaskButton } from "@/features/ai/components/understand-task/UnderstandTaskButton"
import { TaskSummaryButton } from "@/features/ai/components/task-summary/TaskSummaryButton"
import { WorkbenchButton } from "@/features/agentic/components/WorkbenchButton"
import { ArchivedBadge, IssueNoticeBadge, TaskTypeBadge } from "../TaskBadges"
import { TaskColumnMenu } from "../TaskColumnMenu"
import { TaskForm } from "../TaskForm"
import { TaskDetailSidebar } from "./TaskDetailSidebar"
import { CommentsSection, DescriptionSection, HistorySection, TimeLogsSection } from "./TaskDetailSections"
import { TaskSummaryCard } from "./TaskSummaryCard"

const TABS = [
    { id: "description", label: "Descrição", render: DescriptionSection, count: null },
    { id: "comments", label: "Comentários", render: CommentsSection, count: (task: TaskDetailDto) => task.comments.length },
    { id: "history", label: "Histórico", render: HistorySection, count: (task: TaskDetailDto) => task.history.length },
    { id: "time", label: "Horas", render: TimeLogsSection, count: (task: TaskDetailDto) => task.timeLogs.length },
] as const

type TabId = (typeof TABS)[number]["id"]

/** Página da tarefa (`/tarefas/[id]`). */
export function TaskDetailPage({ id }: { id: string }) {
    const reduceMotion = useReducedMotion()
    const router = useRouter()
    const query = useTaskDetail(id)
    useTasksRealtime()
    const board = useTaskBoard(!query.isError)
    const flow = useTaskMoveFlow(board.columns)
    const options = useTaskOptions(!query.isError)
    const update = useUpdateTask()
    const remove = useDeleteTask()
    const [tab, setTab] = useState<TabId>("description")
    const [editing, setEditing] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const task = query.data
    const projects = options.data?.projects ?? []

    const view = query.isLoading ? "loading" : query.isError ? (apiErrorCode(query.error) === "TASK_NOT_FOUND" ? "missing" : "error") : "ready"

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
                    {view === "missing" && (
                        <EmptyState icon={FileSearch} title="Tarefa não encontrada" description="Ela pode ter sido excluída ou o endereço está incorreto.">
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
                                    <TaskColumnMenu task={task} columns={board.columns} moving={flow.movingId === task.id} onMove={(current, column) => flow.move(current, column)} size="default" />
                                    <UnderstandTaskButton taskId={task.id} taskCode={task.code} />
                                    <TaskSummaryButton taskId={task.id} taskCode={task.code} />
                                    <WorkbenchButton taskId={task.id} projectId={task.project?.id ?? null} />
                                    {task.issue && <IssueIconButton url={task.issue.url} repo={task.issue.repo} number={task.issue.number} />}
                                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setEditing(true)} aria-label="Editar tarefa" title="Editar tarefa">
                                        <Pencil className="h-4 w-4" aria-hidden />
                                    </Button>
                                    <Button type="button" variant="outline" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)} aria-label="Excluir tarefa" title="Excluir tarefa">
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                    </Button>
                                </div>
                            </header>

                            <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
                                <div className="min-w-0 space-y-4">
                                    {task.summary && <TaskSummaryCard summary={task.summary} />}
                                    <Card className="min-w-0">
                                        <CardContent className="space-y-4 pt-4">
                                            {editing ? (
                                                <TaskForm
                                                    mode="edit"
                                                    task={task}
                                                    projects={projects}
                                                    columns={board.columns}
                                                    submitting={update.isPending}
                                                    onCancel={() => setEditing(false)}
                                                    onSubmit={async (values) => {
                                                        try {
                                                            await update.mutateAsync({ task, body: values, success: `Tarefa ${task.code} salva` })
                                                            setEditing(false)
                                                        } catch {
                                                            // Toast já mostrado; o formulário fica aberto para corrigir.
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <>
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
                                                </>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                                <TaskDetailSidebar task={task} updating={update.isPending} onUpdate={(priority) => update.mutate({ task, body: { priority }, patch: { priority }, success: `${task.code} com prioridade ${priority}` })} />
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir a tarefa {task?.code}?</AlertDialogTitle>
                        <AlertDialogDescription>Ela sai do quadro, junto com comentários e horas apontadas. Não dá para desfazer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={async () => {
                                if (!task) return
                                try {
                                    await remove.mutateAsync(task)
                                    router.push(TASKS_PATH)
                                } catch {
                                    // Toast já mostrado.
                                }
                            }}
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.section>
    )
}
