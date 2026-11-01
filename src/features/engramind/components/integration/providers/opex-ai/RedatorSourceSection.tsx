"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Check, FlaskConical, Loader2 } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"
import { Button } from "@/components/ui/button"
import { MultiAutocomplete } from "@/components/ui/multi-autocomplete"
import { TemperatureInput } from "@/features/ai/components/TemperatureInput"
import { useAiModels } from "@/features/ai/hooks/useAi"
import type { AiProviderStatusDto } from "@/lib/ai/providers"
import { MAX_FALLBACK_MODELS, REDATOR_SOURCE_PROVIDERS, type RedatorSourceProvider } from "../../../../ai-source"
import { AI_SOURCE_HELP } from "../../../../help/ai-source"
import { redatorSourceSchema, type RedatorSourceInput } from "../../../../schemas/ai-source"
import type { AiSourceSectionDto } from "../../../../types"
import { InfoField } from "../../../shared/InfoField"
import { OpexAiModelPicker } from "../../../shared/OpexAiModelPicker"
import { SourceStatus } from "./SourceStatus"
import { TestResult } from "./TestResult"
import { useSourceActions } from "./useSourceActions"

type RedatorValues = z.output<typeof redatorSourceSchema>

/** Valor inicial: o último aplicado (snapshot) ou, sem ele, a configuração em uso quando bate com um provedor do Opex. */
export function redatorDefaults(state: AiSourceSectionDto): RedatorSourceInput {
    const provider = (state.provider ?? state.currentOpexProvider) as RedatorSourceProvider | null
    const model = state.provider ? state.model : state.currentOpexProvider ? state.current.model : null
    const temperature = state.provider ? state.temperature : state.currentOpexProvider ? state.current.temperature : null
    return { provider: provider ?? (undefined as unknown as RedatorSourceProvider), model: model ?? "", fallbackModels: state.provider ? state.fallbackModels : [], temperature }
}

/** Redator: provedor do Opex, modelo e reservas da mesma lista; testar e aplicar. */
export function RedatorSourceSection({ state, providers, disabled }: { state: AiSourceSectionDto; providers: AiProviderStatusDto[]; disabled?: boolean }) {
    const form = useForm<RedatorSourceInput, unknown, RedatorValues>({ resolver: zodResolver(redatorSourceSchema), mode: "onChange", defaultValues: redatorDefaults(state) })
    const provider = useWatch({ control: form.control, name: "provider" }) ?? null
    const modelId = useWatch({ control: form.control, name: "model" })
    const fallbacks = useWatch({ control: form.control, name: "fallbackModels" }) ?? []
    const temperature = useWatch({ control: form.control, name: "temperature" }) ?? null
    const models = useAiModels(provider)
    const actions = useSourceActions("redator")
    const errors = form.formState.errors
    // Lido sempre (fora de curto-circuito): o react-hook-form só acompanha `isValid` se ele for lido em toda renderização.
    const isValid = form.formState.isValid
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
            <OpexAiModelPicker
                id="redator-source"
                providers={providers}
                allowed={REDATOR_SOURCE_PROVIDERS}
                provider={provider}
                modelId={modelId || null}
                models={models}
                errors={{ provider: errors.provider?.message, model: errors.model?.message }}
                disabled={disabled}
                info={AI_SOURCE_HELP.redatorProvider}
                hint="O OpenCode não aparece: o Engramind chama o provedor direto."
                emptyText="Nenhum provedor conectado: configure Gemini, Anthropic, OpenAI ou DeepSeek em Integrações › Inteligência Artificial."
                onProviderChange={(next) => {
                    form.setValue("provider", next as RedatorSourceProvider, { shouldDirty: true, shouldValidate: true })
                    form.setValue("model", "", { shouldDirty: true, shouldValidate: true })
                    form.setValue("fallbackModels", [], { shouldDirty: true, shouldValidate: true })
                    actions.clearOutcome()
                }}
                onModelPick={(item) => {
                    form.setValue("model", item.id, { shouldDirty: true, shouldValidate: true })
                    form.setValue("fallbackModels", fallbacks.filter((id) => id !== item.id), { shouldDirty: true, shouldValidate: true })
                }}
            >
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
                <InfoField id="redator-source-temperature" label="Temperatura" info={AI_SOURCE_HELP.temperature} error={errors.temperature?.message}>
                    <TemperatureInput id="redator-source-temperature" value={temperature} disabled={disabled} aria-invalid={Boolean(errors.temperature)} onChange={(next) => form.setValue("temperature", next, { shouldDirty: true, shouldValidate: true })} />
                </InfoField>
            </OpexAiModelPicker>
            <TestResult outcome={actions.outcome} />
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" title={AI_SOURCE_HELP.test} disabled={disabled || !isValid || actions.testing} onClick={() => void form.handleSubmit((values) => actions.runTest(values))()}>
                    {actions.testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <FlaskConical className="mr-2 h-4 w-4" aria-hidden />} Testar com esta chave
                </Button>
                <Button type="button" disabled={disabled || !isValid || actions.applying} onClick={() => void submit()}>
                    {actions.applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Check className="mr-2 h-4 w-4" aria-hidden />} Aplicar no Redator
                </Button>
            </div>
        </div>
    )
}
