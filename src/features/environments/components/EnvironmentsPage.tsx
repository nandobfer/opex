"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Monitor, Plus, SearchX, Server, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { DEFAULT_ENVIRONMENT_FILTERS, ENVIRONMENT_FILTER_SCHEMA, filterEnvironmentList, hasActiveEnvironmentFilters } from "../filters"
import { deployPath, ENVIRONMENT_NEW_PATH } from "../constants"
import { useEnvironments, useEnvironmentsRealtime } from "../hooks/useEnvironments"
import type { Machine } from "../schemas"
import type { EnvironmentDto, UnmanagedProjectDto } from "../types"
import { groupByMachine } from "../view"
import { AdoptDialog } from "./AdoptDialog"
import { ComposeDialog } from "./ComposeDialog"
import { BuilderCard } from "./builder/BuilderCard"
import { DeleteEnvironmentDialog } from "./DeleteEnvironmentDialog"
import { DeployHistoryDialog } from "./DeployHistoryDialog"
import { EnvironmentCard, type CardIntent } from "./EnvironmentCard"
import { EnvironmentCardSkeleton } from "./card/EnvironmentCardSkeleton"
import { EnvironmentsFiltersBar } from "./EnvironmentsFiltersBar"
import { ENV_CARD_LIST_CLASS } from "./card/environment-card-layout"
import { usePortLinkHost } from "./card/usePortLinkHost"
import { MoveDialog } from "./MoveDialog"
import { SettingsDialog } from "./SettingsDialog"
import { UnmanagedList } from "./UnmanagedList"

const GROUPS: { machine: Machine; title: string; icon: typeof Server }[] = [
    { machine: "server", title: "Servidor", icon: Server },
    { machine: "pc", title: "PC", icon: Monitor },
]

type Dialog = { kind: "delete" | "move" | "history" | "compose"; env: EnvironmentDto } | { kind: "adopt"; project: UnmanagedProjectDto } | { kind: "settings" } | null

function EnvironmentsContent() {
    useEnvironmentsRealtime()
    const query = useEnvironments()
    const router = useRouter()
    const [dialog, setDialog] = useState<Dialog>(null)
    // Deploy (ou mudança de máquina) iniciado: abre a página do log, como a gaveta abria antes (OPE-208).
    const openDeploy = (id: string) => router.push(deployPath(id))
    const data = query.data
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_ENVIRONMENT_FILTERS, ENVIRONMENT_FILTER_SCHEMA)
    const filtered = useMemo(() => filterEnvironmentList({ items: data?.items ?? [], unmanaged: data?.unmanaged ?? [] }, filters), [data, filters])
    const groups = groupByMachine(filtered.items)
    const filtering = hasActiveEnvironmentFilters(filters)
    const nothingFound = Boolean(data && filtering && (data.items.length || data.unmanaged.length) && !filtered.items.length && !filtered.unmanaged.length)
    const linkHost = usePortLinkHost(data?.portLinkHost)
    const onIntent = (env: EnvironmentDto, intent: CardIntent) => {
        if (intent.kind === "deploy-started") openDeploy(intent.deployId)
        else setDialog({ kind: intent.kind, env })
    }

    return (
        <div className="flex flex-col gap-6">
            <CadastroHeader title="Ambientes" description="Projetos Docker Compose no servidor e no PC (Builder Machine), com deploy, logs e mover entre máquinas." actionLabel="Novo ambiente" actionIcon={<Plus className="h-4 w-4" />} onAction={() => router.push(ENVIRONMENT_NEW_PATH)}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{data ? (data.pcAvailable ? "PC disponível (túnel aberto)" : (data.pcReason ?? "PC indisponível")) : "Conferindo as máquinas…"}</span>
                    <Button type="button" variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={() => setDialog({ kind: "settings" })}>
                        <Settings className="h-4 w-4" aria-hidden /> Configurações
                    </Button>
                </div>
            </CadastroHeader>
            <BuilderCard />
            <EnvironmentsFiltersBar filters={filters} setFilters={setFilters} onClear={resetFilters} total={filtered.items.length + filtered.unmanaged.length} />
            {query.isLoading ? (
                <EnvironmentCardSkeleton />
            ) : query.isError || !data ? (
                <ErrorState title="Não foi possível carregar os ambientes" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <>
                    {nothingFound && <EmptyState icon={SearchX} title="Nenhum ambiente com estes filtros" description="Ajuste a busca, a máquina, a situação ou a origem." actionLabel="Limpar filtros" onAction={resetFilters} />}
                    {!data.items.length && !filtering && <EmptyState icon={Server} title="Nenhum ambiente ainda" description="Crie um a partir do repositório de uma central ou com um compose gerenciado (escrito aqui), ou adote um projeto do compose em execução." actionLabel="Novo ambiente" onAction={() => router.push(ENVIRONMENT_NEW_PATH)} />}
                    {GROUPS.filter((group) => groups[group.machine].length).map(({ machine, title, icon: Icon }) => (
                        <section key={machine} aria-label={title} className="space-y-3">
                            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <Icon className="h-4 w-4" aria-hidden /> {title}
                                <span className="font-normal text-muted-foreground">{groups[machine].length}</span>
                            </h2>
                            <ul className={ENV_CARD_LIST_CLASS}>
                                <AnimatePresence initial={false}>
                                    {groups[machine].map((env) => (
                                        <motion.li key={env.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                                            <EnvironmentCard env={env} pcAvailable={data.pcAvailable} linkHost={linkHost} capacity={data.hosts?.[machine] ?? null} onIntent={(intent) => onIntent(env, intent)} />
                                        </motion.li>
                                    ))}
                                </AnimatePresence>
                            </ul>
                        </section>
                    ))}
                    <UnmanagedList projects={filtered.unmanaged} onAdopt={(project) => setDialog({ kind: "adopt", project })} />
                </>
            )}
            <DeleteEnvironmentDialog env={dialog?.kind === "delete" ? dialog.env : null} onClose={() => setDialog(null)} />
            <MoveDialog env={dialog?.kind === "move" ? dialog.env : null} pcAvailable={data?.pcAvailable ?? false} pcReason={data?.pcReason ?? null} onClose={() => setDialog(null)} onStarted={openDeploy} />
            <DeployHistoryDialog env={dialog?.kind === "history" ? dialog.env : null} onClose={() => setDialog(null)} />
            <ComposeDialog env={dialog?.kind === "compose" ? (data?.items.find((item) => item.id === dialog.env.id) ?? dialog.env) : null} onClose={() => setDialog(null)} />
            <AdoptDialog project={dialog?.kind === "adopt" ? dialog.project : null} onClose={() => setDialog(null)} />
            <SettingsDialog open={dialog?.kind === "settings"} onClose={() => setDialog(null)} />
        </div>
    )
}

/** Página `/ambientes`. */
export function EnvironmentsPage() {
    return <EnvironmentsContent />
}
