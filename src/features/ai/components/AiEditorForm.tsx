"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { motion } from "framer-motion"
import { BrainCircuit, Bot, CodeXml, AlignLeft, Sparkles, Calculator, Timer, Tag, Wand2, GitPullRequest, Swords, Orbit } from "lucide-react"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { DetailActions } from "@/features/integrations/components/detail/DetailActions"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { AI_TABS, type AiTab } from "../constants"
import { useAiFeatureRealtime } from "../hooks/useAi"
import { AiProvidersTab } from "./AiProvidersTab"
import { UnderstandTaskTab } from "./understand-task/UnderstandTaskTab"
import { TaskSummaryTab } from "./task-summary/TaskSummaryTab"
import { TaskTagsTab } from "./task-tags/TaskTagsTab"
import { BudgetPreviewTab } from "./budget-preview/BudgetPreviewTab"
import { EstimateHoursTab } from "./estimate-hours/EstimateHoursTab"
import { TaskRefinementTab } from "./task-refinement/TaskRefinementTab"
import { AgenticTab } from "@/features/agentic/components/settings/AgenticTab"
import { PrReviewTab } from "@/features/pr-review/components/PrReviewTab"
import { OpexAgentTab } from "@/features/opex-agent/components/settings/OpexAgentTab"
import { MaddoxAgentTab } from "@/features/maddox-agent/components/settings/MaddoxAgentTab"
import { AdversarialAgentTab } from "@/features/adversarial-agent/components/settings/AdversarialAgentTab"
import { MENTOR_AI_TAB_DEF, MentorAgentTab } from "@/features/adversarial-agent/components/mentor/MentorAgentTab"

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

const TABS: IntegrationTabDef<AiTab>[] = [
    { id: "provedores", label: "Provedores", icon: BrainCircuit },
    { id: "entender-tarefas", label: "Entender tarefas", icon: Sparkles },
    { id: "resumos-tarefas", label: "Resumos de tarefas", icon: AlignLeft },
    { id: "tags-tarefas", label: "Tags de tarefas", icon: Tag },
    { id: "orcamentos", label: "Orçamentos", icon: Calculator },
    { id: "estimar-prazos", label: "Estimar prazos", icon: Timer },
    { id: "refinar-tarefa", label: "Agente Refinador", icon: Wand2 },
    { id: "revisao-pr", label: "Agente Revisor", icon: GitPullRequest },
    { id: "desenvolvimento-agentico", label: "Agente Desenvolvedor", icon: CodeXml },
    { id: "agente-maddox", label: "Agente Maddox", icon: Orbit },
    { id: "agente-opex", label: "Agente Opex", icon: Bot },
    { id: "agente-adversario", label: "Agente Adversário", icon: Swords },
    MENTOR_AI_TAB_DEF,
]

/**
 * Página "Inteligência Artificial" (`/integracoes/ia`): aba Provedores (OpenCode, Gemini e as opções gerais
 * do hub) e uma aba por feature que usa IA. Trocar de aba com alterações pede descarte.
 */
export function AiEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo }: AiEditorFormProps) {
    useAiFeatureRealtime()
    const [tabDirty, setTabDirty] = useState(false)
    const [resetKey, setResetKey] = useState(0)
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<AiTab>(AI_TABS, "provedores", dirty || tabDirty, () => {
        onUndo()
        setTabDirty(false)
        setResetKey((value) => value + 1)
    })

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
            <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções de Inteligência Artificial">
                {tab === "provedores" && (
                    <>
                        <AiProvidersTab />
                        <GeneralCard draft={draft} setDraft={setDraft} />
                        <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
                    </>
                )}
                {tab === "entender-tarefas" && <UnderstandTaskTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "resumos-tarefas" && <TaskSummaryTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "tags-tarefas" && <TaskTagsTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "orcamentos" && <BudgetPreviewTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "estimar-prazos" && <EstimateHoursTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "refinar-tarefa" && <TaskRefinementTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "revisao-pr" && <PrReviewTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "desenvolvimento-agentico" && <AgenticTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "agente-maddox" && <MaddoxAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "agente-opex" && <OpexAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "agente-adversario" && <AdversarialAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "agente-mentor" && <MentorAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
            </IntegrationTabs>
        </motion.form>
    )
}
