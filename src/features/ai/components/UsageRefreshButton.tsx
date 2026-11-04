"use client"

import { motion, useReducedMotion } from "framer-motion"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UsageRefreshButtonProps {
    fetching: boolean
    disabled?: boolean
    onClick: () => void
}

/** Ação Atualizar dos painéis de consumo, com o ícone girando enquanto a consulta está em curso. */
export function UsageRefreshButton({ fetching, disabled = false, onClick }: UsageRefreshButtonProps) {
    const reducedMotion = useReducedMotion()
    return (
        <Button type="button" variant="outline" size="sm" disabled={fetching || disabled} onClick={onClick}>
            <motion.span
                className="mr-2 inline-flex"
                animate={{ rotate: fetching && !reducedMotion ? 360 : 0 }}
                transition={fetching && !reducedMotion ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0 }}
            >
                <RefreshCw className="h-4 w-4" aria-hidden />
            </motion.span>
            Atualizar
        </Button>
    )
}
