"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArchiveRestore, ArrowLeft, CheckCircle2, FileSearch, RefreshCw, Send, Trash2 } from "lucide-react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import type { TaskDraftDetailDto } from "@/features/github/types"
import { UnderstandTaskButton } from "@/features/ai/components/understand-task/UnderstandTaskButton"
import { IssueIconButton } from "@/features/github/components/shared"
import { TASKS_PATH, taskPath } from "../../constants"
import { draftMongoId } from "../../drafts"
import { useDiscardDraft, useDraftDetail, useRestoreDraftTask } from "../../hooks/useDrafts"
import { useTaskBoard } from "../../hooks/useTaskBoard"
import { useTaskMoveFlow } from "../../hooks/useTaskMoveFlow"
import { useTaskOptions, useTasksRealtime } from "../../hooks/useTasks"
import { buildPeople } from "../../people"
import type { TaskDto } from "../../types"
import { DraftBadge, TaskTypeBadge } from "../TaskBadges"
import { TaskStatusMenu } from "../TaskStatusMenu"
import { DraftContent } from "./DraftContent"
import { DraftSidebar } from "./DraftSidebar"
import { SendDraftDialog, type SendDraftRequest } from "./SendDraftDialog"

/** O rascunho como tarefa do quadro (para o menu de status e o envio). */
export function draftDetailToTask(draft: TaskDraftDetailDto): TaskDto {
    return {
        id: draft.id,
        code: draft.code,
        title: draft.title,
        status: "backlog",
        order: 0,
        taskType: draft.taskType,
        priority: draft.priority,
        product: draft.product,
        workPackage: draft.workPackage ? { ...draft.workPackage, startDate: null, endDate: null } : null,
        assignee: draft.assignee,
        commitUrl: null,
        pullRequestUrl: null,
        archived: false,
        createdAt: draft.issueCreatedAt,
        updatedAt: draft.updatedAt,
        localColumn: draft.columnKey,
        localOrder: null,
        draft: { id: draftMongoId(draft.id), repo: draft.repo, number: draft.number, issueClosed: draft.issueState === "closed" },
        issue: { url: draft.issueUrl, repo: draft.repo, number: draft.number, state: draft.issueState, notice: null },
    }
}

/** Página do rascunho (`/tarefas/draft-…`): edição, mover entre colunas pessoais, descartar e enviar. */
export function DraftDetailPage({ id }: { id: string }) {
    const router = useRouter()
    const reduceMotion = useReducedMotion()
    const query = useDraftDetail(id)
    useTasksRealtime()
    const board = useTaskBoard()
    const flow = useTaskMoveFlow(board.columns)
    const options = useTaskOptions()
    const discard = useDiscardDraft()
    const restore = useRestoreDraftTask()
    const [sending, setSending] = useState<SendDraftRequest | null>(null)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const draft = query.data
    const task = useMemo(() => (draft ? draftDetailToTask(draft) : null), [draft])
    const currentUserId = options.data?.currentUserId ?? null
    const people = useMemo(() => buildPeople(options.data, task ? [task] : [], currentUserId), [options.data, task, currentUserId])
    const sendRequest = sending ?? flow.sendRequest

    const view = query.isLoading ? "loading" : query.isError ? (apiErrorCode(query.error) === "DRAFT_NOT_FOUND" ? "missing" : "error") : draft?.state === "sent" ? "sent" : draft?.state === "discarded" ? "discarded" : "ready"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={TASKS_PATH}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Tarefas
                    </Link>
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Atualizar rascunho">
                    <motion.span animate={{ rotate: query.isFetching ? 360 : 0 }} transition={query.isFetching ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </motion.span>
                    Atualizar
                </Button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                    {view === "loading" && (
                        <div className="grid gap-4 lg:grid-cols-[1fr_320px]" aria-label="Carregando rascunho">
                            <div className="space-y-3">
                                <Skeleton className="h-8 w-2/3" />
                                <Skeleton className="h-64 w-full" />
                            </div>
                            <Skeleton className="h-96 w-full" />
                        </div>
                    )}
                    {view === "missing" && (
                        <EmptyState icon={FileSearch} title="Rascunho não encontrado" description="Ele pode ter sido removido ou o endereço está incorreto.">
                            <Button asChild size="sm" variant="outline">
                                <Link href={TASKS_PATH}>Voltar para Tarefas</Link>
                            </Button>
                        </EmptyState>
                    )}
                    {view === "error" && <ErrorState title="Não foi possível carregar o rascunho" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />}
                    {view === "sent" && draft && (
                        <EmptyState icon={CheckCircle2} title={`${draft.code} já está no Go! Sipal`} description={`Enviado como ${draft.goTaskCode ?? "tarefa"}${draft.images?.total ? ` (${draft.images.attached} de ${draft.images.total} imagens anexadas)` : ""}.`}>
                            {draft.goTaskId && (
                                <Button asChild size="sm">
                                    <Link href={taskPath(draft.goTaskId)}>Abrir {draft.goTaskCode ?? "tarefa"}</Link>
                                </Button>
                            )}
                        </EmptyState>
                    )}
                    {view === "discarded" && draft && task && (
                        <EmptyState icon={Trash2} title={`${draft.code} foi descartado`} description="A sincronização não recria este rascunho. Restaure para trazê-lo de volta ao quadro.">
                            <Button type="button" size="sm" className="gap-1.5" disabled={restore.isPending} onClick={() => restore.mutate(task)}>
                                <ArchiveRestore className="h-4 w-4" aria-hidden /> Restaurar
                            </Button>
                        </EmptyState>
                    )}
                    {view === "ready" && draft && task && (
                        <div className="space-y-4">
                            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-sm font-semibold text-primary">{draft.code}</span>
                                        <TaskTypeBadge type={draft.taskType} long />
                                        <DraftBadge closed={draft.issueState === "closed"} />
                                    </div>
                                    <h1 className="text-xl font-semibold leading-tight md:text-2xl">{draft.title}</h1>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <TaskStatusMenu task={task} columns={board.columns} moving={flow.movingId === task.id} onMove={(current, column) => flow.move(current, column)} size="default" />
                                    <UnderstandTaskButton taskId={draft.id} taskCode={draft.code} label="Entender rascunho" />
                                    <IssueIconButton url={draft.issueUrl} repo={draft.repo} number={draft.number} />
                                    <Button type="button" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmDiscard(true)}>
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Descartar
                                    </Button>
                                    <Button type="button" className="gap-1.5" onClick={() => setSending({ task, status: "backlog" })}>
                                        <Send className="h-3.5 w-3.5" aria-hidden /> Enviar para o Go! Sipal
                                    </Button>
                                </div>
                            </header>
                            <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
                                <DraftContent draft={draft} />
                                <DraftSidebar draft={draft} people={people} currentUserId={currentUserId} />
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            <SendDraftDialog
                request={sendRequest}
                people={people}
                currentUserId={currentUserId}
                onClose={() => {
                    setSending(null)
                    flow.closeSend()
                }}
                onSent={(taskId) => router.push(taskPath(taskId))}
            />

            <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Descartar {draft?.code}?</AlertDialogTitle>
                        <AlertDialogDescription>O rascunho sai do quadro e a sincronização não o recria. Dá para desfazer pelo aviso ou restaurar depois.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => task && discard.mutate(task)}>Descartar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.section>
    )
}
