"use client"

import { motion } from "framer-motion"
import { GitFork, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { FORK_STATUS_LABELS, type ForkStatus, type RunState } from "../../constants"

const TONES: Record<ForkStatus, string> = {
    active: "border-primary/40 bg-primary/10 text-primary",
    closed: "border-border bg-muted/40 text-muted-foreground",
    integrating: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    integrated: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    concluded: "border-border bg-muted/40 text-muted-foreground",
}

/** Etiqueta do estado do fork (com indicador quando o agente está respondendo). */
export function ForkStatusBadge({ status, runState }: { status: ForkStatus; runState: RunState }) {
    const running = runState === "running"
    const failed = runState === "failed" || runState === "interrupted"
    return (
        <motion.span
            key={`${status}-${runState}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", failed ? "border-destructive/40 bg-destructive/10 text-destructive" : TONES[status])}
        >
            {running ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <GitFork className="h-3 w-3" aria-hidden />}
            {running ? "Respondendo" : failed ? (runState === "failed" ? "Falhou" : "Interrompido") : FORK_STATUS_LABELS[status]}
        </motion.span>
    )
}

/** Etiqueta "Forks em aberto" da mesa concluída que aguarda a decisão sobre os forks. */
export function ForksOpenBadge() {
    return (
        <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200"
            title="A mesa foi concluída com forks em aberto: escolha se eles também devem ser concluídos"
        >
            <GitFork className="h-3 w-3" aria-hidden /> Forks em aberto
        </motion.span>
    )
}
