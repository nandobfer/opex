"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { motion } from "framer-motion"
import { FolderGit2, RefreshCcw, Settings2, Shuffle, Users } from "lucide-react"
import type { IntegrationDef, PublicFieldValue } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { ApiDocsCard } from "@/features/integrations/components/detail/ApiDocsCard"
import { DetailActions } from "@/features/integrations/components/detail/DetailActions"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { PublicFieldsCard } from "@/features/integrations/components/detail/PublicFieldsCard"
import { SecretFieldsCard } from "@/features/integrations/components/detail/SecretFieldsCard"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { GITHUB_TABS, type GithubTab } from "../constants"
import { useGithubLinks, useGithubPeople, useGithubRealtime } from "../hooks/useGithub"
import { GithubLinksTab } from "./links/GithubLinksTab"
import { GithubMappingTab } from "./mapping/GithubMappingTab"
import { GithubPeopleTab } from "./people/GithubPeopleTab"
import { GithubSyncTab } from "./sync/GithubSyncTab"

interface GithubEditorFormProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
    onExplore: () => void
}

/**
 * Página da integração GitHub em abas: Geral (token e opções), Vínculos (repositório ↔ produto),
 * Mapeamento (tipo/prioridade), Pessoas (login → desenvolvedor) e Sincronização. Trocar de aba com
 * alterações pede descarte.
 */
export function GithubEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo, onExplore }: GithubEditorFormProps) {
    useGithubRealtime()
    const [tabDirty, setTabDirty] = useState(false)
    const [resetKey, setResetKey] = useState(0)
    const configured = data.secrets.token?.configured === true
    const links = useGithubLinks()
    const people = useGithubPeople()
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<GithubTab>(GITHUB_TABS, "geral", dirty || tabDirty, () => {
        onUndo()
        setTabDirty(false)
        setResetKey((value) => value + 1)
    })

    const tabs: IntegrationTabDef<GithubTab>[] = [
        { id: "geral", label: "Geral", icon: Settings2 },
        { id: "vinculos", label: "Vínculos", icon: FolderGit2, badge: links.data?.length ?? null },
        { id: "mapeamento", label: "Mapeamento", icon: Shuffle },
        { id: "pessoas", label: "Pessoas", icon: Users, badge: people.data?.filter((person) => !person.developerId).length || null },
        { id: "sincronizacao", label: "Sincronização", icon: RefreshCcw },
    ]
    const setPublic = (key: string, value: PublicFieldValue | "") => setDraft((prev) => ({ ...prev, publicValues: { ...prev.publicValues, [key]: value } }))
    const secretFields = def.secretFields.filter((field) => !field.group)
    const regularFields = def.publicFields.filter((field) => field.kind !== "cron-jobs" && !field.group)

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
                if (tab === "geral" && dirty) void onSave()
            }}
        >
            <DetailHeader def={def} data={data} hasAnySecret={def.secretFields.length > 0} />
            <IntegrationTabs tabs={tabs} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções da integração GitHub">
                {tab === "geral" && (
                    <>
                        <GeneralCard draft={draft} setDraft={setDraft} />
                        {secretFields.length > 0 && <SecretFieldsCard fields={secretFields} data={data} draft={draft} setDraft={setDraft} />}
                        {regularFields.length > 0 && <PublicFieldsCard fields={regularFields} data={data} publicValues={draft.publicValues} setPublic={setPublic} />}
                        <ApiDocsCard data={data} draft={draft} setDraft={setDraft} dirty={dirty} onExplore={onExplore} />
                        <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
                    </>
                )}
                {tab === "vinculos" && <GithubLinksTab configured={configured} />}
                {tab === "mapeamento" && <GithubMappingTab key={resetKey} configured={configured} onDirtyChange={setTabDirty} />}
                {tab === "pessoas" && <GithubPeopleTab configured={configured} />}
                {tab === "sincronizacao" && <GithubSyncTab configured={configured} />}
            </IntegrationTabs>
        </motion.form>
    )
}
