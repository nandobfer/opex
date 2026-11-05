"use client"

import { Archive, ArchiveRestore, Pause, Play, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableAction } from "@/components/list/TableAction"
import { ROUTINE_ENGINE_LABELS } from "../../schemas"
import type { RoutineAgentDto } from "../../types"
import { formatDateTime } from "../../format"
import { RoutineAgentStatusBadge, RoutineProvisioningBadge, RoutineRunStatusBadge } from "../RoutineBadges"

export type RoutineItemAction = "edit" | "pause" | "resume" | "archive" | "unarchive" | "reprovision"

/** Linha de um agente rotineiro na aba de configuração (status, motor, última execução e ações). */
export function RoutineAgentItem({ agent, onAction, pending }: { agent: RoutineAgentDto; onAction: (action: RoutineItemAction) => void; pending: boolean }) {
    const archived = agent.status === "archived"
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3" data-testid={`routine-agent-${agent.id}`}>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{agent.name}</span>
                    <RoutineAgentStatusBadge status={agent.status} />
                    <RoutineProvisioningBadge status={agent.provisioning.status} />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                    {ROUTINE_ENGINE_LABELS[agent.engine]} · {agent.engine === "opex" ? agent.opex.model : agent.opencode.model} · próximo disparo {formatDateTime(agent.nextFireAt)}
                </p>
                {agent.lastRun && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Última execução {formatDateTime(agent.lastRun.at)} <RoutineRunStatusBadge status={agent.lastRun.status} />
                    </p>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
                <TableAction type="edit" onClick={() => onAction("edit")} />
                {!archived && (
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={pending} onClick={() => onAction(agent.status === "paused" ? "resume" : "pause")}>
                        {agent.status === "paused" ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
                        {agent.status === "paused" ? "Retomar" : "Pausar"}
                    </Button>
                )}
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={pending} onClick={() => onAction(archived ? "unarchive" : "archive")}>
                    {archived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
                    {archived ? "Desarquivar" : "Arquivar"}
                </Button>
                {!archived && (
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={pending || agent.provisioning.status === "running"} onClick={() => onAction("reprovision")}>
                        <RefreshCw className="h-4 w-4" aria-hidden /> Reprovisionar
                    </Button>
                )}
            </div>
        </div>
    )
}
