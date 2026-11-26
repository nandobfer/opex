"use client"

import { useId, useMemo, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { findMissingConditionalField, getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import { buildIntegrationUpdateSchema } from "../../schemas/integration.schema"
import { integrationErrorMessage, useUpdateIntegration } from "../../hooks/useIntegrations"
import { useScrollViewportHeight } from "../../hooks/useScrollViewportHeight"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import type { IntegrationDetailDto } from "../../types"
import { buildIntegrationPatch, draftFrom, type Draft } from "./draft"
import { GithubEditorForm } from "@/features/github/components/GithubEditorForm"
import { AiEditorForm } from "@/features/ai/components/AiEditorForm"
import { OrcamentosEditorForm } from "@/features/orcamentos/components/OrcamentosEditorForm"
import { aiProviderOfIntegration } from "@/lib/ai/providers"
import { AiProviderEditorForm } from "@/features/ai/components/AiProviderEditorForm"
import { BuilderMachineEditorForm } from "@/features/local-docker/components/BuilderMachineEditorForm"
import { EngramindEditorForm } from "@/features/engramind/components/integration/EngramindEditorForm"
import { EvolutionEditorForm } from "@/features/evolution-api/components/EvolutionEditorForm"
import { CronsEditorForm } from "./CronsEditorForm"
import { EditorForm } from "./EditorForm"
import { ExplorerPane } from "./ExplorerPane"
import { IntegrationDebugDialog } from "../IntegrationDebugDialog"
import { DEBUG_DIALOG_MEDIA_QUERY, IntegrationDebugToggleProvider } from "./debug-toggle-context"
import { LogsPanel } from "./LogsPanel"
import { useLogsMaximized } from "./useLogsMaximized"

export function IntegrationEditor({ id, data }: { id: IntegrationId; data: IntegrationDetailDto }) {
    const def = getIntegrationDef(id)
    const mutation = useUpdateIntegration(id)
    const [draft, setDraft] = useState<Draft>(() => draftFrom(data))
    // Explorador substitui o formulário na coluna da esquerda (o debug segue à direita).
    const [exploring, setExploring] = useState(false)
    const gridRef = useRef<HTMLDivElement>(null)
    // Logs do modo debug abertos pelo botão do título: começam fechados e abrir/fechar não grava nada.
    const [debugOpen, setDebugOpen] = useState(false)
    const [openFor, setOpenFor] = useState(id)
    // Ajustes durante o render (sem efeito): outra integração ou debug desligado fecham os logs.
    if (openFor !== id) {
        setOpenFor(id)
        setDebugOpen(false)
    }
    if (!data.debugMode && debugOpen) setDebugOpen(false)
    // Tela estreita: os logs abrem na janela; a coluna ao lado do formulário só existe a partir de `xl`.
    const narrow = useMediaQuery(DEBUG_DIALOG_MEDIA_QUERY)
    const columnOpen = debugOpen && !narrow
    const panelId = useId()
    // Debug ocupa exatamente a área visível do <main> rolável: a última linha sempre aparece.
    const debugHeight = useScrollViewportHeight(gridRef, columnOpen)
    const { logsCardRef, logsMaximized, setLogsMaximized } = useLogsMaximized(columnOpen)
    const debugToggle = useMemo(
        () => ({ available: data.debugMode, open: debugOpen, toggle: () => setDebugOpen((open) => !open), panelId }),
        [data.debugMode, debugOpen, panelId],
    )

    const patch = useMemo(() => buildIntegrationPatch(def.publicFields, data, draft), [data, def.publicFields, draft])
    const dirty = Object.keys(patch).length > 0

    /** Salva o rascunho; `true` se salvou. */
    const save = async (): Promise<boolean> => {
        const parsed = buildIntegrationUpdateSchema(def).safeParse(patch)
        if (!parsed.success) {
            toast.error(parsed.error.issues[0]?.message ?? "Revise os campos destacados")
            return false
        }
        // Mesma regra do servidor: o modo escolhido exige o próprio campo obrigatório.
        const missing = findMissingConditionalField(def.publicFields, draft.publicValues, Object.keys(patch.publicValues ?? {}))
        if (missing) {
            toast.error(`${missing.label}: preenchimento obrigatório`)
            return false
        }
        try {
            const saved = await mutation.mutateAsync(patch)
            setDraft(draftFrom(saved))
            toast.success(`${def.name} salva`)
            return true
        } catch (error) {
            toast.error(integrationErrorMessage(error, "Não foi possível salvar a integração"))
            return false
        }
    }

    return (
        <IntegrationDebugToggleProvider value={debugToggle}>
            {/* Sem `layout` aqui de propósito: a projeção de layout do framer-motion dentro do
                <motion.main> que anima a troca de rota (e rola) media errado quando o editor montava
                no meio da entrada, deixando a tela em branco de vez em quando. */}
            <div
                ref={gridRef}
                className={cn(
                    "grid items-start gap-6",
                    columnOpen && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
                )}
            >
                <AnimatePresence mode="wait" initial={false}>
                    {exploring && data.swaggerUrl ? (
                        <ExplorerPane
                            key="explorer"
                            id={id}
                            integrationName={def.name}
                            swaggerUrl={data.swaggerUrl}
                            onBack={() => setExploring(false)}
                        />
                    ) : id === "ai" ? (
                        <AiEditorForm
                            key="form"
                            def={def}
                            data={data}
                            draft={draft}
                            setDraft={setDraft}
                            dirty={dirty}
                            pending={mutation.isPending}
                            onSave={save}
                            onUndo={() => setDraft(draftFrom(data))}
                        />
                    ) : id === "github" ? (
                        <GithubEditorForm
                            key="form"
                            def={def}
                            data={data}
                            draft={draft}
                            setDraft={setDraft}
                            dirty={dirty}
                            pending={mutation.isPending}
                            onSave={save}
                            onUndo={() => setDraft(draftFrom(data))}
                            onExplore={() => setExploring(true)}
                        />
                    ) : id === "orcamentos" ? (
                        <OrcamentosEditorForm key="form" def={def} data={data} />
                    ) : aiProviderOfIntegration(id) ? (
                        <AiProviderEditorForm
                            key="form"
                            def={def}
                            data={data}
                            draft={draft}
                            setDraft={setDraft}
                            dirty={dirty}
                            pending={mutation.isPending}
                            onSave={save}
                            onUndo={() => setDraft(draftFrom(data))}
                        />
                    ) : id === "crons" ? (
                        <CronsEditorForm
                            key="form"
                            def={def}
                            data={data}
                            draft={draft}
                            setDraft={setDraft}
                            dirty={dirty}
                            pending={mutation.isPending}
                            onSave={save}
                            onUndo={() => setDraft(draftFrom(data))}
                            onExplore={() => setExploring(true)}
                        />
                    ) : id === "engramind" ? (
                        <EngramindEditorForm
                            key="form"
                            def={def}
                            data={data}
                            draft={draft}
                            setDraft={setDraft}
                            dirty={dirty}
                            pending={mutation.isPending}
                            onSave={save}
                            onUndo={() => setDraft(draftFrom(data))}
                            onExplore={() => setExploring(true)}
                        />
                    ) : id === "evolution-api" ? (
                        <EvolutionEditorForm key="form" def={def} data={data} draft={draft} setDraft={setDraft} dirty={dirty} pending={mutation.isPending} onSave={save} onUndo={() => setDraft(draftFrom(data))} />
                    ) : id === "builder_machine" ? (
                        // Builder Machine: ponto de montagem — ver aicontext/modules/builder-machine.md.
                        <BuilderMachineEditorForm
                            key="form"
                            def={def}
                            data={data}
                            draft={draft}
                            setDraft={setDraft}
                            dirty={dirty}
                            pending={mutation.isPending}
                            onSave={save}
                            onUndo={() => setDraft(draftFrom(data))}
                        />
                    ) : (
                        <EditorForm
                            key="form"
                            def={def}
                            data={data}
                            draft={draft}
                            setDraft={setDraft}
                            dirty={dirty}
                            pending={mutation.isPending}
                            onSave={save}
                            onUndo={() => setDraft(draftFrom(data))}
                            onExplore={() => setExploring(true)}
                        />
                    )}
                </AnimatePresence>

                <LogsPanel
                    id={id}
                    visible={columnOpen}
                    debugHeight={debugHeight}
                    logsCardRef={logsCardRef}
                    maximized={logsMaximized}
                    onMaximizedChange={setLogsMaximized}
                    onClose={() => setDebugOpen(false)}
                    panelId={panelId}
                />
            </div>
            {/* Tela estreita: os logs abrem na mesma janela da lista de integrações. */}
            <IntegrationDebugDialog
                integrationId={debugOpen && narrow ? id : null}
                onOpenChange={(open) => !open && setDebugOpen(false)}
            />
        </IntegrationDebugToggleProvider>
    )
}
