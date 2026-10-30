"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Textarea } from "@/components/ui/textarea"
import { AI_TEXT_PROVIDER_IDS, type AiProviderStatusDto } from "@/lib/ai/providers"
import { NumberField } from "@/features/pr-review/components/NumberField"
import { DEFAULT_MENTOR_WRITER_INSTRUCTIONS, MENTOR_TIMEOUT_MAX, MENTOR_TIMEOUT_MIN, type MentorSaveMode } from "../../mentor/constants"
import type { MentorSettings } from "../../mentor/schemas"
import { MentorModelFields } from "./MentorModelFields"

/** Redator (escreve a regra para a lista escolhida pelo Triador e funde com memórias parecidas), a gravação e o tempo máximo. */
export function MentorWriterCard({ form, providers }: { form: UseFormReturn<MentorSettings>; providers: AiProviderStatusDto[] }) {
    const errors = form.formState.errors
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Redator e gravação</CardTitle>
                <CardDescription>
                    O redator transforma o caso numa regra para a lista escolhida pelo Triador (para o revisor: classe de erro, como detectar e que teste a teria pegado; para o desenvolvedor: o que fazer ou evitar), compara com as memórias dessa lista e decide criar, fundir ou não gravar — e não grava o que outra lista já cobre. Em seguida o sanitizador recusa a regra que citar projeto, repositório, rota, URL, tarefa ou issue (nas memórias da central, caminhos e rotas do projeto são aceitos), com uma nova tentativa. O título da memória é gerado pelo Resumo de memórias.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <MentorModelFields form={form} part="writer" providerIds={AI_TEXT_PROVIDER_IDS} providers={providers} />
                <Field id="mentor-writer-instructions" label="Instruções adicionais" error={errors.writer?.instructions?.message}>
                    <Textarea id="mentor-writer-instructions" rows={4} className="font-mono text-xs" {...form.register("writer.instructions")} />
                    <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("writer.instructions", DEFAULT_MENTOR_WRITER_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                        </Button>
                    </div>
                </Field>
                <Field id="mentor-save-mode" label="Gravação">
                    <Controller
                        control={form.control}
                        name="saveMode"
                        render={({ field }) => (
                            <OptionTabs<MentorSaveMode>
                                id="mentor-save-mode"
                                options={[
                                    { value: "direct", label: "Gravar direto" },
                                    { value: "suggest", label: "Sugerir e aguardar aprovação" },
                                ]}
                                value={field.value}
                                onChange={field.onChange}
                                className="w-full"
                            />
                        )}
                    />
                </Field>
                <NumberField<MentorSettings>
                    control={form.control}
                    name="timeoutSeconds"
                    id="mentor-timeout"
                    label={`Tempo máximo de cada chamada de IA (${MENTOR_TIMEOUT_MIN}–${MENTOR_TIMEOUT_MAX} segundos)`}
                    min={MENTOR_TIMEOUT_MIN}
                    max={MENTOR_TIMEOUT_MAX}
                    error={errors.timeoutSeconds?.message}
                />
            </CardContent>
        </Card>
    )
}
