"use client"

import { motion } from "framer-motion"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { WORKBENCH_STEPS, type RunState, type WorkbenchStage } from "../../constants"

/** Passos da mesa (Plano → Implementação → Prévia → PR → Concluída) com o atual em destaque. */
export function StageSteps({ stage, runState }: { stage: WorkbenchStage; runState: RunState }) {
    const current = WORKBENCH_STEPS.findIndex((step) => (step.stages as readonly WorkbenchStage[]).includes(stage))
    return (
        <ol className="flex items-center gap-1 overflow-x-auto border-b px-4 py-2.5" aria-label="Etapas da mesa">
            {WORKBENCH_STEPS.map((step, index) => {
                const done = index < current || stage === "done"
                const active = index === current && stage !== "done"
                return (
                    <li key={step.id} className="flex shrink-0 items-center gap-1" aria-current={active ? "step" : undefined}>
                        {index > 0 && <span className={cn("h-px w-5 sm:w-8", done || active ? "bg-primary" : "bg-border")} aria-hidden />}
                        <span className={cn("flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs", active ? "bg-primary/15 text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/60")}>
                            <span className={cn("relative flex h-4 w-4 items-center justify-center rounded-full border text-[10px]", done ? "border-primary bg-primary text-primary-foreground" : active ? (runState === "failed" ? "border-destructive" : "border-primary") : "border-border")}>
                                {done ? <Check className="h-2.5 w-2.5" aria-hidden /> : index + 1}
                                {active && runState === "running" && <motion.span className="absolute inset-0 rounded-full border border-primary" animate={{ scale: [1, 1.6], opacity: [0.8, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} aria-hidden />}
                            </span>
                            {step.label}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}
