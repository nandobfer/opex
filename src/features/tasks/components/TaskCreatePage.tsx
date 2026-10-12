"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, Github, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { usePendingAttachments, useOwnerAttachmentClient } from "../attachments/hooks"
import { PendingAttachmentsField } from "../attachments/components/PendingAttachmentsField"
import { useTaskBoard } from "../hooks/useTaskBoard"
import { useCreateTask, useTaskOptions } from "../hooks/useTasks"
import { TASKS_PATH, taskPath } from "../constants"
import { TaskForm } from "./TaskForm"

/** Página de criação da tarefa (`/tarefas/nova`): cria a tarefa e a issue no GitHub vinculada. */
export function TaskCreatePage() {
    const reduceMotion = useReducedMotion()
    const router = useRouter()
    const options = useTaskOptions()
    const board = useTaskBoard()
    const create = useCreateTask()
    const attachmentClient = useOwnerAttachmentClient()
    const pending = usePendingAttachments(attachmentClient)
    const projects = options.data?.projects ?? []
    const loading = options.isLoading || board.isLoading

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
            <header className="space-y-3">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={TASKS_PATH}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Tarefas
                    </Link>
                </Button>
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <Plus className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-lg font-semibold md:text-2xl">Nova tarefa</h1>
                        <p className="text-sm text-muted-foreground">A tarefa também cria uma issue no repositório escolhido e fica vinculada a ela.</p>
                    </div>
                </div>
            </header>

            {loading ? (
                <Card>
                    <CardContent className="space-y-4 pt-6" aria-label="Carregando formulário">
                        <Skeleton className="h-9 w-full" />
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-9 w-full" />
                    </CardContent>
                </Card>
            ) : projects.length === 0 ? (
                <EmptyState icon={Github} title="Nenhum repositório vinculado" description="Vincule um repositório em Integrações › GitHub para criar tarefas.">
                    <Button asChild size="sm" variant="outline">
                        <Link href="/integracoes/github">Ir para a integração GitHub</Link>
                    </Button>
                </EmptyState>
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <TaskForm
                            mode="create"
                            projects={projects}
                            columns={board.columns}
                            submitting={create.isPending}
                            uploading={pending.active > 0}
                            attachments={<PendingAttachmentsField state={pending} />}
                            uploads={pending.media}
                            onCancel={() => router.push(TASKS_PATH)}
                            onSubmit={async (values) => {
                                try {
                                    const task = await create.mutateAsync({ ...values, attachmentIds: pending.ids })
                                    router.push(taskPath(task.id))
                                } catch {
                                    // Toast já mostrado; o formulário fica aberto para corrigir.
                                }
                            }}
                        />
                    </CardContent>
                </Card>
            )}
        </motion.section>
    )
}
