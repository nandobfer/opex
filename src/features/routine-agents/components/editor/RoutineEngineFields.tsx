"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { ProviderModelCard } from "@/features/ai/components/shared/ProviderModelCard"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { AI_TEXT_PROVIDER_IDS, type AiTextProviderId } from "@/lib/ai/providers"
import { ROUTINE_ENGINES, ROUTINE_ENGINE_LABELS, type RoutineAgentInput, type RoutineEngine } from "../../schemas"

const ENGINE_OPTIONS = ROUTINE_ENGINES.map((value) => ({ value, label: ROUTINE_ENGINE_LABELS[value] }))
const OPEX_NAMES = { provider: "opex.provider", model: "opex.model", agent: "opex.agent", variant: "opex.variant" }
const OPENCODE_NAMES = { provider: "opencode.provider", model: "opencode.model", agent: "opencode.agent", variant: "opencode.variant" }

/**
 * Motor e modelo: **Opex** (provedores de texto do app, como nos outros agentes) ou **OpenCode no host**
 * (modelos e agentes do serviço OpenCode). A troca vale só para as próximas execuções.
 */
export function RoutineEngineFields({ form, editing }: { form: UseFormReturn<RoutineAgentInput>; editing: boolean }) {
    const engine = useWatch({ control: form.control, name: "engine" })
    const { providers: all } = useAiProviderStatuses()
    const providers = all.filter((item) => (AI_TEXT_PROVIDER_IDS as readonly string[]).includes(item.id))
    return (
        <div className="space-y-4">
            <Field id="routine-engine" label="Motor">
                <Controller
                    control={form.control}
                    name="engine"
                    render={({ field }) => <OptionTabs<RoutineEngine> id="routine-engine" aria-label="Motor" className="w-full" options={ENGINE_OPTIONS} value={field.value} onChange={field.onChange} />}
                />
            </Field>
            {editing && <p className="text-xs text-muted-foreground">Trocar o motor ou o modelo vale só para as próximas execuções; as em andamento seguem com a configuração do disparo.</p>}
            {engine === "opex" ? (
                <ProviderModelCard
                    form={form}
                    providers={providers}
                    names={OPEX_NAMES}
                    hideAgent
                    idPrefix="routine-opex"
                    onProviderChange={(provider) => {
                        form.setValue("opex.provider", provider as AiTextProviderId, { shouldDirty: true, shouldValidate: true })
                        form.setValue("opex.model", "", { shouldDirty: true })
                        form.setValue("opex.variant", null, { shouldDirty: true })
                    }}
                />
            ) : (
                <ProviderModelCard form={form} providers={providers} names={OPENCODE_NAMES} fixedProvider="opencode" idPrefix="routine-opencode" />
            )}
        </div>
    )
}
