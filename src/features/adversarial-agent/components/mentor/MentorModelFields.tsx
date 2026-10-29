"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { OptionTabs } from "@/components/ui/option-tabs"
import { SearchPicker } from "@/components/ui/search-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiErrorMessage } from "@/lib/api"
import { getAiProvider, type AiModelDto, type AiProviderId, type AiProviderStatusDto } from "@/lib/ai/providers"
import { useAiModels } from "@/features/ai/hooks/useAi"
import type { MentorSettings } from "../../mentor/schemas"

const DEFAULT_OPTION = "__default__"

type Part = "decider" | "writer"

/**
 * Provedor, modelo e variante de uma parte do Mentor (decisor ou redator). Só os provedores
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
                            <Field id={`${id}-model`} label="Modelo" error={errors?.model?.message ?? (models.isError ? apiErrorMessage(models.error, "Não foi possível listar os modelos") : undefined)}>
                                <SearchPicker<AiModelDto>
                                    trigger={<FieldTrigger id={`${id}-model`} placeholder="Escolha o modelo" invalid={Boolean(errors?.model)} value={model ? model.name : modelId || undefined} />}
                                    items={models.data ?? []}
                                    getKey={(item) => item.id}
                                    searchKeys={["name", "id", "group"]}
                                    renderItem={(item) => (
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">{item.name}</span>
                                            <span className="block truncate font-mono text-[11px] text-muted-foreground">{item.id}</span>
                                        </span>
                                    )}
                                    onPick={(item) => setModel(item.id)}
                                    loading={models.isLoading}
                                    matchTriggerWidth
                                    placeholder="Buscar modelo"
                                    searchLabel="Buscar modelo"
                                    listLabel="Modelos"
                                    emptyText={models.isError ? "Não foi possível listar os modelos" : "Nenhum modelo disponível"}
                                    emptySearchText="Nenhum modelo encontrado"
                                />
                            </Field>
                            {model && model.variants.length > 0 && (
                                <Field id={`${id}-variant`} label={getAiProvider(provider).variantLabel}>
                                    <Controller
                                        control={form.control}
                                        name={names.variant}
                                        render={({ field }) => (
                                            <Select value={(field.value as string | null) ?? DEFAULT_OPTION} onValueChange={(value) => field.onChange(value === DEFAULT_OPTION ? null : value)}>
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
                                        )}
                                    />
                                </Field>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
