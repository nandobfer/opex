"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Monitor, Plus, Server, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { CadastroTableSkeleton } from "@/components/list/CadastroTableSkeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useEnvironments, useEnvironmentsRealtime } from "../hooks/useEnvironments"
import type { Machine } from "../schemas"
import type { EnvironmentDto, UnmanagedProjectDto } from "../types"
import { groupByMachine } from "../view"
import { AdoptDialog } from "./AdoptDialog"
import { DeleteEnvironmentDialog } from "./DeleteEnvironmentDialog"
import { DeployHistoryDialog } from "./DeployHistoryDialog"
import { DeployDrawer } from "./DeployDrawer"
import { EnvironmentFormDialog } from "./EnvironmentFormDialog"
import { EnvironmentRow, type RowIntent } from "./EnvironmentRow"
import { MoveDialog } from "./MoveDialog"
import { SettingsDialog } from "./SettingsDialog"
import { UnmanagedList } from "./UnmanagedList"

const GROUPS: { machine: Machine; title: string; icon: typeof Server }[] = [
    { machine: "server", title: "Servidor", icon: Server },
    { machine: "pc", title: "PC", icon: Monitor },
]

type Dialog = { kind: "form"; env: EnvironmentDto | null } | { kind: "delete" | "move" | "history"; env: EnvironmentDto } | { kind: "adopt"; project: UnmanagedProjectDto } | { kind: "settings" } | null

function EnvironmentsContent() {
    useEnvironmentsRealtime()
    const query = useEnvironments()
    const [dialog, setDialog] = useState<Dialog>(null)
    const [deploy, setDeploy] = useState<{ id: string; title: string } | null>(null)
    const data = query.data
    const groups = groupByMachine(data?.items ?? [])
    const onIntent = (env: EnvironmentDto, intent: RowIntent) => {
        if (intent.kind === "deploy-started") setDeploy({ id: intent.deployId, title: env.name })
        else setDialog(intent.kind === "edit" ? { kind: "form", env } : { kind: intent.kind, env })
    }

    return (
        <div className="flex flex-col gap-6">
            <CadastroHeader title="Ambientes" description="Projetos Docker Compose no servidor e no PC (Builder Machine), com deploy, logs e mover entre máquinas." actionLabel="Novo ambiente" actionIcon={<Plus className="h-4 w-4" />} onAction={() => setDialog({ kind: "form", env: null })}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{data ? (data.pcAvailable ? "PC disponível (túnel aberto)" : (data.pcReason ?? "PC indisponível")) : "Conferindo as máquinas…"}</span>
                    <Button type="button" variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={() => setDialog({ kind: "settings" })}>
                        <Settings className="h-4 w-4" aria-hidden /> Configurações
                    </Button>
                </div>
            </CadastroHeader>
            {query.isLoading ? (
                <CadastroTableCard>
                    <CadastroTableSkeleton columns={4} rows={4} />
                </CadastroTableCard>
            ) : query.isError || !data ? (
                <ErrorState title="Não foi possível carregar os ambientes" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <>
                    {!data.items.length && <EmptyState icon={Server} title="Nenhum ambiente ainda" description="Crie um a partir do repositório de uma central ou adote um projeto do compose em execução." actionLabel="Novo ambiente" onAction={() => setDialog({ kind: "form", env: null })} />}
                    {GROUPS.filter((group) => groups[group.machine].length).map(({ machine, title, icon: Icon }) => (
                        <CadastroTableCard key={machine}>
                            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                                <Icon className="h-4 w-4" aria-hidden /> {title}
                            </h2>
                            <ul className="divide-y">
                                <AnimatePresence initial={false}>
                                    {groups[machine].map((env) => (
                                        <motion.li key={env.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                                            <EnvironmentRow env={env} pcAvailable={data.pcAvailable} onIntent={(intent) => onIntent(env, intent)} onOpenDeploy={(id) => setDeploy({ id, title: env.name })} />
                                        </motion.li>
                                    ))}
                                </AnimatePresence>
                            </ul>
                        </CadastroTableCard>
                    ))}
                    <UnmanagedList projects={data.unmanaged} onAdopt={(project) => setDialog({ kind: "adopt", project })} />
                </>
            )}
            <EnvironmentFormDialog open={dialog?.kind === "form"} env={dialog?.kind === "form" ? dialog.env : null} pcAvailable={data?.pcAvailable ?? false} pcReason={data?.pcReason ?? null} onClose={() => setDialog(null)} />
            <DeleteEnvironmentDialog env={dialog?.kind === "delete" ? dialog.env : null} onClose={() => setDialog(null)} />
            <MoveDialog env={dialog?.kind === "move" ? dialog.env : null} pcAvailable={data?.pcAvailable ?? false} pcReason={data?.pcReason ?? null} onClose={() => setDialog(null)} onStarted={(id, title) => setDeploy({ id, title })} />
            <DeployHistoryDialog
                env={dialog?.kind === "history" ? dialog.env : null}
                onClose={() => setDialog(null)}
                onOpenDeploy={(id) => {
                    if (dialog?.kind === "history") setDeploy({ id, title: dialog.env.name })
                    setDialog(null)
                }}
            />
            <AdoptDialog project={dialog?.kind === "adopt" ? dialog.project : null} onClose={() => setDialog(null)} />
            <SettingsDialog open={dialog?.kind === "settings"} onClose={() => setDialog(null)} />
            <DeployDrawer deployId={deploy?.id ?? null} title={deploy?.title ?? ""} onClose={() => setDeploy(null)} />
        </div>
    )
}

/** Página `/ambientes`. */
export function EnvironmentsPage() {
    return <EnvironmentsContent />
}
