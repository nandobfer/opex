"use client"

import { motion, useReducedMotion } from "framer-motion"
import { TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Warning do item da lista de mesas da Central de desenvolvimento: a mesa está **parada aguardando
 * o usuário** (revisão do plano, aprovação da prévia, revisão/merge do PR, permissão ou pergunta
 * pendente, falha/interrupção). O motivo vai no `title` e no rótulo acessível.
 */
export function WorkbenchWaitingBadge({ reason, className }: { reason: string; className?: string }) {
    const reduceMotion = useReducedMotion()
    return (
        <motion.span
            role="img"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-warning/40 bg-warning/10 p-1 text-warning", className)}
            title={reason}
            aria-label={reason}
        >
            <TriangleAlert className="h-3 w-3" aria-hidden />
        </motion.span>
    )
}
