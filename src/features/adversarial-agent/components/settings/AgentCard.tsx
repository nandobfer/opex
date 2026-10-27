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
import { ADVERSARIAL_TIMEOUT_MAX, ADVERSARIAL_TIMEOUT_MIN } from "../../constants"
import type { AdversarialSettings } from "../../schemas"

/** Agente do OpenCode (agente, modelo, variante e fallbacks), tempo máximo e instruções adicionais. */
export function AgentCard({ form }: { form: UseFormReturn<AdversarialSettings> }) {
    const agents = useAiAgents(true)
    const models = useAiModels("opencode")
    const errors = form.formState.errors
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Agente do OpenCode</CardTitle>
                <CardDescription>Cada rodada abre uma sessão NOVA do OpenCode no worktree da mesa, sem o histórico do implementador. O agente só lê o código: nunca roda testes, build, lint ou typecheck.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Controller
                    control={form.control}
                    name="agent"
                    render={({ field }) => <AgentConfigFields id="adversarial-agent" value={field.value} onChange={(next) => field.onChange(next ?? { agent: null, model: null, variant: null, fallbacks: [] })} agents={agents} models={models} error={errors.agent?.model?.message} />}
                />
                <NumberField<AdversarialSettings> control={form.control} name="timeoutMinutes" id="adversarial-timeout" label="Tempo máximo da revisão (minutos)" min={ADVERSARIAL_TIMEOUT_MIN} max={ADVERSARIAL_TIMEOUT_MAX} error={errors.timeoutMinutes?.message} />
                <Field id="adversarial-instructions" label="Instruções adicionais (opcional)" error={errors.instructions?.message}>
                    <Textarea id="adversarial-instructions" rows={5} className="font-mono text-xs" placeholder="Ex.: dê atenção a permissões e a migrações; ignore arquivos gerados." {...form.register("instructions")} />
                    <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", "", { shouldDirty: true, shouldValidate: true })}>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                        </Button>
                    </div>
                </Field>
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> A revisão roda sem ninguém para responder: o agente só tem permissão de leitura (edição, subagentes e comandos de teste, build, lint, instalação e escrita no git são negados) e perguntas são dispensadas.
                </p>
            </CardContent>
        </Card>
    )
}
