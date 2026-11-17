"use client"

import { useId, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Botão principal do dock: largo, 44 px de altura, ao alcance do polegar. */
export const DOCK_PRIMARY_BUTTON = "h-11 min-w-0 flex-1 gap-2 text-sm"

/**
 * Pé da mesa no celular (`< lg`, OPE-166): **Mais ações** à esquerda e o botão principal da etapa ocupando o
 * resto da linha, sempre no mesmo lugar. Sem ação principal, o "Mais ações" ocupa a linha inteira.
 * `blockedReason`: o botão principal está bloqueado — o motivo aparece em texto logo acima (no toque não
 * há dica) e vira a descrição acessível do dock.
 */
export function MobileActionDock({ primary, onMore, blockedReason = null }: { primary: ReactNode; onMore: () => void; blockedReason?: string | null }) {
    const reduceMotion = useReducedMotion()
    const reasonId = useId()
    return (
        <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="space-y-1.5" data-testid="mobile-action-dock">
            <AnimatePresence initial={false}>
                {primary && blockedReason && (
                    <motion.p key={blockedReason} id={reasonId} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }} className="text-xs text-amber-300" role="status" data-testid="dock-blocked-reason">
                        {blockedReason}
                    </motion.p>
                )}
            </AnimatePresence>
            <div className="flex items-center gap-2" aria-describedby={primary && blockedReason ? reasonId : undefined}>
            <Button type="button" variant="outline" className={cn("h-11 shrink-0 gap-2", primary ? "w-11 px-0" : "flex-1")} aria-label="Mais ações" aria-haspopup="dialog" onClick={onMore}>
                <MoreHorizontal className="h-5 w-5" aria-hidden />
                {!primary && <span>Mais ações</span>}
            </Button>
            {primary}
            </div>
        </motion.div>
    )
}
