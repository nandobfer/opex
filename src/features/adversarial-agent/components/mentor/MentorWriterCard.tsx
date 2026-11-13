"use client"

import type { UseFormReturn } from "react-hook-form"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { AI_TEXT_PROVIDER_IDS, type AiProviderStatusDto } from "@/lib/ai/providers"
import { NumberField } from "@/features/pr-review/components/NumberField"
import { DEFAULT_MENTOR_WRITER_INSTRUCTIONS, MENTOR_TIMEOUT_MAX, MENTOR_TIMEOUT_MIN } from "../../mentor/constants"
import type { MentorSettings } from "../../mentor/schemas"
import { MentorModelFields } from "./MentorModelFields"

/** Redator (operações na lista escolhida pelo Triador para cada caso) e o tempo máximo das chamadas do funil. */
export function MentorWriterCard({ form, providers }: { form: UseFormReturn<MentorSettings>; providers: AiProviderStatusDto[] }) {
    const errors = form.formState.errors
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Redator e sanitizador</CardTitle>
                <CardDescription>
                    Para cada caso, o redator vê a lista escolhida pelo Triador (com id, versão e autor de cada memória) e responde com as operações nela: criar, atualizar, fundir (as absorvidas são arquivadas) ou arquivar o que ficou obsoleto — tudo aplicado na hora, sem aprovação. Nunca exclui; memória do dono pode ser atualizada ou receber uma fusão, mas nunca é arquivada. O não gravar por cobertura só vale para uma memória da própria lista. Em seguida o sanitizador recusa o texto que citar projeto, repositório, rota, URL, tarefa ou issue (nas memórias da central, caminhos e rotas do projeto são aceitos) ou copiar as mensagens do dono, com uma nova tentativa. O título da memória é gerado pelo Redator do Engramind.
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
