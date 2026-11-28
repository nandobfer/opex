"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export type CheckTone = "loading" | "ok" | "info" | "warn" | "blocked"

const TONE_CLASS: Record<CheckTone, string> = {
    loading: "text-muted-foreground",
    ok: "text-success",
    info: "text-muted-foreground",
    warn: "text-warning",
    blocked: "text-destructive",
}

const TONE_ICON = { loading: Loader2, ok: CheckCircle2, info: Info, warn: AlertTriangle, blocked: XCircle } as const

/** Linha de resultado de uma conferência ao vivo (nome no GitHub, pasta no host), com troca animada. */
export function CheckStatus({ tone, message, id }: { tone: CheckTone | null; message: string | null; id?: string }) {
    const Icon = tone ? TONE_ICON[tone] : null
    return (
        <AnimatePresence mode="wait" initial={false}>
            {tone && message && Icon && (
                <motion.p key={`${tone}:${message}`} id={id} role="status" data-tone={tone} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 3 }} transition={{ duration: 0.15 }} className={cn("flex items-start gap-1.5 text-xs", TONE_CLASS[tone])}>
                    <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tone === "loading" && "animate-spin")} aria-hidden /> <span>{message}</span>
                </motion.p>
            )}
        </AnimatePresence>
    )
}
