"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Hourglass, Loader2, RotateCcw, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Tone = "running" | "waiting" | "failed"

const TONES: Record<Tone, { className: string; icon: typeof XCircle }> = {
    running: { className: "border-primary/30 bg-primary/5 text-foreground", icon: Loader2 },
    waiting: { className: "border-warning/40 bg-warning/10 text-foreground", icon: Hourglass },
    failed: { className: "border-destructive/40 bg-destructive/10 text-foreground", icon: XCircle },
}

interface StepNoticeProps {
    tone: Tone | null
    message: string | null
    /** Lista abaixo da mensagem (ex.: as entregas que faltaram). */
    items?: readonly string[]
    onRetry?: () => void
    retrying?: boolean
    actions?: ReactNode
}

/** Estado da etapa (executando, aguardando você ou falhou), com a lista do que faltou e "Tentar novamente". */
export function StepNotice({ tone, message, items = [], onRetry, retrying, actions }: StepNoticeProps) {
    const config = tone ? TONES[tone] : null
    const Icon = config?.icon ?? AlertTriangle
    return (
        <AnimatePresence initial={false} mode="wait">
            {config && message && (
                <motion.div key={`${tone}:${message}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18 }} className={cn("rounded-md border p-3", config.className)} role={tone === "failed" ? "alert" : "status"} data-tone={tone}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="flex min-w-0 items-start gap-2 text-sm">
                            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "running" && "animate-spin text-primary", tone === "waiting" && "text-warning", tone === "failed" && "text-destructive")} aria-hidden />
                            <span>{message}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            {actions}
                            {onRetry && (
                                <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={retrying} onClick={onRetry}>
                                    {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />} Tentar novamente
                                </Button>
                            )}
                        </div>
                    </div>
                    {items.length > 0 && (
                        <ul className="mt-2 space-y-1 pl-6 text-xs text-muted-foreground">
                            {items.map((item) => (
                                <li key={item} className="list-disc">
                                    falta {item}
                                </li>
                            ))}
                        </ul>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    )
}
