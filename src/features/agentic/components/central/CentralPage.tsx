"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { motion } from "framer-motion"
import { ArrowLeft, Bot, Bug, FileText, FolderCog, GitBranch, LayoutDashboard, ListChecks, Server } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Button } from "@/components/ui/button"
import { apiErrorMessage } from "@/lib/api"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { useAgenticRealtime, useCentral, useUpdateCentral } from "../../hooks/useAgentic"
import { centralConfigSchema, defaultCentralConfig, type CentralConfig, type CentralConfigInput } from "../../schemas"
import { AgentsSection } from "./AgentsSection"
import { CentralHeaderActions } from "./CentralHeaderActions"
import { CentralLogsSection } from "./CentralLogsSection"
import { CentralWorkbenchesSection } from "./CentralWorkbenchesSection"
import { ColumnsSection } from "./ColumnsSection"
import { EnvironmentSection } from "./EnvironmentSection"
import { FormActions } from "@/components/ui/form-actions"
import { GeneralSection } from "./GeneralSection"
import { GitSection } from "./GitSection"
import { InstructionsSection } from "./InstructionsSection"

const TAB_IDS = ["geral", "agentes", "git", "ambiente", "colunas", "instrucoes", "logs", "mesas"] as const
type CentralTab = (typeof TAB_IDS)[number]
const FORM_TABS: readonly CentralTab[] = ["geral", "agentes", "git", "ambiente", "colunas", "instrucoes"]

const TABS: IntegrationTabDef<CentralTab>[] = [
    { id: "geral", label: "Geral", icon: FolderCog },
    { id: "agentes", label: "Agentes", icon: Bot },
    { id: "git", label: "Git e PR", icon: GitBranch },
    { id: "ambiente", label: "Ambiente", icon: Server },
    { id: "colunas", label: "Colunas e conclusão", icon: ListChecks },
    { id: "instrucoes", label: "Instruções", icon: FileText },
    { id: "logs", label: "Logs", icon: Bug },
    { id: "mesas", label: "Mesas", icon: LayoutDashboard },
]

export const AGENTIC_SETTINGS_HREF = "/integracoes/ia?aba=desenvolvimento-agentico"

/** Configurações de uma central (`/integracoes/ia/centrais/[id]`). */
export function CentralPage({ id }: { id: string }) {
    useAgenticRealtime()
    const router = useRouter()
    const query = useCentral(id)
    const save = useUpdateCentral(id)
    const form = useForm<CentralConfigInput, unknown, CentralConfig>({ resolver: zodResolver(centralConfigSchema), mode: "onChange", defaultValues: defaultCentralConfig("/") })
    const dirty = form.formState.isDirty
    const loadedAt = useRef<string | null>(null)
    const central = query.data
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<CentralTab>(TAB_IDS, "geral", dirty, () => central && form.reset(central.config))

    // Recarrega o formulário quando a central muda no servidor, sem atropelar alterações locais.
    useEffect(() => {
        if (!central || (dirty && loadedAt.current !== null)) return
        if (central.updatedAt === loadedAt.current) return
        form.reset(central.config)
        loadedAt.current = central.updatedAt
    }, [central, dirty, form])

    if (query.isLoading) return <Skeleton className="h-[480px] w-full" />
    if (query.isError || !central) return <ErrorState title="Não foi possível carregar a central" description={apiErrorMessage(query.error, "Ela pode ter sido excluída.")} onRetry={() => void query.refetch()} />

    const submit = form.handleSubmit(async (values) => {
        const saved = await save.mutateAsync(values).catch(() => null)
        if (saved) form.reset(saved.config)
    })

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex min-w-0 flex-col gap-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-1">
                    <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                        <Link href={AGENTIC_SETTINGS_HREF}>
                            <ArrowLeft className="h-4 w-4" aria-hidden /> Desenvolvimento agêntico
                        </Link>
                    </Button>
                    <h1 className="text-xl font-semibold md:text-2xl">Central {central.projectName}</h1>
                    <p className="truncate font-mono text-xs text-muted-foreground">{central.config.sessionDirectory}</p>
                </div>
                <CentralHeaderActions central={central} onDeleted={() => router.push(AGENTIC_SETTINGS_HREF)} />
            </div>

            <form
                className="flex min-w-0 flex-col gap-6"
                onSubmit={(event) => {
                    event.preventDefault()
                    void submit()
                }}
            >
                <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções da central">
                    {tab === "geral" && <GeneralSection form={form} central={central} />}
                    {tab === "agentes" && <AgentsSection form={form} />}
                    {tab === "git" && <GitSection form={form} />}
                    {tab === "ambiente" && <EnvironmentSection form={form} centralId={id} />}
                    {tab === "colunas" && <ColumnsSection form={form} />}
                    {tab === "instrucoes" && <InstructionsSection form={form} />}
                    {tab === "logs" && <CentralLogsSection centralId={id} />}
                    {tab === "mesas" && <CentralWorkbenchesSection centralId={id} />}
                    {FORM_TABS.includes(tab) && <FormActions dirty={dirty} pending={save.isPending} valid={form.formState.isValid} onUndo={() => form.reset(central.config)} />}
                </IntegrationTabs>
            </form>
        </motion.section>
    )
}
