"use client"

import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAiModels, useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { CURATOR_PROVIDERS, curatorRunSchema, type CuratorProvider } from "../../../schemas/migration"
import { useMigrationCurator } from "../../../hooks/useMemoryMigration"
import type { MemoryMigrationDto } from "../../../types"
import { OpexAiModelPicker } from "../../shared/OpexAiModelPicker"
import { Section } from "../../shared/Section"
import { BudgetWarnings } from "./BudgetWarnings"
import { CuratorReport } from "./CuratorReport"
import { StepStatus } from "./StepStatus"

/** Etapa 2: o curador classifica cada memória com o provedor e o modelo escolhidos aqui. */
export function CuratorStep({ state }: { state: MemoryMigrationDto }) {
    const statuses = useAiProviderStatuses()
    const [provider, setProvider] = useState<CuratorProvider | null>((state.curator?.provider as CuratorProvider | undefined) ?? null)
    const [model, setModel] = useState<string | null>(state.curator?.model ?? null)
    const models = useAiModels(provider)
    const run = useMigrationCurator()
    const busy = Object.values(state.steps).some((step) => step.status === "running")
    const input = { provider, model, variant: null }
    const valid = curatorRunSchema.safeParse(input).success
    const start = () => {
        const parsed = curatorRunSchema.safeParse(input)
        if (parsed.success) run.mutate(parsed.data)
    }
    return (
        <Section title="2. Triagem pelo curador" info="O curador lê cada lista inteira e decide, por memória: migrar, migrar reescrevendo, descartar ou revisar (dono). Memória escrita pelo dono nunca é descartada automaticamente.">
            {!state.backup ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Gere o backup antes de rodar o curador.</p>
            ) : (
                <>
                    <OpexAiModelPicker
                        id="curator"
                        providers={statuses.providers}
                        allowed={CURATOR_PROVIDERS}
                        provider={provider}
                        modelId={model}
                        models={models}
                        disabled={busy}
                        hint="OpenCode e Jev não aparecem: o curador roda pelos provedores do Opex."
                        emptyText="Nenhum provedor conectado: configure Gemini, Anthropic, OpenAI ou DeepSeek em Integrações › Inteligência Artificial."
                        onProviderChange={(next) => {
                            setProvider(next as CuratorProvider)
                            setModel(null)
                        }}
                        onModelPick={(item) => setModel(item.id)}
                    />
                    <div className="flex justify-end">
                        <Button type="button" disabled={!valid || busy || run.isPending} onClick={start}>
                            {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden />} {state.curator ? "Rodar o curador de novo" : "Rodar o curador"}
                        </Button>
                    </div>
                    <StepStatus step={state.steps.triage} onRetry={start} retrying={run.isPending} />
                    <StepStatus step={state.steps.compact} />
                    {state.report && <CuratorReport report={state.report} />}
                    <BudgetWarnings state={state} />
                </>
            )}
        </Section>
    )
}
