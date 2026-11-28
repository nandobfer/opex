"use client"

import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { HEALTH_LABELS, type EnvironmentHealth } from "../../view"

type DotState = EnvironmentHealth | "deploying"

const DOT_CLASS: Record<DotState, string> = {
    running: "bg-success",
    partial: "bg-warning",
    stopped: "bg-muted-foreground",
    never: "border border-muted-foreground bg-transparent",
    deploying: "bg-primary",
}

/** Ponto de estado (verde pulsando no ar, amarelo parcial, cinza parado, vazado nunca implantado). */
export function StateDot({ state, className }: { state: DotState; className?: string }) {
    const reduce = useReducedMotion()
    const pulse = (state === "running" || state === "deploying") && !reduce
    return (
        <span className={cn("relative inline-flex h-2.5 w-2.5 shrink-0", className)} aria-hidden>
            {pulse && <motion.span className={cn("absolute inset-0 rounded-full", DOT_CLASS[state])} initial={{ opacity: 0.6, scale: 1 }} animate={{ opacity: 0, scale: 2.2 }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} />}
            <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", DOT_CLASS[state])} />
        </span>
    )
}

/** Estado do ambiente: o ponto e o rótulo ("No ar", "Implantando"…). */
export function EnvironmentStateDot({ health, deploying }: { health: EnvironmentHealth; deploying: boolean }) {
    const label = deploying ? "Implantando" : HEALTH_LABELS[health]
    return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground" data-health={deploying ? "deploying" : health}>
            <StateDot state={deploying ? "deploying" : health} />
            {label}
        </span>
    )
}

/** Estado de um container (pelo `state` do Docker). */
export const containerDotState = (state: string): EnvironmentHealth => (state === "running" ? "running" : state === "restarting" || state === "paused" ? "partial" : "stopped")
