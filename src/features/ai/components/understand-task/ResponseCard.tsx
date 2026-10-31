"use client"

import { AnimatePresence, motion } from "framer-motion"
import { RotateCcw } from "lucide-react"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Textarea } from "@/components/ui/textarea"
import { getAiProvider } from "@/lib/ai/providers"
import { DEFAULT_UNDERSTAND_TASK_INSTRUCTIONS, UNDERSTAND_TASK_FORMAT_LABELS, UNDERSTAND_TASK_FORMATS, UNDERSTAND_TASK_SECTIONS, type UnderstandTaskFormat } from "../../constants"
import type { UnderstandTaskSettings } from "../../schemas"
import { TemperatureInput } from "@/features/ai/components/TemperatureInput"

/** `""` no campo numérico = vazio (usa o padrão do modelo). */
const toNumberOrNull = (value: string) => (value.trim() === "" ? null : Number(value))

/** Formato, instruções (prompt de sistema) e, no Gemini, temperatura e máximo de tokens. */
export function ResponseCard({ form }: { form: UseFormReturn<UnderstandTaskSettings> }) {
    const errors = form.formState.errors
    const provider = useWatch({ control: form.control, name: "provider" })
    const format = useWatch({ control: form.control, name: "responseFormat" })
    const sampling = provider ? getAiProvider(provider).supportsSampling : false

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Resposta</CardTitle>
                <CardDescription>Como a IA deve responder. A tarefa completa é enviada como entrada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id="ai-format" label="Formato da resposta">
                    <Controller
                        control={form.control}
                        name="responseFormat"
                        render={({ field }) => (
                            <OptionTabs<UnderstandTaskFormat> id="ai-format" options={UNDERSTAND_TASK_FORMATS.map((value) => ({ value, label: UNDERSTAND_TASK_FORMAT_LABELS[value] }))} value={field.value} onChange={field.onChange} className="w-full" />
                        )}
                    />
                    <p className="text-xs text-muted-foreground">{format === "sections" ? `Seções: ${UNDERSTAND_TASK_SECTIONS.join(" · ")}` : "A IA organiza o texto livremente."}</p>
                </Field>

                <AnimatePresence initial={false}>
                    {sampling && (
                        <motion.div key="sampling" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                            <div className={FORM_GRID_WIDE}>
                                <Field id="ai-temperature" label="Temperatura" error={errors.temperature?.message}>
                                    <Controller
                                        control={form.control}
                                        name="temperature"
                                        render={({ field }) => <TemperatureInput id="ai-temperature" value={field.value} onChange={field.onChange} />}
                                    />
                                </Field>
                                <Field id="ai-max-tokens" label="Máximo de tokens na resposta" error={errors.maxOutputTokens?.message}>
                                    <Controller
                                        control={form.control}
                                        name="maxOutputTokens"
                                        render={({ field }) => <Input id="ai-max-tokens" type="number" step="256" min={256} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(toNumberOrNull(event.target.value))} />}
                                    />
                                </Field>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <Field id="ai-instructions" label="Instruções (prompt de sistema)" error={errors.instructions?.message}>
                    <Textarea id="ai-instructions" rows={7} className="font-mono text-xs" {...form.register("instructions")} />
                    <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_UNDERSTAND_TASK_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                        </Button>
                    </div>
                </Field>
            </CardContent>
        </Card>
    )
}
