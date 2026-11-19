"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { DEFAULT_TASK_SUMMARY_INSTRUCTIONS, TASK_SUMMARY_MAX_LENGTH_DEFAULT, TASK_SUMMARY_MAX_LENGTH_MAX, TASK_SUMMARY_MAX_LENGTH_MIN } from "../../constants"
import type { TaskSummarySettings } from "../../schemas"
import { PromptSamplingFieldsBlock, type PromptSamplingFields } from "../shared/PromptSamplingFields"

/** Instruções (prompt de sistema), tamanho do resumo e, no Gemini, temperatura e máximo de tokens. */
export function SummaryPromptCard({ form }: { form: UseFormReturn<TaskSummarySettings> }) {
    const errors = form.formState.errors

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

                <PromptSamplingFieldsBlock form={form as unknown as UseFormReturn<PromptSamplingFields>} idPrefix="ai-summary" defaultInstructions={DEFAULT_TASK_SUMMARY_INSTRUCTIONS} />
            </CardContent>
        </Card>
    )
}
