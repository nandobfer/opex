"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Brain, Cpu } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AiModelDto } from "@/lib/ai/providers"
import { modelName } from "./model-settings"

interface ModelInUseProps {
    /** "Modelo do Plano", "Modelo do fork", "Agente Adversário"... (dica e leitor de tela). */
    label: string
    choice: { model: string | null; variant: string | null }
    /** Origem do valor ("definido nesta mesa", "da central"...). */
    sourceText?: string
    /** Valor trocado nesta mesa/fork: destaque na cor primária. */
    highlighted?: boolean
    models?: AiModelDto[]
    className?: string
}

/** Texto do modelo e da variante em uso (só leitura): ícone + nome do modelo e, com variante, ícone + variante. */
export function ModelInUse({ label, choice, sourceText, highlighted = false, models, className }: ModelInUseProps) {
    const name = modelName(choice.model, models)
    const variant = choice.model ? choice.variant : null
    const description = `${label}: ${name}${variant ? ` (${variant})` : ""}${sourceText ? `, ${sourceText}` : ""}`
    return (
        <span
            role="status"
            aria-label={description}
            title={description}
            data-testid="model-in-use"
            className={cn("flex min-w-0 items-center gap-2 text-xs text-muted-foreground", highlighted && "text-primary", className)}
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={`${choice.model ?? ""}|${variant ?? ""}`}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={{ duration: 0.16 }}
                    className="flex min-w-0 items-center gap-2"
                >
                    <span className="flex min-w-0 items-center gap-1">
                        <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{name}</span>
                    </span>
                    {variant && (
                        <span className="flex shrink-0 items-center gap-1">
                            <Brain className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span>{variant}</span>
                        </span>
                    )}
                </motion.span>
            </AnimatePresence>
        </span>
    )
}
