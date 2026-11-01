"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { Info, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useAiAgents, useAiModels } from "@/features/ai/hooks/useAi"
import { AgentConfigFields } from "@/features/agentic/components/settings/AgentConfigFields"
import { NumberField } from "@/features/pr-review/components/NumberField"
import type { AgentConfig } from "@/features/agentic/schemas"

/** Campos do formulário usados pelo cartão (Agente Adversário e Agente Arquiteto). */
export interface AgentFormShape {
    agent: AgentConfig
    timeoutMinutes: number
    instructions: string
}

export interface AgentCardCopy {
    /** Prefixo dos ids dos campos (`<id>-agent`, `<id>-timeout`, `<id>-instructions`). */
    id: string
    description: string
    timeoutLabel: string
    timeoutMin: number
    timeoutMax: number
    placeholder: string
    notice: string
}

/** Agente do OpenCode (agente, modelo, variante e fallbacks), tempo máximo e instruções adicionais. */
export function AgentCard<T extends AgentFormShape>({ form: source, copy }: { form: UseFormReturn<T>; copy: AgentCardCopy }) {
    const form = source as unknown as UseFormReturn<AgentFormShape>
    const agents = useAiAgents(true)
    const models = useAiModels("opencode")
    const errors = form.formState.errors
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Agente do OpenCode</CardTitle>
                <CardDescription>{copy.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Controller
                    control={form.control}
                    name="agent"
                    render={({ field }) => <AgentConfigFields id={`${copy.id}-agent`} value={field.value} onChange={(next) => field.onChange(next ?? { agent: null, model: null, variant: null, fallbacks: [] })} agents={agents} models={models} error={errors.agent?.model?.message} />}
                />
                <NumberField<AgentFormShape> control={form.control} name="timeoutMinutes" id={`${copy.id}-timeout`} label={copy.timeoutLabel} min={copy.timeoutMin} max={copy.timeoutMax} error={errors.timeoutMinutes?.message} />
                <Field id={`${copy.id}-instructions`} label="Instruções adicionais (opcional)" error={errors.instructions?.message}>
                    <Textarea id={`${copy.id}-instructions`} rows={5} className="font-mono text-xs" placeholder={copy.placeholder} {...form.register("instructions")} />
                    <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", "", { shouldDirty: true, shouldValidate: true })}>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                        </Button>
                    </div>
                </Field>
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {copy.notice}
                </p>
            </CardContent>
        </Card>
    )
}
