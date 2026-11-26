"use client"

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Ban, Eye, Loader2 } from "lucide-react"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OPEX_WATCH_STATUS_LABELS, OPEX_WATCH_TARGET_LABELS, type OpexWatchDto, type OpexWatchStatus } from "../../watches"
import { AgentOpenSessionButton, AgentOriginBadge, AgentRowError, AgentScheduledRow, formatAgentDate } from "../scheduled/AgentScheduledRow"

const STATUS_VARIANT: Record<OpexWatchStatus, NonNullable<BadgeProps["variant"]>> = {
    watching: "outline",
    triggered: "default",
    delivering: "default",
    woken: "success",
    expired: "warning",
    canceled: "secondary",
    error: "destructive",
}

interface OpexWatchRowProps {
    watch: OpexWatchDto
    /** Título da sessão do dono (a do portal é do usuário: não abre). */
    sessionTitle: string | null
    onCancel: (watch: OpexWatchDto) => void
}

/** Uma observação: alvo, condição, situação, origem, prazo, sessão, o que foi combinado e o evento. */
export function OpexWatchRow({ watch, sessionTitle, onCancel }: OpexWatchRowProps) {
    const fromPortal = watch.origin.kind === "client"
    const busy = watch.status === "triggered" || watch.status === "delivering"
    return (
        <AgentScheduledRow testId="opex-watch-row">
            <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <Eye className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                        <span className="truncate">
                            {OPEX_WATCH_TARGET_LABELS[watch.target.kind]} {watch.target.label}
                        </span>
                        <Badge variant={STATUS_VARIANT[watch.status]} className="gap-1 text-[10px]">
                            {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                            {OPEX_WATCH_STATUS_LABELS[watch.status]}
                        </Badge>
                        <AgentOriginBadge origin={watch.origin} title="Observação de um usuário do portal do cliente" />
                    </p>
                    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Quando: {watch.conditionText}</span>
                        {watch.status === "watching" ? (
                            <span>
                                Expira {formatAgentDate(watch.expiresAt)} ({formatDistanceToNow(new Date(watch.expiresAt), { addSuffix: true, locale: ptBR })})
                            </span>
                        ) : (
                            watch.wokenAt && <span>Acordou o agente {formatAgentDate(watch.wokenAt)}</span>
                        )}
                        <span>Criada {formatAgentDate(watch.createdAt)}</span>
                        <span className="truncate">Sessão: {fromPortal ? "do usuário" : (sessionTitle ?? "excluída")}</span>
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                    {watch.status === "watching" && (
                        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-destructive" onClick={() => onCancel(watch)} aria-label={`Cancelar: ${watch.pillText}`}>
                            <Ban className="h-3.5 w-3.5" aria-hidden /> Cancelar
                        </Button>
                    )}
                    {!fromPortal && sessionTitle && <AgentOpenSessionButton sessionId={watch.sessionId} label={watch.pillText} />}
                </div>
            </div>
            <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground" title={watch.note}>
                Ao acordar: {watch.note}
            </p>
            {watch.event && <p className="mt-1 text-xs text-foreground/80">{watch.event.summary}</p>}
            {watch.error && <AgentRowError message={watch.error} />}
        </AgentScheduledRow>
    )
}
