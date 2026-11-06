"use client"

import { Controller, useWatch, type FieldValues, type UseFormReturn } from "react-hook-form"
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

interface ProviderModelCardProps<T extends FieldValues> {
    form: UseFormReturn<T>
    providers: AiProviderStatusDto[]
    onProviderChange?: (provider: AiProviderId) => void
    /** Feature exclusiva de um provedor: esconde o seletor e usa este provedor. */
    fixedProvider?: AiProviderId
    /** Caminho dos campos no formulário quando ficam aninhados (ex.: `opex.model` nos agentes rotineiros). */
    names?: ProviderModelNames
    /** Esconde o seletor de agente do OpenCode (o formulário não tem o campo). */
    hideAgent?: boolean
    /** Prefixo dos ids dos campos (vários cards na mesma tela). */
    idPrefix?: string
}

export interface ProviderModelNames {
    provider: string
    model: string
    agent: string
    variant: string
}

const DEFAULT_NAMES: ProviderModelNames = { provider: "provider", model: "model", agent: "agent", variant: "variant" }

/** Mensagem de erro de um caminho com pontos (`opex.model`). */
function errorAt(errors: Record<string, unknown>, path: string): string | undefined {
    const value = path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), errors)
    return value && typeof value === "object" && "message" in value ? String((value as { message?: unknown }).message ?? "") || undefined : undefined
}

/** Provedor (só os conectados), modelo, agente (OpenCode) e variante/raciocínio. */
export function ProviderModelCard<T extends FieldValues>({ form, providers, onProviderChange, fixedProvider, names = DEFAULT_NAMES, hideAgent = false, idPrefix = "ai" }: ProviderModelCardProps<T>) {
    const cardForm = form as unknown as UseFormReturn<Record<string, unknown>>
    const errors = cardForm.formState.errors as Record<string, unknown>
    const watchedProvider = useWatch({ control: cardForm.control, name: names.provider }) as AiProviderId | null | undefined
    const provider = fixedProvider ?? watchedProvider ?? null
    const modelId = useWatch({ control: cardForm.control, name: names.model }) as string | null
    const def = provider ? getAiProvider(provider) : null
    const models = useAiModels(provider)
    const agents = useAiAgents(def?.supportsAgent === true && !hideAgent)
    const model = models.data?.find((item) => item.id === modelId)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Provedor e modelo</CardTitle>
                <CardDescription>Só os provedores conectados podem ser escolhidos. Configure e teste-os na aba Provedores.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {!fixedProvider && (
                    <Field id={`${idPrefix}-provider`} label="Provedor" error={errorAt(errors, names.provider)}>
                        <AiProviderTabs
                            id={`${idPrefix}-provider`}
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
                        id={`${idPrefix}-model`}
                        models={models}
                        modelId={modelId}
                        error={errorAt(errors, names.model)}
                        disabled={!provider}
                        placeholder={provider ? "Escolha o modelo" : "Escolha o provedor primeiro"}
                        onPick={(item) => {
                            cardForm.setValue(names.model, item.id, { shouldDirty: true, shouldValidate: true })
                            cardForm.setValue(names.variant, null, { shouldDirty: true })
                        }}
                    />

                    {def && model && model.variants.length > 0 && (
                        <Controller
                            control={cardForm.control}
                            name={names.variant}
                            render={({ field }) => <VariantSelectField id={`${idPrefix}-variant`} label={def.variantLabel} variants={model.variants} value={(field.value as string | null) ?? null} onChange={field.onChange} />}
                        />
                    )}

                    {def?.supportsAgent && !hideAgent && (
                        <Field id={`${idPrefix}-agent`} label="Agente do OpenCode" error={agents.isError ? apiErrorMessage(agents.error, "Não foi possível listar os agentes") : undefined}>
                            <Controller
                                control={cardForm.control}
                                name={names.agent}
                                render={({ field }) => (
                                    <Select value={(field.value as string | null) ?? DEFAULT_OPTION} onValueChange={(value) => field.onChange(value === DEFAULT_OPTION ? null : value)}>
                                        <SelectTrigger id={`${idPrefix}-agent`} className="w-full">
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
