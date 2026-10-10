"use client"

import { AnimatePresence, motion } from "framer-motion"
import { RotateCcw } from "lucide-react"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getAiProvider } from "@/lib/ai/providers"
import { DEFAULT_TASK_SUMMARY_INSTRUCTIONS, TASK_SUMMARY_MAX_LENGTH_DEFAULT, TASK_SUMMARY_MAX_LENGTH_MAX, TASK_SUMMARY_MAX_LENGTH_MIN } from "../../constants"
import type { TaskSummarySettings } from "../../schemas"

/** `""` no campo numérico = vazio (usa o padrão do modelo). */
const toNumberOrNull = (value: string) => (value.trim() === "" ? null : Number(value))

/** Instruções (prompt de sistema), tamanho do resumo e, no Gemini, temperatura e máximo de tokens. */
export function SummaryPromptCard({ form }: { form: UseFormReturn<TaskSummarySettings> }) {
    const errors = form.formState.errors
    const provider = useWatch({ control: form.control, name: "provider" })
    const sampling = provider ? getAiProvider(provider).supportsSampling : false

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Resumo</CardTitle>
                <CardDescription>Como a IA deve resumir a tarefa. Título e descrição são enviados como entrada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id="ai-summary-max-length" label="Tamanho máximo (caracteres)" error={errors.maxLength?.message}>
                    <Controller
                        control={form.control}
                        name="maxLength"
                        render={({ field }) => (
                            <Input
                                id="ai-summary-max-length"
                                type="number"
                                step={10}
                                min={TASK_SUMMARY_MAX_LENGTH_MIN}
                                max={TASK_SUMMARY_MAX_LENGTH_MAX}
                                value={field.value}
                                onChange={(event) => field.onChange(event.target.value === "" ? TASK_SUMMARY_MAX_LENGTH_DEFAULT : Number(event.target.value))}
                            />
                        )}
                    />
                    <p className="text-xs text-muted-foreground">
                        Entre {TASK_SUMMARY_MAX_LENGTH_MIN} e {TASK_SUMMARY_MAX_LENGTH_MAX} caracteres. O resumo é sempre uma linha.
                    </p>
                </Field>

                <AnimatePresence initial={false}>
                    {sampling && (
                        <motion.div key="sampling" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                            <div className={FORM_GRID_WIDE}>
                                <Field id="ai-summary-temperature" label="Temperatura" error={errors.temperature?.message}>
                                    <Controller
                                        control={form.control}
                                        name="temperature"
                                        render={({ field }) => <Input id="ai-summary-temperature" type="number" step="0.1" min={0} max={2} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(toNumberOrNull(event.target.value))} />}
                                    />
                                </Field>
                                <Field id="ai-summary-max-tokens" label="Máximo de tokens na resposta" error={errors.maxOutputTokens?.message}>
                                    <Controller
                                        control={form.control}
                                        name="maxOutputTokens"
                                        render={({ field }) => <Input id="ai-summary-max-tokens" type="number" step="256" min={256} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(toNumberOrNull(event.target.value))} />}
                                    />
                                </Field>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <Field id="ai-summary-instructions" label="Instruções (prompt de sistema)" error={errors.instructions?.message}>
                    <Textarea id="ai-summary-instructions" rows={7} className="font-mono text-xs" {...form.register("instructions")} />
                    <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_TASK_SUMMARY_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                        </Button>
                    </div>
                </Field>
            </CardContent>
        </Card>
    )
}
