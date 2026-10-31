"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { motion } from "framer-motion"
import { Activity, BookOpen, Cable, FileCog, KeyRound, SlidersHorizontal, Users } from "lucide-react"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { ENGRAMIND_TABS, type EngramindTab } from "../../constants"
import { useEngramindRealtime } from "../../hooks/useEngramind"
import { AboutTab } from "./AboutTab"
import { ConnectionTab } from "./ConnectionTab"
import { EnvTab } from "./env/EnvTab"
import { IdentitiesTab } from "./identities/IdentitiesTab"
import { OperationTab } from "./operation/OperationTab"
import { ProvidersTab } from "./providers/ProvidersTab"
import { SettingsTab } from "./settings/SettingsTab"

interface EngramindEditorFormProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
}

const TABS: IntegrationTabDef<EngramindTab>[] = [
    { id: "sobre", label: "Sobre", icon: BookOpen },
    { id: "conexao", label: "Conexão", icon: Cable },
    { id: "configuracoes", label: "Configurações", icon: SlidersHorizontal },
    { id: "provedores", label: "Provedores", icon: KeyRound },
    { id: "identidades", label: "Identidades", icon: Users },
    { id: "operacao", label: "Operação", icon: Activity },
    { id: "variaveis", label: "Variáveis de ambiente", icon: FileCog },
]

/**
 * Página da integração Engramind em abas (`?aba=`): Sobre, Conexão, Configurações, Provedores,
 * Identidades, Operação e Variáveis de ambiente. Trocar de aba com alterações pede descarte.
 */
export function EngramindEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo }: EngramindEditorFormProps) {
    useEngramindRealtime()
    const [tabDirty, setTabDirty] = useState(false)
    const [resetKey, setResetKey] = useState(0)
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<EngramindTab>(ENGRAMIND_TABS, "conexao", dirty || tabDirty, () => {
        onUndo()
        setTabDirty(false)
        setResetKey((value) => value + 1)
    })
    const goToConnection = () => requestTab("conexao")
    const tabProps = { onDirtyChange: setTabDirty, onConfigure: goToConnection }

    return (
        <motion.div key="form" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22, ease: "easeOut" }} className="flex min-w-0 flex-col gap-6">
            <DetailHeader def={def} data={data} hasAnySecret={def.secretFields.length > 0} />
            <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções da integração Engramind">
                {tab === "sobre" && <AboutTab />}
                {tab === "conexao" && <ConnectionTab key={resetKey} {...tabProps} draft={draft} setDraft={setDraft} dirty={dirty} pending={pending} onSave={onSave} onUndo={onUndo} />}
                {tab === "configuracoes" && <SettingsTab key={resetKey} {...tabProps} />}
                {tab === "provedores" && <ProvidersTab key={resetKey} {...tabProps} />}
                {tab === "identidades" && <IdentitiesTab key={resetKey} {...tabProps} />}
                {tab === "operacao" && <OperationTab key={resetKey} {...tabProps} />}
                {tab === "variaveis" && <EnvTab key={resetKey} {...tabProps} />}
            </IntegrationTabs>
        </motion.div>
    )
}

/** Props comuns das abas. */
export interface EngramindTabProps {
    onDirtyChange: (dirty: boolean) => void
    onConfigure: () => void
}
