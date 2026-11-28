"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CopyButtonProps {
    value: string
    /** Rótulo acessível e `title` (ex.: "Copiar link"). */
    label: string
    /** Texto do toast de sucesso (ex.: "Link copiado."). */
    successMessage: string
    variant?: ButtonProps["variant"]
    size?: ButtonProps["size"]
    className?: string
    /** Tempo até o ícone voltar a "copiar" (`null` = fica como copiado). */
    resetMs?: number | null
}

/** Botão de ícone que copia um valor (área de transferência, toast e o ícone de copiado animado). */
export function CopyButton({ value, label, successMessage, variant = "ghost", size = "icon", className, resetMs = 1500 }: CopyButtonProps) {
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current)
    }, [])
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            toast.success(successMessage)
            if (resetMs !== null) {
                if (timer.current) clearTimeout(timer.current)
                timer.current = setTimeout(() => setCopied(false), resetMs)
            }
        } catch {
            toast.error("Não foi possível copiar: selecione e copie manualmente.")
        }
    }
    const Icon = copied ? Check : Copy
    return (
        <Button type="button" variant={variant} size={size} className={cn(size === "icon" && "h-7 w-7", className)} onClick={() => void copy()} aria-label={label} title={label}>
            <AnimatePresence mode="wait" initial={false}>
                <motion.span key={copied ? "copied" : "copy"} className="inline-flex" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.15 }}>
                    <Icon className={cn("h-4 w-4", copied && "text-success")} aria-hidden />
                </motion.span>
            </AnimatePresence>
        </Button>
    )
}
