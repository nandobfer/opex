"use client"

import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { getAiProvider, type AiProviderId } from "@/lib/ai/providers"
import type { AgentConfig } from "@/features/agentic/schemas"
import { useAiModels } from "../../hooks/useAi"
import { ModelPickerField, VariantSelectField } from "../ModelFields"

/**
 * Modelo e raciocínio de um provedor direto (sem agente nem fallbacks, que são do OpenCode), gravados
 * no mesmo `AgentConfig` do formulário. Mesmos campos das features de IA (`ProviderModelCard`).
 */
export function DirectModelFields({ id, provider, value, onChange, error }: { id: string; provider: AiProviderId; value: AgentConfig; onChange: (next: AgentConfig) => void; error?: string }) {
    const models = useAiModels(provider)
    const model = models.data?.find((item) => item.id === value.model)
    const def = getAiProvider(provider)
    return (
        <div className={FORM_GRID_WIDE}>
            <ModelPickerField id={`${id}-model`} provider={provider} models={models} modelId={value.model} error={error} onPick={(item) => onChange({ agent: null, model: item.id, variant: null, fallbacks: [] })} />
            {model && model.variants.length > 0 && <VariantSelectField id={`${id}-variant`} label={def.variantLabel} variants={model.variants} value={value.variant} onChange={(variant) => onChange({ ...value, variant })} />}
        </div>
    )
}
