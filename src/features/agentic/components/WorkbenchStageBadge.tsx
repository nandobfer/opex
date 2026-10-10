"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { WORKBENCH_STAGE_LABELS, type RunState, type WorkbenchStage } from "../constants"

type ToneName = "primary" | "sky" | "amber" | "emerald" | "destructive" | "muted"

const STAGE_TONE: Record<WorkbenchStage, ToneName> = {
    planning: "primary",
    plan_review: "sky",
    implementing: "primary",
    build_queued: "sky",
    building: "primary",
    preview: "sky",
    opening_pr: "primary",
    pr_open: "amber",
    changes_requested: "amber",
    finishing: "primary",
    done: "emerald",
}

/** Classes por tom: `badge` (chip) e `button` (botão de ícone com contorno, hover incluído). */
const TONE_CLASSES: Record<ToneName, { badge: string; button: string }> = {
    primary: { badge: "bg-primary/15 text-primary", button: "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary" },
    sky: { badge: "bg-sky-500/15 text-sky-300", button: "border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 hover:text-sky-300" },
    amber: { badge: "bg-amber-500/15 text-amber-300", button: "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 hover:text-amber-300" },
    emerald: { badge: "bg-emerald-500/15 text-emerald-300", button: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:text-emerald-300" },
    destructive: { badge: "bg-destructive/15 text-destructive", button: "border-destructive/40 bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive" },
    muted: { badge: "bg-muted text-muted-foreground", button: "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground" },
}

/** Tom da mesa: falha em destaque, interrupção apagada, senão a cor da etapa. */
export function workbenchStageTone(stage: WorkbenchStage, runState: RunState): ToneName {
    return runState === "failed" ? "destructive" : runState === "interrupted" ? "muted" : STAGE_TONE[stage]
}

export function workbenchToneClasses(stage: WorkbenchStage, runState: RunState) {
    return TONE_CLASSES[workbenchStageTone(stage, runState)]
}

export function workbenchStageLabel(stage: WorkbenchStage, runState: RunState): string {
    const label = WORKBENCH_STAGE_LABELS[stage]
    return runState === "failed" ? `${label}: falhou` : runState === "interrupted" ? `${label}: parada` : label
}

/** Etapa da mesa; executando pulsa, falha/interrupção ficam em destaque. `running` permite ao chamador desligar o pulso quando o agente está parado aguardando o usuário. */
export function WorkbenchStageBadge({ stage, runState, running = runState === "running", className }: { stage: WorkbenchStage; runState: RunState; running?: boolean; className?: string }) {
    return (
        <motion.span
            key={`${stage}-${runState}`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", workbenchToneClasses(stage, runState).badge, className)}
        >
            {running && (
                <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                </span>
            )}
            {workbenchStageLabel(stage, runState)}
        </motion.span>
    )
}
