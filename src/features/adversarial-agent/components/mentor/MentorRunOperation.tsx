"use client"

import { AlertTriangle, Archive, FilePlus2, GitMerge, PencilLine, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { MemoryDetailCard } from "@/features/ai/components/memories/MemoryDetailCard"
import { MemoryDetailPopover } from "@/features/ai/components/memories/MemoryDetailPopover"
import { noticeMemoryRef } from "@/features/ai/memory-notice"
import { MENTOR_OPERATION_LABELS, MENTOR_TARGET_LABELS, type MentorOperation } from "../../mentor/constants"
import type { MentorCaseOperationDto } from "../../mentor/types"

const ICONS: Record<MentorOperation, LucideIcon> = { create: FilePlus2, update: PencilLine, merge: GitMerge, archive: Archive }

/** Uma memória citada pela operação: abre o detalhe lido do Engramind (o mesmo painel dos avisos da mesa). */
function MemoryRef({ operation, memoryId, archived }: { operation: MentorCaseOperationDto; memoryId: string; archived?: boolean }) {
    const ref = noticeMemoryRef(operation.target, { id: memoryId }, operation.op === "create" ? "created" : "updated", { centralId: operation.centralId ?? undefined })
    return (
        <MemoryDetailPopover label={`Memória ${memoryId}`} content={() => <MemoryDetailCard memoryRef={ref} />}>
            <span className={cn("font-mono text-xs", archived && "line-through")}>{memoryId}</span>
        </MemoryDetailPopover>
    )
}

/** Operação de um caso (criada, atualizada, fundida ou arquivada), com o destino, as memórias e a falha. */
export function MentorRunOperation({ operation }: { operation: MentorCaseOperationDto }) {
    const Icon = operation.status === "failed" ? AlertTriangle : ICONS[operation.op]
    return (
        <li className="space-y-1 rounded-md border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Icon className={cn("h-3.5 w-3.5 shrink-0", operation.status === "failed" ? "text-destructive" : "text-primary")} aria-hidden />
                <span className="font-medium">{MENTOR_OPERATION_LABELS[operation.op]}</span>
                <span className="text-xs text-muted-foreground">em {MENTOR_TARGET_LABELS[operation.target].short}</span>
                {operation.memoryId && <MemoryRef operation={operation} memoryId={operation.memoryId} archived={operation.op === "archive"} />}
                {operation.absorbed.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        absorveu
                        {operation.absorbed.map((id) => (
                            <MemoryRef key={id} operation={operation} memoryId={id} archived />
                        ))}
                    </span>
                )}
            </div>
            {operation.reason && <p className="text-xs text-muted-foreground">{operation.reason}</p>}
            {operation.error && (
                <p role="alert" className="text-xs text-destructive">
                    {operation.error}
                </p>
            )}
        </li>
    )
}
