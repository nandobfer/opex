"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export type EnvironmentTone = "primary" | "sky" | "amber" | "emerald" | "destructive" | "muted"

const TONE_CLASSES: Record<EnvironmentTone, string> = {
    primary: "bg-primary/15 text-primary",
    sky: "bg-sky-500/15 text-sky-300",
    amber: "bg-amber-500/15 text-amber-300",
    emerald: "bg-emerald-500/15 text-emerald-300",
    destructive: "bg-destructive/15 text-destructive",
    muted: "bg-muted text-muted-foreground",
}

/** Chip de estado do ambiente (em operação, falha, pronto…); `running` pulsa como o da mesa. */
export function EnvironmentStatusBadge({
    label,
    tone = "muted",
    running = false,
    className,
}: {
    label: string
    tone?: EnvironmentTone
    running?: boolean
    className?: string
}) {
    return (
        <motion.span
            key={`${label}-${tone}`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
                TONE_CLASSES[tone],
                className,
            )}
        >
            {running && (
                <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                </span>
            )}
            {label}
        </motion.span>
    )
}
