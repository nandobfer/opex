"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { OptionTabs } from "@/components/ui/option-tabs"
import { SearchPicker } from "@/components/ui/search-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiErrorMessage } from "@/lib/api"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { getAiProvider, type AiModelDto, type AiProviderId, type AiProviderStatusDto } from "@/lib/ai/providers"
import { useAiAgents, useAiModels } from "../../hooks/useAi"
import type { UnderstandTaskSettings } from "../../schemas"

const DEFAULT_OPTION = "__default__"

interface ProviderModelCardProps {
    form: UseFormReturn<UnderstandTaskSettings>
    providers: AiProviderStatusDto[]
    onProviderChange: (provider: AiProviderId) => void
}

/** Provedor (só os conectados), modelo, agente (OpenCode) e variante/raciocínio. */
export function ProviderModelCard({ form, providers, onProviderChange }: ProviderModelCardProps) {
    const errors = form.formState.errors
    const provider = useWatch({ control: form.control, name: "provider" })
    const modelId = useWatch({ control: form.control, name: "model" })
    const def = provider ? getAiProvider(provider) : null
    const models = useAiModels(provider)
    const agents = useAiAgents(def?.supportsAgent === true)
    const model = models.data?.find((item) => item.id === modelId)
    const connected = providers.filter((item) => item.connected)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Provedor e modelo</CardTitle>
                <CardDescription>Só os provedores conectados podem ser escolhidos. Configure e teste-os na aba Provedores.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id="ai-provider" label="Provedor" error={errors.provider?.message}>
                    {connected.length === 0 ? (
                        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum provedor conectado: configure e teste o OpenCode ou o Gemini.</p>
                    ) : (
                        <OptionTabs<AiProviderId>
                            id="ai-provider"
                            options={providers.map((item) => ({ value: item.id, label: item.name, disabled: !item.connected, title: item.connected ? item.name : `${item.name}: não conectado` }))}
                            value={provider ?? ("" as AiProviderId)}
                            onChange={onProviderChange}
                            className="w-full"
                        />
                    )}
                </Field>

                <div className={FORM_GRID_WIDE}>
                    <Field id="ai-model" label="Modelo" error={errors.model?.message ?? (models.isError ? apiErrorMessage(models.error, "Não foi possível listar os modelos") : undefined)}>
                        <SearchPicker<AiModelDto>
                            trigger={<FieldTrigger id="ai-model" placeholder={provider ? "Escolha o modelo" : "Escolha o provedor primeiro"} invalid={Boolean(errors.model)} value={model ? model.name : modelId || undefined} disabled={!provider} />}
                            items={models.data ?? []}
                            getKey={(item) => item.id}
                            searchKeys={["name", "id", "group"]}
                            renderItem={(item) => <ModelOption model={item} />}
                            onPick={(item) => {
                                form.setValue("model", item.id, { shouldDirty: true, shouldValidate: true })
                                form.setValue("variant", null, { shouldDirty: true })
                            }}
                            loading={models.isLoading}
                            disabled={!provider}
                            matchTriggerWidth
                            placeholder="Buscar modelo"
                            searchLabel="Buscar modelo"
                            listLabel="Modelos"
                            emptyText={models.isError ? "Não foi possível listar os modelos" : "Nenhum modelo disponível"}
                            emptySearchText="Nenhum modelo encontrado"
                        />
                    </Field>

                    {def && model && model.variants.length > 0 && (
                        <Field id="ai-variant" label={def.variantLabel}>
                            <Controller
                                control={form.control}
                                name="variant"
                                render={({ field }) => (
                                    <Select value={field.value ?? DEFAULT_OPTION} onValueChange={(value) => field.onChange(value === DEFAULT_OPTION ? null : value)}>
                                        <SelectTrigger id="ai-variant" className="w-full">
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
                                )}
                            />
                        </Field>
                    )}

                    {def?.supportsAgent && (
                        <Field id="ai-agent" label="Agente do OpenCode" error={agents.isError ? apiErrorMessage(agents.error, "Não foi possível listar os agentes") : undefined}>
                            <Controller
                                control={form.control}
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

function ModelOption({ model }: { model: AiModelDto }) {
    return (
        <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{model.name}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{model.id}</span>
            </span>
            {model.free && <span className="shrink-0 rounded bg-primary/15 px-1.5 text-[10px] font-medium text-primary">grátis</span>}
        </span>
    )
}
