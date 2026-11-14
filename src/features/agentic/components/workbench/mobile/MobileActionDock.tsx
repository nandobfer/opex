"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Botão principal do dock: largo, 44 px de altura, ao alcance do polegar. */
export const DOCK_PRIMARY_BUTTON = "h-11 min-w-0 flex-1 gap-2 text-sm"

/**
 * Pé da mesa no celular (`< lg`, OPE-166): **Mais ações** à esquerda e o botão principal da etapa ocupando o
 * resto da linha, sempre no mesmo lugar. Sem ação principal, o "Mais ações" ocupa a linha inteira.
 */
export function MobileActionDock({ primary, onMore }: { primary: ReactNode; onMore: () => void }) {
    const reduceMotion = useReducedMotion()
    return (
        <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="flex items-center gap-2" data-testid="mobile-action-dock">
            <Button type="button" variant="outline" className={cn("h-11 shrink-0 gap-2", primary ? "w-11 px-0" : "flex-1")} aria-label="Mais ações" aria-haspopup="dialog" onClick={onMore}>
                <MoreHorizontal className="h-5 w-5" aria-hidden />
                {!primary && <span>Mais ações</span>}
            </Button>
            {primary}
        </motion.div>
    )
}
