"use client"

import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Clock, DollarSign, Timer } from "lucide-react"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { workbenchPath } from "@/features/agentic/constants"
import type { MentorRunDto } from "../../mentor/types"
import { formatCost, formatDuration } from "../ReviewBadges"
import { MentorRunBadge, MentorTargetBadge } from "./MentorRunBadge"
import { MentorRunChip } from "./MentorRunSection"

/** Cabeçalho do detalhe: código da tarefa + situação, título da tarefa e metadados (custo, tempo, quando, destino). */
export function MentorRunHeader({ run }: { run: MentorRunDto | null }) {
    if (!run) {
        return (
            <DialogHeader>
                <DialogTitle>Execução do Agente Mentor</DialogTitle>
                <DialogDescription className="sr-only">Detalhe da execução</DialogDescription>
            </DialogHeader>
        )
    }
    return (
        <DialogHeader className="space-y-2 pr-8 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
                <Link href={workbenchPath(run.taskId)} className="font-mono text-primary hover:underline">
                    {run.taskCode}
                </Link>
                <MentorRunBadge status={run.status} />
            </DialogTitle>
            <DialogDescription className="break-words text-sm text-foreground/90">{run.taskTitle}</DialogDescription>
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Metadados da execução">
                <MentorRunChip icon={DollarSign} label="Custo">
                    {formatCost(run.costUsd)}
                </MentorRunChip>
                <MentorRunChip icon={Timer} label="Duração">
                    {formatDuration(run.durationMs)}
                </MentorRunChip>
                <MentorRunChip icon={Clock} label={new Date(run.createdAt).toLocaleString("pt-BR")}>
                    {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true, locale: ptBR })}
                </MentorRunChip>
                {run.target && <MentorTargetBadge target={run.target} />}
            </div>
        </DialogHeader>
    )
}
