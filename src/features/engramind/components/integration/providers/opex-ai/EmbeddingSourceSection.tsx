"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, FlaskConical, Loader2 } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { AiProviderTabs } from "@/features/ai/components/AiProviderTabs"
import { ModelPickerField } from "@/features/ai/components/ModelFields"
import { useAiModels } from "@/features/ai/hooks/useAi"
import type { AiProviderStatusDto } from "@/lib/ai/providers"
import { EMBEDDING_REMOTE_PROVIDERS, type EmbeddingRemoteProvider, type EmbeddingSourceProvider } from "../../../../ai-source"
import { AI_SOURCE_HELP, EMBEDDING_EXTRA_HELP, EMBEDDING_EXTRA_LABELS } from "../../../../help/ai-source"
import { useLocalEmbeddingModels } from "../../../../hooks/useOpexAiSource"
import { embeddingSourceSchema, type EmbeddingSourceInput } from "../../../../schemas/ai-source"
import type { AiSourceSectionDto, LocalModelStatus } from "../../../../types"
import { isLocalModelBusy, LocalModelStatusLine } from "../../../shared/LocalModelStatusLine"
import { InfoField } from "../../../shared/InfoField"
import { SourceStatus } from "./SourceStatus"
import { TestResult } from "./TestResult"
import { useSourceActions } from "./useSourceActions"

type EmbeddingValues = z.output<typeof embeddingSourceSchema>

const isRemote = (provider: string | null): provider is EmbeddingRemoteProvider => provider !== null && (EMBEDDING_REMOTE_PROVIDERS as readonly string[]).includes(provider)

export function embeddingDefaults(state: AiSourceSectionDto): EmbeddingSourceInput {
    const provider = (state.provider ?? state.currentOpexProvider) as EmbeddingSourceProvider | null
    const model = state.provider ? state.model : state.currentOpexProvider ? state.current.model : null
    return { provider: provider ?? (undefined as unknown as EmbeddingSourceProvider), model, dimensions: state.provider ? state.dimensions : null }
}

/** Embedding: Local, Gemini, OpenAI ou Desligado; modelo da lista do provedor; confirma a reindexação. */
export function EmbeddingSourceSection({ state, providers, reindexing, localModel = null, disabled }: { state: AiSourceSectionDto; providers: AiProviderStatusDto[]; reindexing: boolean; localModel?: LocalModelStatus | null; disabled?: boolean }) {
    const form = useForm<EmbeddingSourceInput, unknown, EmbeddingValues>({ resolver: zodResolver(embeddingSourceSchema), mode: "onChange", defaultValues: embeddingDefaults(state) })
    const provider = (useWatch({ control: form.control, name: "provider" }) ?? null) as EmbeddingSourceProvider | null
    const modelId = useWatch({ control: form.control, name: "model" }) ?? null
    const dimensions = useWatch({ control: form.control, name: "dimensions" }) ?? null
    const remote = useAiModels(isRemote(provider) ? provider : null, true, "embedding")
    const local = useLocalEmbeddingModels(provider === "local")
    const models = provider === "local" ? local : remote
    const actions = useSourceActions("embedding")
    const [confirm, setConfirm] = useState<EmbeddingValues | null>(null)
    const errors = form.formState.errors
    // Lido sempre (fora de curto-circuito): o react-hook-form só acompanha `isValid` se ele for lido em toda renderização.
    const isValid = form.formState.isValid
    const blocked = disabled || reindexing
    // Download/carga do modelo local: testar e aplicar no Local respondem 409 até terminar.
    const localBusy = provider === "local" && isLocalModelBusy(localModel)

    const apply = async (values: EmbeddingValues) => {
        if (await actions.runApply(values)) form.reset(values)
        setConfirm(null)
    }

    return (
        <div className="space-y-4" data-testid="embedding-source">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">Embedding</h3>
                <SourceStatus state={state} onResend={actions.resend} resending={actions.resending} />
            </div>
            <InfoField id="embedding-source-provider" label="Provedor" info={AI_SOURCE_HELP.embeddingProvider} error={errors.provider?.message}>
                <AiProviderTabs
                    id="embedding-source-provider"
                    providers={providers}
                    allowed={EMBEDDING_REMOTE_PROVIDERS}
                    extraOptions={[
                        { value: "local", label: EMBEDDING_EXTRA_LABELS.local, tooltip: EMBEDDING_EXTRA_HELP.local, position: "start" },
                        { value: "off", label: EMBEDDING_EXTRA_LABELS.off, tooltip: EMBEDDING_EXTRA_HELP.off, position: "end" },
                    ]}
                    value={provider}
                    disabled={blocked}
                    onChange={(next) => {
                        if (next === provider) return
                        form.setValue("provider", next as EmbeddingSourceProvider, { shouldDirty: true, shouldValidate: true })
                        form.setValue("model", null, { shouldDirty: true, shouldValidate: true })
                        form.setValue("dimensions", null, { shouldDirty: true, shouldValidate: true })
                        actions.clearOutcome()
                    }}
                />
            </InfoField>
            <AnimatePresence initial={false}>
                {provider && provider !== "off" && (
                    <motion.div key={`model-${provider === "local" ? "local" : "remote"}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-4 overflow-hidden">
                        <ModelPickerField id="embedding-source-model" models={models} modelId={modelId} error={errors.model?.message} disabled={blocked} placeholder="Escolha o modelo de embedding" onPick={(item) => form.setValue("model", item.id, { shouldDirty: true, shouldValidate: true })} />
                        {isRemote(provider) && (
                            <InfoField id="embedding-source-dimensions" label="Dimensão (opcional)" info={AI_SOURCE_HELP.dimensions} error={errors.dimensions?.message}>
                                <Input
                                    id="embedding-source-dimensions"
                                    type="number"
                                    min={1}
                                    max={8192}
                                    step={1}
                                    placeholder="A do modelo"
                                    disabled={blocked}
                                    value={dimensions ?? ""}
                                    onChange={(event) => form.setValue("dimensions", event.target.value.trim() === "" ? null : Number(event.target.value), { shouldDirty: true, shouldValidate: true })}
                                />
                            </InfoField>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
            {provider === "local" && localModel && <LocalModelStatusLine status={localModel} />}
            {reindexing && <p className="text-xs text-warning">A reindexação está em andamento: aguarde terminar para trocar o embedding.</p>}
            <TestResult outcome={actions.outcome} />
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" title={AI_SOURCE_HELP.test} disabled={blocked || localBusy || provider === "off" || !isValid || actions.testing} onClick={() => void form.handleSubmit((values) => actions.runTest(values))()}>
                    {actions.testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <FlaskConical className="mr-2 h-4 w-4" aria-hidden />} Testar com esta chave
                </Button>
                <Button type="button" title={reindexing ? "Aguarde a reindexação terminar" : localBusy ? "Aguarde o modelo local terminar de baixar/carregar" : undefined} disabled={blocked || localBusy || !isValid || actions.applying} onClick={() => void form.handleSubmit((values) => setConfirm(values))()}>
                    <Check className="mr-2 h-4 w-4" aria-hidden /> Aplicar no embedding
                </Button>
            </div>
            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
                title="Trocar o embedding?"
                description="O Engramind valida o provedor na mesma requisição (com ele fora do ar, nada é gravado) e reindexa todas as memórias. Enquanto isso, a busca por sentido usa os vetores antigos."
                confirmLabel="Aplicar e reindexar"
                pending={actions.applying}
                onConfirm={() => confirm && void apply(confirm)}
            />
        </div>
    )
}
