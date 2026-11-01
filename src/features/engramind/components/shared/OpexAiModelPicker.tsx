"use client"

import type { ComponentProps, ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AiProviderTabs } from "@/features/ai/components/AiProviderTabs"
import { ModelPickerField } from "@/features/ai/components/ModelFields"
import type { useAiModels } from "@/features/ai/hooks/useAi"
import type { AiProviderStatusDto } from "@/lib/ai/providers"
import { InfoField } from "./InfoField"

type ModelsQuery = ReturnType<typeof useAiModels>
type ModelOption = NonNullable<ModelsQuery["data"]>[number]

/**
 * Provedor + modelo da IA do Opex escolhidos como em `/integracoes/ia` (`AiProviderTabs` +
 * `ModelPickerField`), sem OpenCode nem Jev: usado pelo Redator (aba Provedores) e pelo curador da
 * migração de memórias. O modelo aparece (animado) só depois do provedor; `children` entra no mesmo
 * bloco (campos extras como reservas e temperatura).
 */
export function OpexAiModelPicker({
    id,
    providers,
    allowed,
    provider,
    modelId,
    models,
    errors,
    disabled,
    info,
    hint,
    emptyText,
    onProviderChange,
    onModelPick,
    children,
}: {
    id: string
    providers: AiProviderStatusDto[]
    allowed: ComponentProps<typeof AiProviderTabs>["allowed"]
    provider: string | null
    modelId: string | null
    models: ModelsQuery
    errors?: { provider?: string; model?: string }
    disabled?: boolean
    info?: ReactNode
    hint?: ReactNode
    emptyText: string
    onProviderChange: (next: string) => void
    onModelPick: (model: ModelOption) => void
    children?: ReactNode
}) {
    return (
        <>
            <InfoField id={`${id}-provider`} label="Provedor" info={info} error={errors?.provider} hint={hint}>
                <AiProviderTabs
                    id={`${id}-provider`}
                    providers={providers}
                    allowed={allowed}
                    value={provider}
                    disabled={disabled}
                    emptyText={emptyText}
                    onChange={(next) => {
                        if (next !== provider) onProviderChange(next)
                    }}
                />
            </InfoField>
            <AnimatePresence initial={false}>
                {provider && (
                    <motion.div key="model" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-4 overflow-hidden">
                        <ModelPickerField id={`${id}-model`} models={models} modelId={modelId} error={errors?.model} disabled={disabled} onPick={onModelPick} />
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
