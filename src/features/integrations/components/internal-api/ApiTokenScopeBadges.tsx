"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ScopeBadge, ScopeBadgeTone } from "../../api-tokens/scopes"

const TONE: Record<ScopeBadgeTone, { variant: "outline" | "secondary" | "destructive"; className?: string }> = {
    default: { variant: "outline", className: "border-primary/40 text-primary" },
    secondary: { variant: "secondary" },
    warning: { variant: "outline", className: "border-warning/50 text-warning" },
    destructive: { variant: "destructive" },
}

/** Escopos resumidos em badges (lista de tokens e resumo antes de confirmar). */
export function ApiTokenScopeBadges({ badges, className }: { badges: readonly ScopeBadge[]; className?: string }) {
    return (
        <ul className={cn("flex flex-wrap gap-1", className)} aria-label="Escopos">
            <AnimatePresence initial={false}>
                {badges.map((badge) => (
                    <motion.li key={badge.key} layout="position" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}>
                        <Badge variant={TONE[badge.tone].variant} className={cn("px-2 py-0 text-[11px] font-medium", TONE[badge.tone].className)} data-tone={badge.tone}>
                            {badge.label}
                        </Badge>
                    </motion.li>
                ))}
            </AnimatePresence>
        </ul>
    )
}
