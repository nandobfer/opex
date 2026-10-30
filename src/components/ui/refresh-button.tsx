"use client"

import { motion } from "framer-motion"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Botão "Atualizar" com o ícone girando enquanto busca. */
export function RefreshButton({ onClick, fetching, disabled, label = "Atualizar" }: { onClick: () => void; fetching: boolean; disabled?: boolean; label?: string }) {
    return (
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onClick} disabled={disabled || fetching}>
            <motion.span animate={{ rotate: fetching ? 360 : 0 }} transition={fetching ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                <RefreshCw className="h-4 w-4" aria-hidden />
            </motion.span>
            {label}
        </Button>
    )
}
