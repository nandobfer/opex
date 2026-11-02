"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Info, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useAiAgents, useAiModels, useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { AI_TEXT_PROVIDER_IDS, type AiTextProviderId } from "@/lib/ai/providers"
import { AiProviderTabs } from "../AiProviderTabs"
import { DirectModelFields } from "./DirectModelFields"
import { AgentConfigFields } from "@/features/agentic/components/settings/AgentConfigFields"
import { NumberField } from "@/features/pr-review/components/NumberField"
import type { AgentConfig } from "@/features/agentic/schemas"

/** Campos do formulário usados pelo cartão (Agente Adversário e Agente Arquiteto). */
export interface AgentFormShape {
    /** Só com `providerSelect` (Agente Arquiteto): o provedor de texto escolhido. */
    provider?: AiTextProviderId
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
    /** Aviso com um provedor direto (sem acesso ao código). */
    directNotice?: string
}

const EMPTY_AGENT: AgentConfig = { agent: null, model: null, variant: null, fallbacks: [] }

/**
 * Agente do OpenCode (agente, modelo, variante e fallbacks), tempo máximo e instruções adicionais. Com
 * `providerSelect`, escolhe antes o provedor de texto (só os conectados): fora do OpenCode ficam só o
 * modelo e o raciocínio. Sem a prop (Agente Adversário), é sempre OpenCode.
 */
export function AgentCard<T extends AgentFormShape>({ form: source, copy, providerSelect = false }: { form: UseFormReturn<T>; copy: AgentCardCopy; providerSelect?: boolean }) {
    const form = source as unknown as UseFormReturn<AgentFormShape>
    const watched = useWatch({ control: form.control, name: "provider" })
    const provider: AiTextProviderId = providerSelect ? (watched ?? "opencode") : "opencode"
    const opencode = provider === "opencode"
    const agents = useAiAgents(opencode)
    const models = useAiModels(opencode ? "opencode" : null)
    const { providers } = useAiProviderStatuses()
    const errors = form.formState.errors
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{providerSelect ? "Provedor e modelo" : "Agente do OpenCode"}</CardTitle>
                <CardDescription>{copy.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {providerSelect && (
                    <Field id={`${copy.id}-provider`} label="Provedor" error={errors.provider?.message}>
                        <AiProviderTabs
                            id={`${copy.id}-provider`}
                            providers={providers}
                            allowed={AI_TEXT_PROVIDER_IDS}
                            value={provider}
                            onChange={(next) => {
                                if (next === provider) return
                                // Os ids de modelo, agente e fallbacks não valem entre provedores.
                                form.setValue("provider", next as AiTextProviderId, { shouldDirty: true, shouldValidate: true })
                                form.setValue("agent", EMPTY_AGENT, { shouldDirty: true, shouldValidate: true })
                            }}
                            emptyText="Nenhum provedor conectado: configure e teste um provedor na aba Provedores."
                        />
                    </Field>
                )}
                <Controller
                    control={form.control}
                    name="agent"
                    render={({ field }) =>
                        opencode ? (
                            <AgentConfigFields id={`${copy.id}-agent`} value={field.value} onChange={(next) => field.onChange(next ?? EMPTY_AGENT)} agents={agents} models={models} error={errors.agent?.model?.message} />
                        ) : (
                            <DirectModelFields id={`${copy.id}-agent`} provider={provider} value={field.value} onChange={field.onChange} error={errors.agent?.model?.message} />
                        )
                    }
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
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {!opencode && copy.directNotice ? copy.directNotice : copy.notice}
                </p>
            </CardContent>
        </Card>
    )
}
