"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiErrorMessage } from "@/lib/api"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { getAiProvider, type AiProviderId, type AiProviderStatusDto } from "@/lib/ai/providers"
import { useAiAgents, useAiModels } from "../../hooks/useAi"
import { AiProviderTabs } from "../AiProviderTabs"
import { ModelPickerField, VariantSelectField } from "../ModelFields"

const DEFAULT_OPTION = "__default__"

/** Campos de provedor compartilhados pelas features de IA. */
export interface ProviderModelFields {
    /** Ausente quando a feature é exclusiva de um provedor (ex.: "Estimar prazos" → OpenCode). */
    provider?: AiProviderId | null
    model: string | null
    agent: string | null
    variant: string | null
}

interface ProviderModelCardProps<T extends ProviderModelFields> {
    form: UseFormReturn<T>
    providers: AiProviderStatusDto[]
    onProviderChange?: (provider: AiProviderId) => void
    /** Feature exclusiva de um provedor: esconde o seletor e usa este provedor. */
    fixedProvider?: AiProviderId
}

/** Provedor (só os conectados), modelo, agente (OpenCode) e variante/raciocínio. */
export function ProviderModelCard<T extends ProviderModelFields>({ form, providers, onProviderChange, fixedProvider }: ProviderModelCardProps<T>) {
    const cardForm = form as unknown as UseFormReturn<ProviderModelFields>
    const errors = cardForm.formState.errors
    const watchedProvider = useWatch({ control: cardForm.control, name: "provider" })
    const provider = fixedProvider ?? watchedProvider ?? null
    const modelId = useWatch({ control: cardForm.control, name: "model" })
    const def = provider ? getAiProvider(provider) : null
    const models = useAiModels(provider)
    const agents = useAiAgents(def?.supportsAgent === true)
    const model = models.data?.find((item) => item.id === modelId)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Provedor e modelo</CardTitle>
                <CardDescription>Só os provedores conectados podem ser escolhidos. Configure e teste-os na aba Provedores.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {!fixedProvider && (
                    <Field id="ai-provider" label="Provedor" error={errors.provider?.message}>
                        <AiProviderTabs
                            id="ai-provider"
                            providers={providers}
                            allowed={providers.map((item) => item.id)}
                            value={provider}
                            onChange={(next) => onProviderChange?.(next as AiProviderId)}
                            emptyText="Nenhum provedor conectado: configure e teste um provedor na aba Provedores."
                        />
                    </Field>
                )}

                <div className={FORM_GRID_WIDE}>
                    <ModelPickerField
                        id="ai-model"
                        models={models}
                        modelId={modelId}
                        error={errors.model?.message}
                        disabled={!provider}
                        placeholder={provider ? "Escolha o modelo" : "Escolha o provedor primeiro"}
                        onPick={(item) => {
                            cardForm.setValue("model", item.id, { shouldDirty: true, shouldValidate: true })
                            cardForm.setValue("variant", null, { shouldDirty: true })
                        }}
                    />

                    {def && model && model.variants.length > 0 && (
                        <Controller
                            control={cardForm.control}
                            name="variant"
                            render={({ field }) => <VariantSelectField id="ai-variant" label={def.variantLabel} variants={model.variants} value={field.value ?? null} onChange={field.onChange} />}
                        />
                    )}

                    {def?.supportsAgent && (
                        <Field id="ai-agent" label="Agente do OpenCode" error={agents.isError ? apiErrorMessage(agents.error, "Não foi possível listar os agentes") : undefined}>
                            <Controller
                                control={cardForm.control}
                                name="agent"
                                render={({ field }) => (
                                    <Select value={field.value ?? DEFAULT_OPTION} onValueChange={(value) => field.onChange(value === DEFAULT_OPTION ? null : value)}>
                                        <SelectTrigger id="ai-agent" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={DEFAULT_OPTION}>Padrão do servidor</SelectItem>
                                            {(agents.data ?? []).map((agent) => (
                                                <SelectItem key={agent.id} value={agent.id}>
                                                    {agent.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </Field>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
