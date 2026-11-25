"use client"

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import { motion } from "framer-motion"
import { Settings2, Smartphone, Webhook, MessagesSquare, Terminal } from "lucide-react"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { DetailActions } from "@/features/integrations/components/detail/DetailActions"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import { PublicFieldsCard } from "@/features/integrations/components/detail/PublicFieldsCard"
import { SecretFieldsCard } from "@/features/integrations/components/detail/SecretFieldsCard"
import { buildIntegrationPatch, draftFrom, type Draft } from "@/features/integrations/components/detail/draft"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { IntegrationDebugConsole } from "@/features/integrations/components/IntegrationDebugConsole"
import { EVOLUTION_TABS, type EvolutionTab } from "../constants"
import { PREFILL, useEvolution, useEvolutionAction, useEvolutionRealtime } from "../hooks/useEvolution"
import type { EvolutionPrefillDto } from "../prefill"
import { InstanceTab } from "./InstanceTab"
import { OperationsTab, WebhookTab } from "./OperationsTabs"

export const evolutionTabs: IntegrationTabDef<EvolutionTab>[] = [
    { id: "geral", label: "Geral", icon: Settings2 },
    { id: "instancia", label: "Instância", icon: Smartphone },
    { id: "webhook", label: "Webhook", icon: Webhook },
    { id: "operacoes", label: "Operações", icon: MessagesSquare },
    { id: "debug", label: "Debug", icon: Terminal },
]

interface Props {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
}

export function EvolutionEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo }: Props) {
    useEvolutionRealtime()
    const tabs = useIntegrationTab(EVOLUTION_TABS, "geral", dirty, onUndo)
    const prefill = useEvolution<EvolutionPrefillDto>(PREFILL, !data.stored)
    const initialized = useRef(false)
    const importKey = useEvolutionAction<IntegrationDetailDto>(PREFILL, "post", "Evolution API salva")
    useEffect(() => {
        if (initialized.current || !prefill.data || data.stored || dirty) return
        const { internalUrl, publicUrl, version } = prefill.data
        initialized.current = true
        setDraft((prev) => ({ ...prev, publicValues: { ...prev.publicValues, internalUrl, publicUrl: publicUrl ?? "", version: version ?? "" } }))
    }, [prefill.data, data.stored, dirty, setDraft])
    const useEnvironmentKey = !data.stored && prefill.data?.keyAvailable && !draft.secrets.apiKey
    const save = async () => {
        if (!useEnvironmentKey) { await onSave(); return }
        importKey.mutate(buildIntegrationPatch(def.publicFields, data, draft), { onSuccess: (saved) => setDraft(draftFrom(saved)) })
    }
    const instance = typeof data.publicValues.defaultInstance === "string" ? data.publicValues.defaultInstance : ""
    return <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="flex min-w-0 flex-col gap-6">
        <DetailHeader def={def} data={data} hasAnySecret={data.secrets.apiKey?.configured === true} />
        <IntegrationTabs tabs={evolutionTabs} active={tabs.tab} onSelect={tabs.requestTab} pendingTab={tabs.pendingTab} onConfirmDiscard={tabs.confirmDiscard} onCancelDiscard={tabs.cancelDiscard} label="Seções da Evolution API">
            {tabs.tab === "geral" && <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); void save() }}>
                <GeneralCard draft={draft} setDraft={setDraft} />
                <PublicFieldsCard fields={def.publicFields.filter((field) => !field.group && field.key !== "version")} data={data} publicValues={draft.publicValues} setPublic={(key, value) => setDraft((prev) => ({ ...prev, publicValues: { ...prev.publicValues, [key]: value } }))} />
                <SecretFieldsCard fields={def.secretFields.filter((field) => !field.group)} data={data} draft={draft} setDraft={setDraft} />
                {useEnvironmentKey && <p className="text-sm text-muted-foreground">Chave disponível no ambiente. Será usada ao salvar.</p>}
                {prefill.isError && <p role="alert">Não foi possível consultar o ambiente. Preencha os campos manualmente.</p>}
                {draft.publicValues.version && <p className="text-sm text-muted-foreground">Versão do ambiente: {String(draft.publicValues.version)}</p>}
                <DetailActions dirty={dirty || Boolean(useEnvironmentKey)} pending={pending || importKey.isPending} onUndo={onUndo} />
            </form>}
            {tabs.tab === "instancia" && <InstanceTab />}
            {tabs.tab === "webhook" && <WebhookTab />}
            {tabs.tab === "operacoes" && <OperationsTab instance={instance} />}
            {tabs.tab === "debug" && (data.debugMode ? <IntegrationDebugConsole integrationId="evolution-api" title="Debug da Evolution API" /> : <p className="text-sm text-muted-foreground">Ative o modo debug na aba Geral para acompanhar as chamadas.</p>)}
        </IntegrationTabs>
    </motion.div>
}
