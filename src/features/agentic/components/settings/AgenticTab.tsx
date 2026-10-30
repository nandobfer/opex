"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Bot, Brain, FolderGit2, SlidersHorizontal } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { useAgenticRealtime, useAgenticSettings, useSaveAgenticSettings } from "../../hooks/useAgentic"
import { agenticSettingsSchema, DEFAULT_AGENTIC_SETTINGS, type AgenticSettings } from "../../schemas"
import { DeveloperMemoriesSection } from "../DeveloperMemoriesSection"
import { AgentsSettingsSection } from "./AgentsSettingsSection"
import { CentralsCard } from "./CentralsCard"
import { DefaultSettingsSection } from "./DefaultSettingsSection"
import { SettingsActions } from "./SettingsActions"

/** Abas internas da configuração: padrões globais e agentes (com salvar), memórias globais (salvam sozinhas) e a lista de centrais. */
type SettingsTab = "padrao" | "agentes" | "memorias" | "centrais"
const SETTINGS_TABS: readonly SettingsTab[] = ["padrao", "agentes", "memorias", "centrais"]
const TABS: readonly IntegrationTabDef<SettingsTab>[] = [
    { id: "padrao", label: "Configurações Padrão", icon: SlidersHorizontal },
    { id: "agentes", label: "Agentes", icon: Bot },
    { id: "memorias", label: "Memórias", icon: Brain },
    { id: "centrais", label: "Centrais de desenvolvimento", icon: FolderGit2 },
]

/**
 * Aba "Desenvolvimento agêntico" (Provedores de IA): padrões globais (chat durante a execução, fila,
 * movimentação das colunas, correção de CI e portas da prévia, que as centrais herdam ou
 * personalizam), liga a feature e define os agentes padrão de cada etapa, as memórias globais do
 * agente desenvolvedor e lista as centrais (uma por projeto). Só usa o OpenCode.
 */
export function AgenticTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    useAgenticRealtime()
    const query = useAgenticSettings()
    const save = useSaveAgenticSettings()
    const form = useForm<AgenticSettings>({ resolver: zodResolver(agenticSettingsSchema), mode: "onChange", defaultValues: DEFAULT_AGENTIC_SETTINGS })
    const dirty = form.formState.isDirty
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab(SETTINGS_TABS, "padrao", dirty, () => (query.data ? form.reset(query.data.settings) : undefined), "abaAgentic")

    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data, form])
    useEffect(() => {
        onDirtyChange(dirty)
        return () => onDirtyChange(false)
    }, [dirty, onDirtyChange])

    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />

    const data = query.data
    const submit = form.handleSubmit(async (values) => {
        const saved = await save.mutateAsync(values).catch(() => null)
        if (saved) form.reset(saved.settings)
    })
    const actions = <SettingsActions dirty={dirty} isDefault={data.isDefault} saving={save.isPending} onUndo={() => form.reset(data.settings)} onSave={() => void submit()} />

    return (
        <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções do desenvolvimento agêntico">
            {tab === "padrao" && (
                <>
                    <DefaultSettingsSection form={form} />
                    {actions}
                </>
            )}

            {tab === "agentes" && (
                <>
                    <AgentsSettingsSection form={form} availability={data.availability} />
                    {actions}
                </>
            )}

            {tab === "memorias" && <DeveloperMemoriesSection />}

            {tab === "centrais" && <CentralsCard />}
        </IntegrationTabs>
    )
}
