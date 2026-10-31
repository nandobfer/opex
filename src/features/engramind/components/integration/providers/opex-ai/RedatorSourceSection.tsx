"use client"

import { AnimatePresence, motion } from "framer-motion"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, FlaskConical, Loader2 } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"
import { Button } from "@/components/ui/button"
import { MultiAutocomplete } from "@/components/ui/multi-autocomplete"
import { AiProviderTabs } from "@/features/ai/components/AiProviderTabs"
import { ModelPickerField } from "@/features/ai/components/ModelFields"
import { useAiModels } from "@/features/ai/hooks/useAi"
import type { AiProviderStatusDto } from "@/lib/ai/providers"
import { MAX_FALLBACK_MODELS, REDATOR_SOURCE_PROVIDERS, type RedatorSourceProvider } from "../../../../ai-source"
import { AI_SOURCE_HELP } from "../../../../help/ai-source"
import { redatorSourceSchema, type RedatorSourceInput } from "../../../../schemas/ai-source"
import type { AiSourceSectionDto } from "../../../../types"
import { InfoField } from "../../../shared/InfoField"
import { SourceStatus } from "./SourceStatus"
import { TestResult } from "./TestResult"
import { useSourceActions } from "./useSourceActions"

type RedatorValues = z.output<typeof redatorSourceSchema>

/** Valor inicial: o último aplicado (snapshot) ou, sem ele, a configuração em uso quando bate com um provedor do Opex. */
export function redatorDefaults(state: AiSourceSectionDto): RedatorSourceInput {
    const provider = (state.provider ?? state.currentOpexProvider) as RedatorSourceProvider | null
    const model = state.provider ? state.model : state.currentOpexProvider ? state.current.model : null
    return { provider: provider ?? (undefined as unknown as RedatorSourceProvider), model: model ?? "", fallbackModels: state.provider ? state.fallbackModels : [] }
}

/** Redator: provedor do Opex, modelo e reservas da mesma lista; testar e aplicar. */
export function RedatorSourceSection({ state, providers, disabled }: { state: AiSourceSectionDto; providers: AiProviderStatusDto[]; disabled?: boolean }) {
    const form = useForm<RedatorSourceInput, unknown, RedatorValues>({ resolver: zodResolver(redatorSourceSchema), mode: "onChange", defaultValues: redatorDefaults(state) })
    const provider = useWatch({ control: form.control, name: "provider" }) ?? null
    const modelId = useWatch({ control: form.control, name: "model" })
    const fallbacks = useWatch({ control: form.control, name: "fallbackModels" }) ?? []
    const models = useAiModels(provider)
    const actions = useSourceActions("redator")
    const errors = form.formState.errors
    const options = (models.data ?? []).filter((item) => item.id !== modelId).map((item) => ({ value: item.id, label: item.name, description: item.id === item.name ? undefined : item.id }))

    const submit = form.handleSubmit(async (values) => {
        if (await actions.runApply(values)) form.reset(values)
    })

    return (
        <div className="space-y-4" data-testid="redator-source">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">Redator</h3>
                <SourceStatus state={state} onResend={actions.resend} resending={actions.resending} />
            </div>
            <InfoField id="redator-source-provider" label="Provedor" info={AI_SOURCE_HELP.redatorProvider} error={errors.provider?.message} hint="O OpenCode não aparece: o Engramind chama o provedor direto.">
                <AiProviderTabs
                    id="redator-source-provider"
                    providers={providers}
                    allowed={REDATOR_SOURCE_PROVIDERS}
                    value={provider}
                    disabled={disabled}
                    emptyText="Nenhum provedor conectado: configure Gemini, Anthropic, OpenAI ou DeepSeek em Integrações › Inteligência Artificial."
                    onChange={(next) => {
                        if (next === provider) return
                        form.setValue("provider", next as RedatorSourceProvider, { shouldDirty: true, shouldValidate: true })
                        form.setValue("model", "", { shouldDirty: true, shouldValidate: true })
                        form.setValue("fallbackModels", [], { shouldDirty: true, shouldValidate: true })
                        actions.clearOutcome()
                    }}
                />
            </InfoField>
            <AnimatePresence initial={false}>
                {provider && (
                    <motion.div key="model" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-4 overflow-hidden">
                        <ModelPickerField
                            id="redator-source-model"
                            models={models}
                            modelId={modelId || null}
                            error={errors.model?.message}
                            disabled={disabled}
                            onPick={(item) => {
                                form.setValue("model", item.id, { shouldDirty: true, shouldValidate: true })
                                form.setValue("fallbackModels", fallbacks.filter((id) => id !== item.id), { shouldDirty: true, shouldValidate: true })
                            }}
                        />
                        <InfoField id="redator-source-fallbacks" label={`Modelos de reserva (até ${MAX_FALLBACK_MODELS})`} info={AI_SOURCE_HELP.fallbacks} error={errors.fallbackModels?.message ?? (errors.fallbackModels as { root?: { message?: string } } | undefined)?.root?.message}>
                            <MultiAutocomplete
                                id="redator-source-fallbacks"
                                aria-label="Modelos de reserva"
                                options={options}
                                value={fallbacks}
                                loading={models.isLoading}
                                disabled={disabled || !modelId}
                                placeholder={fallbacks.length >= MAX_FALLBACK_MODELS ? "Limite de reservas atingido" : "Buscar modelo"}
                                emptyText="Nenhum modelo disponível"
                                onChange={(next) => form.setValue("fallbackModels", next.slice(0, MAX_FALLBACK_MODELS), { shouldDirty: true, shouldValidate: true })}
                            />
                        </InfoField>
                    </motion.div>
                )}
            </AnimatePresence>
            <TestResult outcome={actions.outcome} />
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" title={AI_SOURCE_HELP.test} disabled={disabled || !form.formState.isValid || actions.testing} onClick={() => void form.handleSubmit((values) => actions.runTest(values))()}>
                    {actions.testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <FlaskConical className="mr-2 h-4 w-4" aria-hidden />} Testar com esta chave
                </Button>
                <Button type="button" disabled={disabled || !form.formState.isValid || actions.applying} onClick={() => void submit()}>
                    {actions.applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Check className="mr-2 h-4 w-4" aria-hidden />} Aplicar no Redator
                </Button>
            </div>
        </div>
    )
}
