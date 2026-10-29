"use client"

import { AnimatePresence, motion } from "framer-motion"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CheckCircle2, History, Loader2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useEnvironmentDeploys } from "../hooks/useEnvironments"
import type { EnvironmentDeploySummaryDto, EnvironmentDto } from "../types"
import { DEPLOY_KIND_LABELS, formatDuration, placementLabel } from "../view"

const STATUS = {
    success: { label: "Concluído", icon: CheckCircle2, className: "text-success" },
    failed: { label: "Falhou", icon: XCircle, className: "text-destructive" },
    running: { label: "Em andamento", icon: Loader2, className: "text-muted-foreground" },
} as const

/** Uma linha do histórico: quando, quanto durou, onde (build → execução), resultado, ref/commit e versão. */
export function DeployHistoryRow({ deploy, onOpen }: { deploy: EnvironmentDeploySummaryDto; onOpen: (id: string) => void }) {
    const status = STATUS[deploy.status]
    const Icon = status.icon
    const started = new Date(deploy.startedAt)
    return (
        <button type="button" className="flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left hover:bg-muted/50" onClick={() => onOpen(deploy.id)}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className={cn("gap-1", status.className)}>
                    <Icon className={cn("h-3 w-3", deploy.status === "running" && "animate-spin")} aria-hidden />
                    {status.label}
                </Badge>
                <span className="font-medium">{DEPLOY_KIND_LABELS[deploy.kind]}</span>
                <span className="text-muted-foreground" title={started.toISOString()}>
                    {format(started, "dd/MM/yyyy HH:mm", { locale: ptBR })} · {formatDistanceToNow(started, { addSuffix: true, locale: ptBR })}
                </span>
                <span className="text-muted-foreground">· {deploy.durationMs === null ? "em andamento" : formatDuration(deploy.durationMs)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{placementLabel(deploy.buildOn, deploy.runOn)}</span>
                {(deploy.ref || deploy.commit) && (
                    <span className="font-mono">
                        {deploy.ref ?? ""}
                        {deploy.commit ? `${deploy.ref ? " " : ""}@ ${deploy.commit.slice(0, 8)}` : ""}
                    </span>
                )}
                {deploy.version && <span className="font-mono">v{deploy.version}</span>}
                {deploy.skipBuild && <Badge variant="secondary">Build reaproveitado</Badge>}
                {deploy.resumed && <Badge variant="secondary">Recuperado após reinício</Badge>}
            </div>
            {deploy.error && (
                <p className="truncate text-xs text-destructive" title={deploy.error}>
                    {deploy.error}
                </p>
            )}
        </button>
    )
}

function HistoryList({ env, onOpenDeploy }: { env: EnvironmentDto; onOpenDeploy: (id: string) => void }) {
    const query = useEnvironmentDeploys(env.id)
    if (query.isLoading)
        return (
            <div className="space-y-2" aria-label="Carregando o histórico">
                {[0, 1, 2].map((index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                ))}
            </div>
        )
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar o histórico" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    if (!query.data.length) return <EmptyState icon={History} title="Nenhum deploy ainda" description="Os deploys deste ambiente aparecem aqui, com data, duração e resultado." />
    return (
        <ul className="max-h-[60vh] divide-y overflow-y-auto">
            <AnimatePresence initial={false}>
                {query.data.map((deploy) => (
                    <motion.li key={deploy.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                        <DeployHistoryRow deploy={deploy} onOpen={onOpenDeploy} />
                    </motion.li>
                ))}
            </AnimatePresence>
        </ul>
    )
}

/** Histórico de deploys de um ambiente (os 30 últimos, guardados por 90 dias); a linha abre o log. */
export function DeployHistoryDialog({ env, onClose, onOpenDeploy }: { env: EnvironmentDto | null; onClose: () => void; onOpenDeploy: (id: string) => void }) {
    return (
        <Dialog open={env !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Histórico de deploys{env ? ` de ${env.name}` : ""}</DialogTitle>
                    <DialogDescription>Os 30 últimos deploys (guardados por 90 dias). Clique num deploy para ver o log.</DialogDescription>
                </DialogHeader>
                {env && <HistoryList env={env} onOpenDeploy={onOpenDeploy} />}
            </DialogContent>
        </Dialog>
    )
}
