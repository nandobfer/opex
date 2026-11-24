"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, CircleDashed, KeyRound, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Selo da situação de uma autorização OAuth (MCPs do OpenCode e do Agente Opex). O rótulo e o tom vêm
 * de cada módulo; o selo troca com animação quando a situação muda (tempo real).
 */

export type OauthStatusTone = "ok" | "attention" | "error" | "muted"

const TONES: Record<OauthStatusTone, { className: string; icon: LucideIcon }> = {
    ok: { className: "bg-success/10 text-success", icon: CheckCircle2 },
    attention: { className: "bg-warning/10 text-warning", icon: KeyRound },
    error: { className: "bg-destructive/10 text-destructive", icon: AlertTriangle },
    muted: { className: "bg-muted text-muted-foreground", icon: CircleDashed },
}

interface OauthStatusBadgeProps {
    tone: OauthStatusTone
    label: string
    /** Detalhe no `title` (ex.: o erro do provedor). */
    title?: string | null
    className?: string
}

export function OauthStatusBadge({ tone, label, title, className }: OauthStatusBadgeProps) {
    const { className: toneClass, icon: Icon } = TONES[tone]
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.span
                key={`${tone}:${label}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                title={title ?? undefined}
                data-oauth-tone={tone}
                className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", toneClass, className)}
            >
                <Icon className="h-3 w-3" aria-hidden />
                {label}
            </motion.span>
        </AnimatePresence>
    )
}
