"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { getAiProvider, type AiProviderStatusDto } from "@/lib/ai/providers"
import { useAiModels } from "@/features/ai/hooks/useAi"
import { ModelPickerField, VariantSelectField } from "@/features/ai/components/ModelFields"
import { isOpexProviderId, OPEX_PROVIDER_IDS, type OpexProviderId } from "../../constants"
import type { OpexAgentSettings } from "../../schemas"

const SAME_AS_MAIN = "__same__"
const toNumberOrNull = (value: string) => (value.trim() === "" ? null : Number(value))

interface OpexModelCardProps {
    form: UseFormReturn<OpexAgentSettings>
    target: "main" | "title"
    providers: AiProviderStatusDto[]
    title: string
    description: string
}

/** Provedor (só os conectados e com ferramentas), modelo, variante e, no principal, a amostragem. */
export function OpexModelCard({ form, target, providers, title, description }: OpexModelCardProps) {
    const errors = form.formState.errors[target]
    const provider = useWatch({ control: form.control, name: `${target}.provider` })
    const modelId = useWatch({ control: form.control, name: `${target}.model` })
    const models = useAiModels(provider)
    const model = models.data?.find((item) => item.id === modelId)
    const def = provider ? getAiProvider(provider) : null
    const options = providers.filter((item) => isOpexProviderId(item.id))
    const anyConnected = options.some((item) => item.connected)
    const id = (field: string) => `opex-${target}-${field}`

    const changeProvider = (next: string) => {
        const value = next === SAME_AS_MAIN ? null : (next as OpexProviderId)
        if (value === provider) return
        form.setValue(`${target}.provider`, value, { shouldDirty: true, shouldValidate: true })
        form.setValue(`${target}.model`, null, { shouldDirty: true, shouldValidate: true })
        form.setValue(`${target}.variant`, null, { shouldDirty: true })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id={id("provider")} label="Provedor" error={errors?.provider?.message}>
                    {!anyConnected && target === "main" ? (
                        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum provedor conectado: configure e teste Gemini, Anthropic, OpenAI ou DeepSeek na aba Provedores.</p>
                    ) : (
                        <OptionTabs<string>
                            id={id("provider")}
                            options={[
                                ...(target === "title" ? [{ value: SAME_AS_MAIN, label: "Mesmo do agente" }] : []),
                                ...OPEX_PROVIDER_IDS.map((providerId) => {
                                    const status = options.find((item) => item.id === providerId)
                                    return { value: providerId, label: getAiProvider(providerId).name, disabled: !status?.connected, title: status?.connected ? undefined : `${getAiProvider(providerId).name}: não conectado` }
                                }),
                            ]}
                            value={provider ?? (target === "title" ? SAME_AS_MAIN : "")}
                            onChange={changeProvider}
                            className="w-full flex-wrap"
                        />
                    )}
                    <p className="text-xs text-muted-foreground">O OpenCode não aparece: ele não aceita as ferramentas do app.</p>
                </Field>

                <AnimatePresence initial={false}>
                    {provider && (
                        <motion.div key="model" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                            <div className={FORM_GRID_WIDE}>
                                <ModelPickerField
                                    id={id("model")}
                                    models={models}
                                    modelId={modelId}
                                    error={errors?.model?.message}
                                    onPick={(item) => {
                                        form.setValue(`${target}.model`, item.id, { shouldDirty: true, shouldValidate: true })
                                        form.setValue(`${target}.variant`, null, { shouldDirty: true })
                                    }}
                                />
                                {def && model && model.variants.length > 0 && (
                                    <Controller
                                        control={form.control}
                                        name={`${target}.variant`}
                                        render={({ field }) => <VariantSelectField id={id("variant")} label={def.variantLabel} variants={model.variants} value={field.value ?? null} onChange={field.onChange} />}
                                    />
                                )}
                                {target === "main" && def?.supportsSampling && (
                                    <>
                                        <Field id={id("temperature")} label="Temperatura" error={form.formState.errors.main?.temperature?.message}>
                                            <Controller
                                                control={form.control}
                                                name="main.temperature"
                                                render={({ field }) => <Input id={id("temperature")} type="number" step="0.1" min={0} max={2} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(toNumberOrNull(event.target.value))} />}
                                            />
                                        </Field>
                                        <Field id={id("max-tokens")} label="Máximo de tokens por resposta" error={form.formState.errors.main?.maxOutputTokens?.message}>
                                            <Controller
                                                control={form.control}
                                                name="main.maxOutputTokens"
                                                render={({ field }) => <Input id={id("max-tokens")} type="number" step="256" min={256} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(toNumberOrNull(event.target.value))} />}
                                            />
                                        </Field>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
