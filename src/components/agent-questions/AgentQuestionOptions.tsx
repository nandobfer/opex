"use client"

import { CheckCircle2, CheckSquare2, Circle, Square } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { OpencodeFormFieldOption } from "@/lib/ai/opencode-events"

/**
 * Alternativas de uma pergunta do agente desenhadas como **linhas selecionáveis** (no estilo do
 * OpenCode): cada opção numa linha própria, com o texto e, logo abaixo e mais discreta, a
 * descrição; a linha inteira é o botão. Escolha única usa semântica de rádio; múltipla, de
 * checkbox. Componente genérico e presentacional (mesa de trabalho e refinamento).
 */
export function AgentQuestionOptions({
    id,
    options,
    value,
    multiple,
    disabled,
    onChange,
}: {
    id: string
    options: OpencodeFormFieldOption[]
    value: string | string[]
    multiple: boolean
    disabled?: boolean
    onChange: (value: string | string[]) => void
}) {
    const selected = (option: OpencodeFormFieldOption) => (multiple ? Array.isArray(value) && value.includes(option.value) : value === option.value)

    const toggle = (option: OpencodeFormFieldOption) => {
        if (multiple) {
            const current = Array.isArray(value) ? value : []
            onChange(current.includes(option.value) ? current.filter((item) => item !== option.value) : [...current, option.value])
        } else {
            onChange(option.value)
        }
    }

    return (
        <div role={multiple ? "group" : "radiogroup"} aria-labelledby={id} className="space-y-1.5">
            {options.map((option) => {
                const isSelected = selected(option)
                const Icon = multiple ? (isSelected ? CheckSquare2 : Square) : isSelected ? CheckCircle2 : Circle
                return (
                    <motion.button
                        key={option.value}
                        type="button"
                        role={multiple ? "checkbox" : "radio"}
                        aria-checked={isSelected}
                        disabled={disabled}
                        onClick={() => toggle(option)}
                        whileTap={disabled ? undefined : { scale: 0.995 }}
                        className={cn(
                            "flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-60",
                            isSelected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
                        )}
                    >
                        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} aria-hidden />
                        <span className="min-w-0 space-y-0.5">
                            <span className="block text-sm text-foreground">{option.label}</span>
                            {option.description && <span className="block text-xs text-muted-foreground">{option.description}</span>}
                        </span>
                    </motion.button>
                )
            })}
        </div>
    )
}
