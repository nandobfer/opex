"use client"

import { AnimatePresence, motion } from "framer-motion"
import { RotateCcw } from "lucide-react"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getAiProvider, type AiProviderId } from "@/lib/ai/providers"
import { TemperatureInput } from "@/features/ai/components/TemperatureInput"

/** Campos comuns de prompt de uma feature de IA (amostragem do provedor e instruções). */
export interface PromptSamplingFields {
    provider: AiProviderId | null
    temperature: number | null
    maxOutputTokens: number | null
    instructions: string
}

/** `""` no campo numérico = vazio (usa o padrão do modelo). */
const toNumberOrNull = (value: string) => (value.trim() === "" ? null : Number(value))

/**
 * Temperatura e máximo de tokens (só nos provedores com amostragem) e as instruções com "Restaurar
 * padrão" — compartilhado pelas features (Resumos de tarefas, Descritivo de versão de plugin).
 */
export function PromptSamplingFieldsBlock({ form, idPrefix, defaultInstructions }: { form: UseFormReturn<PromptSamplingFields>; idPrefix: string; defaultInstructions: string }) {
    const errors = form.formState.errors
    const provider = useWatch({ control: form.control, name: "provider" })
    const sampling = provider ? getAiProvider(provider).supportsSampling : false
    return (
        <>
                <AnimatePresence initial={false}>
                    {sampling && (
                        <motion.div key="sampling" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                            <div className={FORM_GRID_WIDE}>
                                <Field id={`${idPrefix}-temperature`} label="Temperatura" error={errors.temperature?.message}>
                                    <Controller
                                        control={form.control}
                                        name="temperature"
                                        render={({ field }) => <TemperatureInput id={`${idPrefix}-temperature`} value={field.value} onChange={field.onChange} />}
                                    />
                                </Field>
                                <Field id={`${idPrefix}-max-tokens`} label="Máximo de tokens na resposta" error={errors.maxOutputTokens?.message}>
                                    <Controller
                                        control={form.control}
                                        name="maxOutputTokens"
                                        render={({ field }) => <Input id={`${idPrefix}-max-tokens`} type="number" step="256" min={256} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(toNumberOrNull(event.target.value))} />}
                                    />
                                </Field>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <Field id={`${idPrefix}-instructions`} label="Instruções (prompt de sistema)" error={errors.instructions?.message}>
                    <Textarea id={`${idPrefix}-instructions`} rows={7} className="font-mono text-xs" {...form.register("instructions")} />
                    <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", defaultInstructions, { shouldDirty: true, shouldValidate: true })}>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                        </Button>
                    </div>
                </Field>
        </>
    )
}
