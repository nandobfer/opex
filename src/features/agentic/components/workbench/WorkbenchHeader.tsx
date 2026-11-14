"use client"

import { useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, ExternalLink, FolderTree, GitBranch, GitPullRequest, Plug, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { taskPathOrId } from "@/features/tasks/constants"
import type { CentralDto, WorkbenchDto } from "../../types"
import { QueueBadge } from "../QueueBadge"
import { WorkbenchStageBadge } from "../WorkbenchStageBadge"
import { DeleteWorkbenchDialog } from "./DeleteWorkbenchDialog"
import { ForksOpenBadge } from "./ForkStatusBadge"
import { WorkbenchBackLink } from "./WorkbenchBackLink"
import { WorkbenchStageMenu } from "./WorkbenchStageMenu"

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 })

const PR_STATE_LABELS = { open: "aberto", closed: "fechado", merged: "mergeado" } as const

/** Custo e tokens da mesa. */
function UsageSummary({ workbench, className }: { workbench: WorkbenchDto; className?: string }) {
    const usage = workbench.usage
    const tokens = usage.inputTokens + usage.outputTokens + usage.reasoningTokens
    return (
        <div className={cn("text-[11px] text-muted-foreground", className)}>
            <p className="font-mono text-foreground">{usd.format(usage.costUsd)}</p>
            <p>{compact.format(tokens)} tokens</p>
        </div>
    )
}

/** Recursos da mesa: branch, worktree, porta e (no desktop) os links da prévia e do PR. */
function WorkbenchResources({ workbench, links, className }: { workbench: WorkbenchDto; links: boolean; className?: string }) {
    return (
        <div className={cn("flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
            {workbench.branch && (
                <span className="flex min-w-0 items-center gap-1 font-mono">
                    <GitBranch className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{workbench.branch}</span>
                </span>
            )}
            {workbench.worktreePath && (
                <span className="flex min-w-0 items-center gap-1 font-mono" title={workbench.worktreePath}>
                    <FolderTree className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{workbench.sessionDirectory === workbench.worktreePath ? "sessão no worktree" : workbench.worktreePath}</span>
                </span>
            )}
            {workbench.port && <span className="font-mono">porta {workbench.port}</span>}
            {links && workbench.previewUrl && (
                <a href={workbench.previewUrl} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 text-foreground hover:underline">
                    prévia <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
            )}
            {links && workbench.pr && (
                <a href={workbench.pr.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 text-foreground hover:underline">
                    <GitPullRequest className="h-3 w-3" aria-hidden /> PR #{workbench.pr.number} ({PR_STATE_LABELS[workbench.pr.state]})
                </a>
            )}
        </div>
    )
}

/** Atalho de ícone (celular): alvo de toque de 36 px. */
const MOBILE_ICON = "h-9 w-9 shrink-0 lg:hidden"

/**
 * Tarefa, etapa, conexão do stream, custo e os recursos da mesa (branch, worktree, porta, PR). Abaixo de
 * `lg` (OPE-166) o cabeçalho fica em duas linhas: "Voltar para tarefas" e os atalhos da prévia e do PR viram
 * ícones, e branch/worktree/porta/custo ficam atrás de "Detalhes"; "Mais ações" e "Excluir mesa" vão para a
 * folha "Mais ações" do pé da mesa.
 */
export function WorkbenchHeader({ workbench, central, connected }: { workbench: WorkbenchDto; central: CentralDto; connected: boolean }) {
    const [confirming, setConfirming] = useState(false)
    const [details, setDetails] = useState(false)

    return (
        <header className="space-y-2 border-b px-4 py-3 max-lg:space-y-1.5 max-lg:px-3 max-lg:py-2">
            <div className="flex items-start gap-3 max-lg:items-center max-lg:gap-1.5">
                <WorkbenchBackLink className="-ml-1.5" />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href={taskPathOrId(workbench.taskCode, workbench.taskId)} className="font-mono text-sm font-semibold text-primary hover:underline">
                            {workbench.taskCode}
                        </Link>
                        {workbench.forksDonePrompt && <ForksOpenBadge />}
                        {workbench.slotQueue?.position ? (
                            <QueueBadge position={workbench.slotQueue.position} label="Aguardando vaga" title="Aguardando vaga no limite de mesas da central" />
                        ) : workbench.stage === "build_queued" && workbench.buildQueuePosition ? (
                            <QueueBadge position={workbench.buildQueuePosition} label="Na fila do build" title="Aguardando a vez do build" />
                        ) : (
                            <WorkbenchStageBadge stage={workbench.stage} runState={workbench.runState} />
                        )}
                        <span className={cn("flex items-center gap-1 text-[11px]", connected ? "text-emerald-400" : "text-muted-foreground")} title={connected ? "Recebendo a saída ao vivo" : "Reconectando à saída ao vivo"}>
                            <Plug className="h-3 w-3" aria-hidden /> {connected ? "ao vivo" : "reconectando"}
                        </span>
                    </div>
                    <h2 className="truncate text-base font-semibold max-lg:text-sm" title={workbench.taskTitle}>
                        {workbench.taskTitle}
                    </h2>
                </div>
                <UsageSummary workbench={workbench} className="hidden shrink-0 text-right lg:block" />
                {workbench.previewUrl && (
                    <Button asChild variant="ghost" size="icon" className={MOBILE_ICON}>
                        <a href={workbench.previewUrl} target="_blank" rel="noreferrer noopener" aria-label="Abrir prévia">
                            <ExternalLink className="h-4 w-4" aria-hidden />
                        </a>
                    </Button>
                )}
                {workbench.pr && (
                    <Button asChild variant="ghost" size="icon" className={MOBILE_ICON}>
                        <a href={workbench.pr.url} target="_blank" rel="noreferrer noopener" aria-label={`Abrir PR #${workbench.pr.number} (${PR_STATE_LABELS[workbench.pr.state]})`}>
                            <GitPullRequest className="h-4 w-4" aria-hidden />
                        </a>
                    </Button>
                )}
                <Button type="button" variant="ghost" size="icon" className={MOBILE_ICON} aria-label="Detalhes da mesa" aria-expanded={details} aria-controls={`workbench-details-${workbench.id}`} onClick={() => setDetails((value) => !value)}>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", details && "rotate-180")} aria-hidden />
                </Button>
                <div className="hidden shrink-0 lg:block">
                    <WorkbenchStageMenu workbench={workbench} />
                </div>
                {workbench.deletionRequestedAt ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive" title="A mesa sai quando a limpeza do ambiente terminar">
                        <Trash2 className="h-3 w-3" aria-hidden /> Excluindo…
                    </span>
                ) : (
                    <Button type="button" variant="ghost" size="icon" className="hidden h-8 w-8 shrink-0 lg:inline-flex" aria-label="Excluir mesa" onClick={() => setConfirming(true)}>
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                    </Button>
                )}
            </div>
            <WorkbenchResources workbench={workbench} links className="hidden lg:flex" />
            <AnimatePresence initial={false}>
                {details && (
                    <motion.div
                        key="details"
                        id={`workbench-details-${workbench.id}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="space-y-1.5 overflow-hidden lg:hidden"
                        data-testid="workbench-details"
                    >
                        <WorkbenchResources workbench={workbench} links={false} className="flex" />
                        <UsageSummary workbench={workbench} className="flex gap-3" />
                    </motion.div>
                )}
            </AnimatePresence>
            <DeleteWorkbenchDialog workbench={workbench} central={central} open={confirming} onOpenChange={setConfirming} />
        </header>
    )
}
