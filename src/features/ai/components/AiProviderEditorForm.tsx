"use client"

import type { Dispatch, SetStateAction } from "react"
import { motion } from "framer-motion"
import { BarChart3, Bot, Cpu, Gauge, KeyRound, Puzzle, ServerCog, Settings2, Sparkles, SquareSlash } from "lucide-react"
import type { IntegrationDef, PublicFieldValue } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { aiProviderOfIntegration } from "@/lib/ai/providers"
import { DetailActions } from "@/features/integrations/components/detail/DetailActions"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { PublicFieldsCard } from "@/features/integrations/components/detail/PublicFieldsCard"
import { SecretFieldsCard } from "@/features/integrations/components/detail/SecretFieldsCard"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { OpencodeAccountsCard } from "@/features/opencode-accounts/components/OpencodeAccountsCard"
import { OpencodeResourceTab } from "@/features/opencode-resources/components/OpencodeResourceTab"
import { OpencodeControlsTab } from "@/features/opencode-service/components/OpencodeControlsTab"
import { AI_PROVIDER_TAB_IDS, type AiProviderTab } from "../constants"
import { AiModelsCard } from "./AiModelsCard"
import { JevUsageCard } from "./JevUsageCard"
import { OpencodeUsageCard } from "./OpencodeUsageCard"

interface AiProviderEditorFormProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
}

const TAB_DEFS: Record<AiProviderTab, IntegrationTabDef<AiProviderTab>> = {
    configuracao: { id: "configuracao", label: "Configuração", icon: Settings2 },
    modelos: { id: "modelos", label: "Modelos", icon: Cpu },
    contas: { id: "contas", label: "Contas", icon: KeyRound },
    controles: { id: "controles", label: "Controles", icon: Gauge },
    skills: { id: "skills", label: "Skills", icon: Sparkles },
    agentes: { id: "agentes", label: "Agentes", icon: Bot },
    comandos: { id: "comandos", label: "Comandos", icon: SquareSlash },
    plugins: { id: "plugins", label: "Plugins", icon: Puzzle },
    mcps: { id: "mcps", label: "MCPs", icon: ServerCog },
    consumo: { id: "consumo", label: "Consumo", icon: BarChart3 },
}

/**
 * Página de um provedor de IA em abas: Configuração (campos e ações), Modelos (lista do provedor),
 * Contas (só OpenCode: contas dos providers do servidor), Controles e os recursos Skills, Agentes,
 * Comandos, Plugins e MCPs (só OpenCode) e Consumo (uso medido). O Gemini não tem a aba Consumo. Trocar de aba com alterações pede descarte.
 */
export function AiProviderEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo }: AiProviderEditorFormProps) {
    const provider = aiProviderOfIntegration(def.id)
    const allowed: readonly AiProviderTab[] = provider ? AI_PROVIDER_TAB_IDS[provider.id] : ["configuracao"]
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<AiProviderTab>(allowed, "configuracao", dirty, onUndo)

    const setPublic = (key: string, value: PublicFieldValue | "") =>
        setDraft((prev) => ({ ...prev, publicValues: { ...prev.publicValues, [key]: value } }))

    const secretFields = def.secretFields.filter((field) => !field.group)
    const regularFields = def.publicFields.filter((field) => !field.group)
    const tabs = allowed.map((id) => TAB_DEFS[id])

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
                if (tab === "configuracao" && dirty) void onSave()
            }}
        >
            <DetailHeader def={def} data={data} hasAnySecret={def.secretFields.length > 0} />
            <IntegrationTabs tabs={tabs} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções do provedor de IA">
                {tab === "configuracao" && (
                    <>
                        <GeneralCard draft={draft} setDraft={setDraft} />
                        {secretFields.length > 0 && <SecretFieldsCard fields={secretFields} data={data} draft={draft} setDraft={setDraft} />}
                        {regularFields.length > 0 && <PublicFieldsCard fields={regularFields} data={data} publicValues={draft.publicValues} setPublic={setPublic} />}
                        <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
                    </>
                )}
                {tab === "modelos" && provider && <AiModelsCard provider={provider.id} dirty={dirty} />}
                {tab === "contas" && provider?.id === "opencode" && <OpencodeAccountsCard dirty={dirty} />}
                {tab === "controles" && provider?.id === "opencode" && <OpencodeControlsTab dirty={dirty} />}
                {tab === "skills" && provider?.id === "opencode" && <OpencodeResourceTab key="skill" kind="skill" dirty={dirty} />}
                {tab === "agentes" && provider?.id === "opencode" && <OpencodeResourceTab key="agent" kind="agent" dirty={dirty} />}
                {tab === "comandos" && provider?.id === "opencode" && <OpencodeResourceTab key="command" kind="command" dirty={dirty} />}
                {tab === "plugins" && provider?.id === "opencode" && <OpencodeResourceTab key="plugin" kind="plugin" dirty={dirty} />}
                {tab === "mcps" && provider?.id === "opencode" && <OpencodeResourceTab key="mcp" kind="mcp" dirty={dirty} />}
                {tab === "consumo" && provider?.id === "jev" && <JevUsageCard />}
                {tab === "consumo" && provider?.id === "opencode" && <OpencodeUsageCard />}
            </IntegrationTabs>
        </motion.form>
    )
}
