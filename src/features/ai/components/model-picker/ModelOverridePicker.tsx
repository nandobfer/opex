"use client"

import { forwardRef, type ComponentPropsWithoutRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Brain, ChevronDown, Cpu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAiModels } from "@/features/ai/hooks/useAi"
import type { AiModelDto } from "@/lib/ai/providers"
import { cn } from "@/lib/utils"
import { ModelSearchPicker } from "./ModelSearchPicker"

/** Escolha atual: `model: null` = padrão do agente; `overridden` = trocada só aqui. */
export interface ModelChoice {
    model: string | null
    variant: string | null
    overridden: boolean
}

/** Troca pedida (`model: null` = voltar ao padrão). */
export interface ModelChoiceInput {
    model: string | null
    variant: string | null
}

const DEFAULT_VARIANT = "__default__"

interface ModelOverridePickerProps {
    id: string
    /** Contexto do seletor para leitores de tela e dica: "Modelo do Plano" na mesa, "Modelo" no fork. */
    label: string
    choice: ModelChoice
    disabled?: boolean
    onChange: (input: ModelChoiceInput) => void
    /** Catálogo já carregado (ex.: pela rota do portal); ausente = `useAiModels("opencode")`. */
    models?: { data?: AiModelDto[]; isLoading: boolean }
    className?: string
}

/** Gatilho compacto: só o ícone e o nome do modelo (trocado = destaque na cor primária). */
const ModelTrigger = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof Button> & { name: string; overridden: boolean }>(({ name, overridden, className, ...props }, ref) => (
    <Button ref={ref} type="button" variant="outline" size="sm" className={cn("h-8 max-w-full gap-1.5 text-xs", overridden && "border-primary/60 text-primary", className)} {...props}>
        <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{name}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
    </Button>
))
ModelTrigger.displayName = "ModelTrigger"

/**
 * Troca do modelo (e da variante) na mesa, no fork e no chat do Agente Maddox (componente compartilhado): busca de modelos do OpenCode, variante quando
 * o modelo tem variantes e "Voltar ao padrão". Vale a partir do próximo turno.
 */
export function ModelOverridePicker({ id, label, choice, disabled = false, onChange, models: provided, className }: ModelOverridePickerProps) {
    // Sem `models`, lê o catálogo do OpenCode pela rota do dono (o portal passa o próprio catálogo).
    const own = useAiModels("opencode", !provided)
    const models = provided ?? own
    const model = models.data?.find((item) => item.id === choice.model)
    const name = model?.name ?? choice.model ?? "Padrão do agente"
    const state = choice.overridden ? "trocado" : "padrão"
    const description = `${label}: ${name} (${state})`
    const variantText = choice.variant ?? "padrão do modelo"
    return (
        <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
            <ModelSearchPicker
                trigger={<ModelTrigger id={id} name={name} overridden={choice.overridden} aria-label={`${description} — trocar o modelo`} title={`${description}. Trocar o modelo: vale a partir do próximo turno`} />}
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
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild disabled={disabled}>
                                <Button
                                    id={`${id}-variant`}
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className={cn("h-8 w-8 shrink-0", choice.variant && "border-primary/60 text-primary")}
                                    aria-label={`Esforço de raciocínio: ${variantText} — trocar`}
                                    title={`Esforço de raciocínio: ${variantText}`}
                                >
                                    <Brain className="h-3.5 w-3.5" aria-hidden />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel className="text-xs">Esforço de raciocínio</DropdownMenuLabel>
                                <DropdownMenuRadioGroup value={choice.variant ?? DEFAULT_VARIANT} onValueChange={(next) => onChange({ model: model.id, variant: next === DEFAULT_VARIANT ? null : next })}>
                                    <DropdownMenuRadioItem value={DEFAULT_VARIANT}>Padrão do modelo</DropdownMenuRadioItem>
                                    {model.variants.map((variant) => (
                                        <DropdownMenuRadioItem key={variant} value={variant}>
                                            {variant}
                                        </DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
