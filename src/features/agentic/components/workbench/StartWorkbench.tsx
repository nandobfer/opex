"use client"

import { useState } from "react"
import { Info, ListOrdered, Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ToggleCard } from "@/components/ui/toggle-card"
import { apiErrorMessage } from "@/lib/api"
import { useTaskDetail, useUpdateTask } from "@/features/tasks/hooks/useTasks"
import type { TaskAgenticFlow } from "@/features/tasks/constants"
import { useAgenticSettings, useCentralQueue, useStartWorkbench } from "../../hooks/useAgentic"
import type { CentralDto } from "../../types"

/**
 * Estado inicial da mesa (tarefa ainda sem mesa): mostra o código, o título e a **descrição** da
 * tarefa, o **fluxo da mesa** (Publicar prévia ou PR automático) e um campo opcional de
 * **informações adicionais**. Ao abrir a mesa, essas informações são anexadas à tarefa e enviadas
 * ao planejador no primeiro prompt.
 */
export function StartWorkbench({ central, taskId }: { central: CentralDto; taskId: string }) {
    const task = useTaskDetail(taskId)
    const settings = useAgenticSettings()
    const queue = useCentralQueue(central.id)
    const start = useStartWorkbench()
    const update = useUpdateTask()
    const [text, setText] = useState("")
    const availability = settings.data?.availability
    const blocked = !central.config.enabled ? "A central está desativada" : availability && !availability.available ? availability.reason : null
    const otherProject = task.data && task.data.project?.id !== central.projectId
    const queueItem = queue.data?.find((item) => item.taskId === taskId) ?? null
    const flow: TaskAgenticFlow = task.data?.agenticFlow ?? "preview"

    /** Salva o fluxo na tarefa na hora (otimista): a mesa nova nasce com a escolha já persistida. */
    const setFlow = (autoPr: boolean) => {
        if (!task.data) return
        const agenticFlow: TaskAgenticFlow = autoPr ? "auto_pr" : "preview"
        update.mutate({ task: { id: task.data.id, code: task.data.code }, body: { agenticFlow }, patch: { agenticFlow } })
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
            <div className="my-auto flex w-full flex-col gap-4" data-ctrl-enter-scope>
                {task.isLoading ? (
                    <Skeleton className="h-20 w-full" />
                ) : task.data ? (
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <p className="font-mono text-sm font-semibold text-primary">{task.data.code}</p>
                            <h2 className="text-lg font-semibold">{task.data.title}</h2>
                        </div>
                        {task.data.description && (
                            <div className="rounded-lg border bg-muted/30 p-3">
                                <p className="mb-1 text-xs font-medium text-muted-foreground">Descrição da tarefa</p>
                                <Markdown>{task.data.description}</Markdown>
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">{apiErrorMessage(task.error, "Não foi possível carregar a tarefa")}</p>
                )}
                <p className="text-sm text-muted-foreground">
                    A mesa começa gerando o plano com o agente de planejamento, no diretório <span className="font-mono text-foreground">{central.config.sessionDirectory}</span>. Você revisa o plano antes de qualquer alteração no código.
                </p>
                {queueItem && (
                    <p className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary">
                        <ListOrdered className="h-3.5 w-3.5" aria-hidden /> Na fila da central — posição {queueItem.position}. A mesa abre quando uma vaga liberar.
                    </p>
                )}
                {task.data && (
                    <ToggleCard
                        id="workbench-flow"
                        checked={flow === "auto_pr"}
                        onCheckedChange={setFlow}
                        disabled={update.isPending}
                        label="Fluxo da mesa"
                        description={flow === "auto_pr" ? "O agente pula a prévia e abre o Pull Request assim que a implementação terminar. A revisão do plano continua obrigatória." : "O agente sobe a prévia depois da implementação e espera a sua aprovação antes de abrir o Pull Request."}
                        onLabel="PR automático"
                        offLabel="Publicar prévia"
                    />
                )}
                <div className="space-y-1.5">
                    <label htmlFor="workbench-start-context" className="text-sm font-medium">
                        Informações adicionais (opcional)
                    </label>
                    <Textarea id="workbench-start-context" rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder="Ex.: regras de negócio, decisões, links, o que evitar…" />
                    <p className="text-xs text-muted-foreground">Essas informações são enviadas ao agente junto da tarefa, no primeiro prompt.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" data-ctrl-enter-submit className="gap-1.5" disabled={Boolean(blocked) || Boolean(otherProject) || !task.data || start.isPending || update.isPending} onClick={() => start.mutate({ centralId: central.id, taskId, text: text.trim() || undefined })}>
                        {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                        Abrir mesa e gerar o plano
                    </Button>
                    {(blocked || otherProject) && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Info className="h-3.5 w-3.5" aria-hidden /> {otherProject ? `A tarefa não é do projeto ${central.projectName}` : blocked}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
