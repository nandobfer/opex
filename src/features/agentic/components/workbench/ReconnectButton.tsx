"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Loader2, PlugZap } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ReconnectButtonProps {
    /** Ciclo de reconexão em andamento: indicador "Reconectando…" (sem contador). */
    reconnecting: boolean
    onClick: () => void
    /** Rótulo completo (desktop) e compacto (celular); o nome acessível é sempre o completo. */
    label?: string
    compactLabel?: string
    variant?: ButtonProps["variant"]
    size?: ButtonProps["size"]
    className?: string
    disabled?: boolean
}

/**
 * Botão **Reconectar** compartilhado (mesa de trabalho e refinamento): acompanha a sessão existente
 * sem reenviar a mensagem. Durante o ciclo automático mostra o indicador de reconexão e continua
 * clicável (o clique tenta na hora e reinicia a contagem).
 */
export function ReconnectButton({ reconnecting, onClick, label = "Reconectar ao agente", compactLabel = "Reconectar", variant = "outline", size = "sm", className, disabled }: ReconnectButtonProps) {
    return (
        <Button
            type="button"
            variant={variant}
            size={size}
            className={cn("gap-1.5", className)}
            disabled={disabled}
            aria-label={reconnecting ? "Reconectando ao agente" : label}
            onClick={onClick}
        >
            {reconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <PlugZap className="h-3.5 w-3.5" aria-hidden />}
            <AnimatePresence mode="wait" initial={false}>
                <motion.span key={reconnecting ? "reconnecting" : "idle"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                    {reconnecting ? (
                        "Reconectando…"
                    ) : (
                        <>
                            <span className="max-md:hidden">{label}</span>
                            <span className="md:hidden">{compactLabel}</span>
                        </>
                    )}
                </motion.span>
            </AnimatePresence>
        </Button>
    )
}
