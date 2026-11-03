"use client"

import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiErrorMessage } from "@/lib/api"
import type { AiModelDto } from "@/lib/ai/providers"
import { ModelSearchPicker } from "./ModelSearchPicker"

const DEFAULT_OPTION = "__default__"

export interface ModelVariantValue {
    model: string | null
    variant: string | null
}

interface ModelVariantFieldsProps {
    id: string
    value: ModelVariantValue
    onChange: (next: ModelVariantValue) => void
    models: { data?: AiModelDto[]; isError?: boolean; isLoading: boolean; error?: unknown }
    /** Rodapé da busca para limpar o modelo (ex.: "Usar o modelo padrão do agente"); ausente = sem rodapé. */
    clearLabel?: string
    placeholder?: string
    disabled?: boolean
}

/**
 * Campos **Modelo** (busca de modelos do OpenCode) e **Variante (raciocínio)**, esta só quando o
 * modelo tem variantes. Compartilhados pelas etapas da configuração (padrão e central) e pela
 * configuração de modelos da mesa e do fork. Fragmento: os campos entram na grade do pai.
 * Trocar o modelo zera a variante.
 */
export function ModelVariantFields({ id, value, onChange, models, clearLabel, placeholder = "Modelo padrão do agente", disabled = false }: ModelVariantFieldsProps) {
    const model = models.data?.find((item) => item.id === value.model)
    return (
        <>
            <Field id={`${id}-model`} label="Modelo" error={models.isError ? apiErrorMessage(models.error, "Não foi possível listar os modelos") : undefined}>
                <ModelSearchPicker
                    trigger={<FieldTrigger id={`${id}-model`} placeholder={placeholder} value={model ? model.name : value.model || undefined} disabled={disabled} />}
                    models={models}
                    disabled={disabled}
                    // Escolher qualquer modelo (inclusive o que já está no campo) grava e zera a variante: repetir o
                    // modelo herdado é como se fixa o modelo na mesa e, na central, como se volta à variante padrão.
                    onPick={(item) => onChange({ model: item.id, variant: null })}
                    matchTriggerWidth
                    footer={
                        clearLabel && value.model ? (
                            <button type="button" className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange({ model: null, variant: null })}>
                                {clearLabel}
                            </button>
                        ) : undefined
                    }
                />
            </Field>
            {model && model.variants.length > 0 && (
                <Field id={`${id}-variant`} label="Variante (raciocínio)">
                    <Select value={value.variant ?? DEFAULT_OPTION} disabled={disabled} onValueChange={(next) => onChange({ model: model.id, variant: next === DEFAULT_OPTION ? null : next })}>
                        <SelectTrigger id={`${id}-variant`} className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={DEFAULT_OPTION}>Padrão do modelo</SelectItem>
                            {model.variants.map((variant) => (
                                <SelectItem key={variant} value={variant}>
                                    {variant}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}
        </>
    )
}
