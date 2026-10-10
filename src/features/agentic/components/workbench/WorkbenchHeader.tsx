"use client"

import { useState } from "react"
import Link from "next/link"
import { ExternalLink, FolderTree, GitBranch, GitPullRequest, Plug, Trash2 } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { useDeleteWorkbench } from "../../hooks/useAgentic"
import type { CentralDto, WorkbenchDto } from "../../types"
import { QueueBadge } from "../QueueBadge"
import { WorkbenchStageBadge } from "../WorkbenchStageBadge"

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 })

const PR_STATE_LABELS = { open: "aberto", closed: "fechado", merged: "mergeado" } as const

/** Tarefa, etapa, conexão do stream, custo e os recursos da mesa (branch, worktree, porta, PR). */
export function WorkbenchHeader({ workbench, central, connected }: { workbench: WorkbenchDto; central: CentralDto; connected: boolean }) {
    const remove = useDeleteWorkbench()
    const [confirming, setConfirming] = useState(false)
    const usage = workbench.usage
    const tokens = usage.inputTokens + usage.outputTokens + usage.reasoningTokens

    return (
        <header className="space-y-2 border-b px-4 py-3">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/tarefas/${workbench.taskId}`} className="font-mono text-sm font-semibold text-primary hover:underline">
                            {workbench.taskCode}
                        </Link>
                        {workbench.stage === "build_queued" && workbench.buildQueuePosition ? (
                            <QueueBadge position={workbench.buildQueuePosition} label="Na fila do build" title="Aguardando a vez do build" />
                        ) : (
                            <WorkbenchStageBadge stage={workbench.stage} runState={workbench.runState} />
                        )}
                        <span className={cn("flex items-center gap-1 text-[11px]", connected ? "text-emerald-400" : "text-muted-foreground")} title={connected ? "Recebendo a saída ao vivo" : "Reconectando à saída ao vivo"}>
                            <Plug className="h-3 w-3" aria-hidden /> {connected ? "ao vivo" : "reconectando"}
                        </span>
                    </div>
                    <h2 className="truncate text-base font-semibold" title={workbench.taskTitle}>
                        {workbench.taskTitle}
                    </h2>
                </div>
                <div className="hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block">
                    <p className="font-mono text-foreground">{usd.format(usage.costUsd)}</p>
                    <p>{compact.format(tokens)} tokens</p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Excluir mesa" onClick={() => setConfirming(true)}>
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                </Button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {workbench.branch && (
                    <span className="flex items-center gap-1 font-mono">
                        <GitBranch className="h-3 w-3" aria-hidden /> {workbench.branch}
                    </span>
                )}
                {workbench.worktreePath && (
                    <span className="flex min-w-0 items-center gap-1 font-mono" title={workbench.worktreePath}>
                        <FolderTree className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{workbench.sessionDirectory === workbench.worktreePath ? "sessão no worktree" : workbench.worktreePath}</span>
                    </span>
                )}
                {workbench.port && <span className="font-mono">porta {workbench.port}</span>}
                {workbench.previewUrl && (
                    <a href={workbench.previewUrl} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 text-foreground hover:underline">
                        prévia <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                )}
                {workbench.pr && (
                    <a href={workbench.pr.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 text-foreground hover:underline">
                        <GitPullRequest className="h-3 w-3" aria-hidden /> PR #{workbench.pr.number} ({PR_STATE_LABELS[workbench.pr.state]})
                    </a>
                )}
            </div>
            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir a mesa de {workbench.taskCode}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            O agente é interrompido e a saída da mesa é apagada. O worktree, a branch, os containers da prévia e o PR não são tocados — limpe-os manualmente em {central.config.sessionDirectory} se precisar.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(workbench)}>Excluir mesa</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </header>
    )
}
