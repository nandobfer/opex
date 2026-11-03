"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { motion } from "framer-motion"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { DetailActions } from "@/features/integrations/components/detail/DetailActions"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { IntegrationTabs } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { AI_TAB_ALIASES, AI_TABS, type AiTab } from "../constants"
import { useAiFeatureRealtime } from "../hooks/useAi"
import { AiProvidersTab } from "./AiProvidersTab"
import { OrcamentistaTab } from "./orcamentista/OrcamentistaTab"
import { CatalogadorTab } from "./catalogador/CatalogadorTab"
import { TaskRefinementTab } from "./task-refinement/TaskRefinementTab"
import { AgenticTab } from "@/features/agentic/components/settings/AgenticTab"
import { PrReviewTab } from "@/features/pr-review/components/PrReviewTab"
import { OpexAgentTab } from "@/features/opex-agent/components/settings/OpexAgentTab"
import { MaddoxAgentTab } from "@/features/maddox-agent/components/settings/MaddoxAgentTab"
import { AdversarialAgentTab } from "@/features/adversarial-agent/components/settings/AdversarialAgentTab"
import { MentorAgentTab } from "@/features/adversarial-agent/components/mentor/MentorAgentTab"
import { ArchitectAgentTab } from "@/features/architect-agent/components/settings/ArchitectAgentTab"
import { AI_EDITOR_TABS } from "../tabs"

interface AiEditorFormProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
}

/**
 * Página "Inteligência Artificial" (`/integracoes/ia`): aba Provedores (OpenCode, Gemini e as opções gerais
 * do hub) e uma aba por agente (catálogo de agentes). Links antigos de abas fundidas ou removidas abrem a
 * aba atual (`AI_TAB_ALIASES`). Trocar de aba com alterações pede descarte.
 */
export function AiEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo }: AiEditorFormProps) {
    useAiFeatureRealtime()
    const [tabDirty, setTabDirty] = useState(false)
    const [resetKey, setResetKey] = useState(0)
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<AiTab>(
        AI_TABS,
        "provedores",
        dirty || tabDirty,
        () => {
            onUndo()
            setTabDirty(false)
            setResetKey((value) => value + 1)
        },
        undefined,
        AI_TAB_ALIASES,
    )

    return (
        <motion.form
            key="form"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex min-w-0 flex-col gap-6"
            onSubmit={(event) => {
                event.preventDefault()
                if (tab === "provedores" && dirty) void onSave()
            }}
        >
            <DetailHeader def={def} data={data} hasAnySecret={false} />
            <IntegrationTabs tabs={AI_EDITOR_TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções de Inteligência Artificial">
                {tab === "provedores" && (
                    <>
                        <AiProvidersTab />
                        <GeneralCard draft={draft} setDraft={setDraft} />
                        <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
                    </>
                )}
                {tab === "orcamentista" && <OrcamentistaTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "catalogador" && <CatalogadorTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "refinar-tarefa" && <TaskRefinementTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "revisao-pr" && <PrReviewTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "desenvolvimento-agentico" && <AgenticTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "agente-maddox" && <MaddoxAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "agente-opex" && <OpexAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "agente-adversario" && <AdversarialAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "agente-mentor" && <MentorAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "agente-arquiteto" && <ArchitectAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
            </IntegrationTabs>
        </motion.form>
    )
}
