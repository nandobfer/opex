"use client"

import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react"
import { motion } from "framer-motion"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Cable, Container, KeyRound, Network } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { BUILDER_MACHINE_TABS, type BuilderMachineTab } from "../constants"
import { DEFAULT_LOCAL_DOCKER_SETTINGS, localDockerSettingsSchema, type LocalDockerSettings } from "../schemas"
import { useLocalDockerRealtime, useLocalDockerSettings, useSaveLocalDockerSettings } from "../hooks/useLocalDocker"
import { ActivationCard } from "./ActivationCard"
import { BuilderMachineFooter } from "./BuilderMachineFooter"
import { LockedTabs } from "./LockedTabs"
import { ConnectionTab } from "./connection/ConnectionTab"
import { DockerTab } from "./docker/DockerTab"
import { SetupTab } from "./setup/SetupTab"
import { TunnelTab } from "./tunnel/TunnelTab"

const TABS: IntegrationTabDef<BuilderMachineTab>[] = [
    { id: "tunel", label: "Túnel do Docker do PC", icon: Cable },
    { id: "conexao", label: "Conexão com o PC", icon: Network },
    { id: "docker", label: "Docker do PC", icon: Container },
    { id: "preparo", label: "Preparo do PC", icon: KeyRound },
]

interface BuilderMachineEditorFormProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    /** Rascunho da integração (ambiente e modo debug) com alterações. */
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
}

/**
 * Página da integração Builder Machine (`local-docker`) em abas: Túnel do Docker do PC, Conexão
 * com o PC, Docker do PC e Preparo do PC. A configuração do PC é um formulário só (Conexão + Docker);
 * Salvar grava também o Geral da integração (ambiente, modo debug e "Integração ativa"). Desativada
 * (como salva), a página mostra só o Geral e a ativação, com as abas bloqueadas.
 */
export function BuilderMachineEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo }: BuilderMachineEditorFormProps) {
    const active = data.publicValues.active === true
    useLocalDockerRealtime()
    const query = useLocalDockerSettings(active)
    const save = useSaveLocalDockerSettings()
    const form = useForm<LocalDockerSettings>({ resolver: zodResolver(localDockerSettingsSchema), mode: "onChange", defaultValues: DEFAULT_LOCAL_DOCKER_SETTINGS })
    const formDirty = form.formState.isDirty
    const mode = useWatch({ control: form.control, name: "mode" })
    const saved = query.data

    useEffect(() => {
        if (saved) form.reset(saved.settings)
    }, [saved, form])

    const undoAll = useCallback(() => {
        onUndo()
        if (saved) form.reset(saved.settings)
    }, [form, onUndo, saved])
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<BuilderMachineTab>(BUILDER_MACHINE_TABS, "tunel", dirty || formDirty, undoAll)

    const submit = form.handleSubmit(async (values) => {
        if (dirty && !(await onSave())) return
        if (active && (formDirty || saved?.isDefault)) {
            const result = await save.mutateAsync(values).catch(() => null)
            if (result) form.reset(result.settings)
        }
    })

    const unsaved = formDirty || Boolean(saved?.isDefault)
    const general = (
        <>
            <GeneralCard draft={draft} setDraft={setDraft} />
            <ActivationCard draft={draft} setDraft={setDraft} savedActive={active} />
        </>
    )
    const footer = <BuilderMachineFooter dirty={dirty || formDirty} canSave={dirty || unsaved} pending={pending || save.isPending} onUndo={undoAll} />

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
                // Desativada: só o Geral e a ativação (a configuração do PC nem carrega).
                if (!active) {
                    if (dirty) void onSave()
                    return
                }
                void submit()
            }}
        >
            <DetailHeader def={def} data={data} hasAnySecret={def.secretFields.length > 0} />
            {!active ? (
                <>
                    {general}
                    <LockedTabs tabs={TABS} />
                    <BuilderMachineFooter dirty={dirty} canSave={dirty} pending={pending} onUndo={onUndo} />
                </>
            ) : query.isLoading ? (
                <Skeleton className="h-96 w-full" />
            ) : query.isError || !saved ? (
                <ErrorState title="Não foi possível carregar a Builder Machine" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções da integração Builder Machine">
                    {tab === "tunel" && <TunnelTab saved={saved} unsaved={unsaved} goTo={requestTab} />}
                    {tab === "conexao" && (
                        <>
                            <ConnectionTab form={form} general={general} />
                            {footer}
                        </>
                    )}
                    {tab === "docker" && (
                        <>
                            <DockerTab form={form} />
                            {footer}
                        </>
                    )}
                    {tab === "preparo" && <SetupTab saved={saved} mode={mode} unsaved={unsaved} />}
                </IntegrationTabs>
            )}
        </motion.form>
    )
}
