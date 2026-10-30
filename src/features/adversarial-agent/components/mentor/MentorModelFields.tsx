"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { OptionTabs } from "@/components/ui/option-tabs"
import { getAiProvider, type AiProviderId, type AiProviderStatusDto } from "@/lib/ai/providers"
import { useAiModels } from "@/features/ai/hooks/useAi"
import { ModelPickerField, VariantSelectField } from "@/features/ai/components/ModelFields"
import type { MentorSettings } from "../../mentor/schemas"

type Part = "decider" | "router" | "writer"

/**
 * Provedor, modelo e variante de uma parte do Mentor (decisor, Triador ou redator). Só os provedores
 * conectados podem ser escolhidos; trocar de provedor limpa o modelo.
 */
export function MentorModelFields({ form, part, providerIds, providers }: { form: UseFormReturn<MentorSettings>; part: Part; providerIds: readonly AiProviderId[]; providers: AiProviderStatusDto[] }) {
    const names = { provider: `${part}.provider`, model: `${part}.model`, variant: `${part}.variant` } as const
    const errors = form.formState.errors[part]
    const provider = useWatch({ control: form.control, name: names.provider }) as AiProviderId | null
    const modelId = useWatch({ control: form.control, name: names.model }) as string | null
    const models = useAiModels(provider)
    const model = models.data?.find((item) => item.id === modelId)
    const options = { shouldDirty: true, shouldValidate: true }
    const setModel = (value: string | null) => {
        form.setValue(names.model, value, options)
        form.setValue(names.variant, null, options)
    }
    const id = `mentor-${part}`
    return (
        <div className="space-y-4">
            <Field id={`${id}-provider`} label="Provedor" error={errors?.provider?.message}>
                <OptionTabs<string>
                    id={`${id}-provider`}
                    options={providerIds.map((providerId) => {
                        const status = providers.find((item) => item.id === providerId)
                        return { value: providerId, label: getAiProvider(providerId).name, disabled: !status?.connected, title: status?.connected ? undefined : `${getAiProvider(providerId).name}: não conectado` }
                    })}
                    value={provider ?? ""}
                    onChange={(next) => {
                        if (next === provider) return
                        form.setValue(names.provider, next as never, options)
                        setModel(null)
                    }}
                    className="w-full flex-wrap"
                />
            </Field>
            <AnimatePresence initial={false}>
                {provider && (
                    <motion.div key="model" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className={FORM_GRID_WIDE}>
                            <ModelPickerField id={`${id}-model`} models={models} modelId={modelId} error={errors?.model?.message} onPick={(item) => setModel(item.id)} />
                            {model && model.variants.length > 0 && (
                                <Controller
                                    control={form.control}
                                    name={names.variant}
                                    render={({ field }) => <VariantSelectField id={`${id}-variant`} label={getAiProvider(provider).variantLabel} variants={model.variants} value={(field.value as string | null) ?? null} onChange={field.onChange} />}
                                />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
