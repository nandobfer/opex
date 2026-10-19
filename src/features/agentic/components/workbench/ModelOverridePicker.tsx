"use client"

import { forwardRef, type ComponentPropsWithoutRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, Cpu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAiModels } from "@/features/ai/hooks/useAi"
import type { ModelOverrideInput } from "../../schemas"
import type { ModelChoiceDto } from "../../types"
import { ModelSearchPicker } from "../settings/ModelSearchPicker"

const DEFAULT_VARIANT = "__default__"

interface ModelOverridePickerProps {
    id: string
    /** Rótulo do gatilho: "Modelo do Plano" na mesa, "Modelo" no fork. */
    label: string
    choice: ModelChoiceDto
    disabled?: boolean
    onChange: (input: ModelOverrideInput) => void
}

const ModelTrigger = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof Button> & { text: string; overridden: boolean }>(({ text, overridden, ...props }, ref) => (
    <Button ref={ref} type="button" variant="outline" size="sm" className="h-8 max-w-full gap-1.5 text-xs" {...props}>
        <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{text}</span>
        <span className={overridden ? "shrink-0 text-primary" : "shrink-0 text-muted-foreground"}>{overridden ? "(trocado)" : "(padrão)"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
    </Button>
))
ModelTrigger.displayName = "ModelTrigger"

/**
 * Troca do modelo (e da variante) na mesa ou no fork: busca de modelos do OpenCode, variante quando
 * o modelo tem variantes e "Voltar ao padrão". Vale a partir do próximo turno.
 */
export function ModelOverridePicker({ id, label, choice, disabled = false, onChange }: ModelOverridePickerProps) {
    const models = useAiModels("opencode")
    const model = models.data?.find((item) => item.id === choice.model)
    const name = model?.name ?? choice.model ?? "padrão do agente"
    const text = `${label}: ${name}${choice.variant ? ` (${choice.variant})` : ""}`
    return (
        <div className="flex min-w-0 items-center gap-1.5">
            <ModelSearchPicker
                trigger={<ModelTrigger id={id} text={text} overridden={choice.overridden} aria-label={`${text} ${choice.overridden ? "(trocado)" : "(padrão)"} — trocar o modelo`} title="Trocar o modelo: vale a partir do próximo turno" />}
                models={models}
                disabled={disabled}
                align="start"
                onPick={(item) => item.id !== choice.model && onChange({ model: item.id, variant: null })}
                footer={
                    choice.overridden ? (
                        <button type="button" className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange({ model: null, variant: null })}>
                            Voltar ao padrão
                        </button>
                    ) : undefined
                }
            />
            <AnimatePresence initial={false}>
                {model && model.variants.length > 0 && (
                    <motion.div key="variant" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }} transition={{ duration: 0.16 }} className="flex shrink-0 items-center">
                        <label htmlFor={`${id}-variant`} className="sr-only">
                            Variante (raciocínio)
                        </label>
                        <Select value={choice.variant ?? DEFAULT_VARIANT} disabled={disabled} onValueChange={(next) => onChange({ model: model.id, variant: next === DEFAULT_VARIANT ? null : next })}>
                            <SelectTrigger id={`${id}-variant`} className="h-8 w-auto gap-1.5 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={DEFAULT_VARIANT}>Padrão do modelo</SelectItem>
                                {model.variants.map((variant) => (
                                    <SelectItem key={variant} value={variant}>
                                        {variant}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
