"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, Pencil, Play, Plus, RefreshCw, RotateCcw, Settings2, Square, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LOCAL_DOCKER_INTEGRATION_ID } from "@/features/local-docker/constants"
import { BUILDER_STATUS_LABELS, builderNotices, usageText, type BuilderConfirmKind } from "../../builder-view"
import { limitsText } from "../../resource-limits"
import type { BuilderActionInput } from "../../schemas"
import type { BuilderStatus, EnvironmentsBuilderDto } from "../../types"
import { EnvironmentActionButton as RowButton } from "../EnvironmentStatus"

const STATUS_CLASS: Record<BuilderStatus, string> = { running: "text-success", stopped: "text-muted-foreground", missing: "text-warning", unmanageable: "text-muted-foreground", unknown: "text-destructive" }
const NOTICE_CLASS = { error: "text-destructive", warning: "text-warning", info: "text-muted-foreground" } as const

export interface BuilderRowProps {
    builder: EnvironmentsBuilderDto
    pending: boolean
    onAction: (input: BuilderActionInput) => void
    onConfirm: (kind: BuilderConfirmKind) => void
    onEdit: () => void
}

/** Linha do builder do servidor: estado, limites aplicados, uso de CPU/RAM, avisos e as ações. */
export function BuilderRow({ builder, pending, onAction, onConfirm, onEdit }: BuilderRowProps) {
    const { status, managed } = builder
    const busy = pending || status === "unknown"
    const exists = status === "running" || status === "stopped"
    const usage = usageText(builder.usage)
    const badges = [
        { key: "status", text: BUILDER_STATUS_LABELS[status], className: STATUS_CLASS[status] },
        ...(!managed ? [{ key: "unmanaged", text: "Não gerenciado", className: "text-muted-foreground" }] : []),
        ...(builder.isHostDefault ? [{ key: "default", text: "Padrão do host", className: "text-primary" }] : []),
        ...(builder.pending ? [{ key: "pending", text: "Recriação pendente", className: "text-warning" }] : []),
    ]

    return (
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{builder.name ?? "Nenhum builder"}</span>
                    {builder.container && <span className="font-mono text-xs text-muted-foreground">{builder.container}</span>}
                    <AnimatePresence initial={false}>
                        {badges.map((badge) => (
                            <motion.span key={badge.key} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}>
                                <Badge variant="outline" className={cn("gap-1", badge.className)}>
                                    {badge.key === "pending" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                                    {badge.text}
                                </Badge>
                            </motion.span>
                        ))}
                    </AnimatePresence>
                </div>
                <p className="text-xs text-muted-foreground">
                    {builder.driver ?? "—"}
                    {builder.applied ? ` · ${limitsText(builder.applied)}` : ""}
                    {usage ? ` · ${usage}` : ""}
                    {builder.host ? ` · servidor com ${builder.host.cpus} CPUs e ${builder.host.memoryGb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GiB` : ""}
                </p>
                <AnimatePresence initial={false}>
                    {builderNotices(builder).map((notice) => (
                        <motion.p key={notice.text} className={cn("text-xs", NOTICE_CLASS[notice.tone])} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                            {notice.text}
                        </motion.p>
                    ))}
                </AnimatePresence>
                <p className="text-xs text-muted-foreground">
                    Builder do PC:{" "}
                    <Link href={`/integracoes/${LOCAL_DOCKER_INTEGRATION_ID}`} className="underline-offset-2 hover:underline">
                        Integrações › Builder Machine
                    </Link>
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
                {!managed ? (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={onEdit}>
                        <Settings2 className="h-4 w-4" aria-hidden /> Gerenciar
                    </Button>
                ) : (
                    <>
                        <RowButton label="Editar" icon={Pencil} disabled={busy} onClick={onEdit} />
                        {status === "missing" && <RowButton label="Criar" icon={Plus} disabled={busy} onClick={() => onAction({ action: "create" })} />}
                        <RowButton label="Levantar" icon={Play} disabled={busy || status !== "stopped"} onClick={() => onAction({ action: "start" })} />
                        <RowButton label="Derrubar" icon={Square} disabled={busy || status !== "running"} onClick={() => (builder.buildRunning ? onConfirm("stop") : onAction({ action: "stop" }))} />
                        <RowButton label="Recriar" icon={RotateCcw} title="Recriar com --keep-state (o cache é mantido)" disabled={busy || !exists} onClick={() => onAction({ action: "recreate" })} />
                        <RowButton label="Apagar" icon={Trash2} disabled={busy || !exists} onClick={() => onConfirm("delete")} />
                    </>
                )}
                {pending && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Executando" />}
            </div>
        </div>
    )
}
