"use client"

import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { OperationDto, OperationStepDto } from "../types"

/** Peças compartilhadas da UI de Ambientes. */

export function operationStatusVariant(status: OperationDto["status"]): "default" | "success" | "warning" | "destructive" | "secondary" {
    switch (status) {
        case "done":
            return "success"
        case "failed":
            return "destructive"
        case "running":
            return "default"
        case "queued":
            return "warning"
        default:
            return "secondary"
    }
}

export function operationStatusLabel(status: OperationDto["status"]): string {
    switch (status) {
        case "done":
            return "Concluída"
        case "failed":
            return "Falhou"
        case "running":
            return "Em andamento"
        case "queued":
            return "Na fila"
        case "cancelled":
            return "Cancelada"
    }
}

function StepIcon({ status }: { status: OperationStepDto["status"] }) {
    if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
    if (status === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
    if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" aria-hidden />
    if (status === "skipped") return <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />
    return <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />
}

/** Lista animada das etapas de uma operação (publicar/restaurar). */
export function OperationSteps({ operation, className }: { operation: OperationDto; className?: string }) {
    return (
        <ol className={cn("space-y-2", className)}>
            {operation.steps.map((step) => (
                <li key={step.id} className="flex items-start gap-3 rounded-md border border-border/60 p-3">
                    <StepIcon status={step.status} />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{step.label}</span>
                            {step.status === "failed" && <Badge variant="destructive">Falhou</Badge>}
                        </div>
                        <AnimatePresence>
                            {step.message && (
                                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-0.5 break-words text-xs text-muted-foreground">
                                    {step.message}
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>
                </li>
            ))}
        </ol>
    )
}

export function OperationSummary({ operation }: { operation: OperationDto }) {
    const total = operation.steps.length
    const done = operation.steps.filter((step) => step.status === "done" || step.status === "failed" || step.status === "skipped").length
    const percent = total > 0 ? Math.round((done / total) * 100) : 0
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Badge variant={operationStatusVariant(operation.status)}>{operationStatusLabel(operation.status)}</Badge>
                    {operation.queuePosition ? <span className="text-xs text-muted-foreground">Na fila · #{operation.queuePosition}</span> : null}
                    {operation.runUrl ? (
                        <a href={operation.runUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-4 hover:underline">
                            Abrir execução
                        </a>
                    ) : null}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.3 }} />
            </div>
        </div>
    )
}
