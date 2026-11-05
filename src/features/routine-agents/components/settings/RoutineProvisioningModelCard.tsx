"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ProviderModelCard } from "@/features/ai/components/shared/ProviderModelCard"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { AI_TEXT_PROVIDER_IDS, type AiTextProviderId } from "@/lib/ai/providers"
import { DEFAULT_ROUTINE_AGENT_SETTINGS, routineAgentSettingsSchema, type RoutineAgentSettingsInput } from "../../schemas"
import { useRoutineAgentSettings, useSaveRoutineAgentSettings } from "../../hooks/useRoutineAgents"

/**
 * Modelo do **subagente de provisionamento** (decisão D2 da OPE-130): lê o objetivo e as instruções de
 * cada agente rotineiro e escolhe os canais extras do Engramind. Sem modelo, o provisionamento falha
 * com "Configure o modelo do provisionamento".
 */
export function RoutineProvisioningModelCard() {
    const query = useRoutineAgentSettings()
    const save = useSaveRoutineAgentSettings()
    const { providers: all } = useAiProviderStatuses()
    const providers = all.filter((item) => (AI_TEXT_PROVIDER_IDS as readonly string[]).includes(item.id))
    const form = useForm<RoutineAgentSettingsInput>({ resolver: zodResolver(routineAgentSettingsSchema), mode: "onChange", defaultValues: DEFAULT_ROUTINE_AGENT_SETTINGS })
    useEffect(() => {
        if (query.data) form.reset(query.data)
    }, [query.data, form])
    if (query.isLoading) return <Skeleton className="h-56 w-full" />
    return (
        <form className="space-y-3" onSubmit={form.handleSubmit((values) => save.mutate(values))} aria-label="Modelo do provisionamento">
            <div>
                <h3 className="text-sm font-semibold">Subagente de provisionamento</h3>
                <p className="text-xs text-muted-foreground">Modelo que lê o objetivo e as instruções de cada agente rotineiro e decide os canais extras de memória que ele vai assinar (ou cria).</p>
            </div>
            <ProviderModelCard
                form={form}
                providers={providers}
                idPrefix="routine-provisioning"
                onProviderChange={(provider) => {
                    form.setValue("provider", provider as AiTextProviderId, { shouldDirty: true, shouldValidate: true })
                    form.setValue("model", "", { shouldDirty: true })
                    form.setValue("variant", null, { shouldDirty: true })
                }}
            />
            <div className="flex justify-end">
                <Button type="submit" className="gap-1.5" disabled={!form.formState.isDirty || save.isPending}>
                    <Save className="h-4 w-4" aria-hidden /> Salvar modelo
                </Button>
            </div>
        </form>
    )
}
