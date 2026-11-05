"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Plus, Repeat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { RoutineListFilter } from "../../schemas"
import type { RoutineAgentDto } from "../../types"
import { useRoutineAgents, useRoutineAgentStatus, useRoutineProvisioning } from "../../hooks/useRoutineAgents"
import { RoutineAgentItem, type RoutineItemAction } from "./RoutineAgentItem"

const FILTERS: { value: RoutineListFilter; label: string }[] = [
    { value: "current", label: "Ativos e pausados" },
    { value: "archived", label: "Arquivados" },
]

export const ROUTINE_ITEM_SKELETON = "h-[88px] w-full rounded-lg"

/** Lista dos agentes rotineiros da aba de configuração (o filtro padrão esconde os arquivados). */
export function RoutineAgentsSection({ onEdit, onNew }: { onEdit: (id: string) => void; onNew: () => void }) {
    const [filter, setFilter] = useState<RoutineListFilter>("current")
    const query = useRoutineAgents(filter)
    const status = useRoutineAgentStatus()
    const provisioning = useRoutineProvisioning()
    const [archiving, setArchiving] = useState<RoutineAgentDto | null>(null)
    const agents = query.data ?? []

    const act = (agent: RoutineAgentDto, action: RoutineItemAction) => {
        if (action === "edit") return onEdit(agent.id)
        if (action === "archive") return setArchiving(agent)
        if (action === "reprovision") return provisioning.mutate({ id: agent.id, mode: "reprovision" })
        status.mutate({ id: agent.id, action })
    }

    return (
        <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">Agentes rotineiros</CardTitle>
                    <CardDescription>Agentes autônomos que executam sozinhos, esperam, hibernam e pedem confirmação antes de ações irreversíveis. Não há exclusão: pause ou arquive.</CardDescription>
                </div>
                <Button type="button" className="gap-1.5" onClick={onNew}>
                    <Plus className="h-4 w-4" aria-hidden /> Novo agente rotineiro
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                <OptionTabs<RoutineListFilter> aria-label="Filtro dos agentes rotineiros" options={FILTERS} value={filter} onChange={setFilter} className="w-full" />
                {query.isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className={ROUTINE_ITEM_SKELETON} />
                        <Skeleton className={ROUTINE_ITEM_SKELETON} />
                    </div>
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar os agentes rotineiros" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : agents.length === 0 ? (
                    filter === "archived" ? (
                        <EmptyState icon={Repeat} title="Nenhum agente arquivado" description="Os agentes arquivados aparecem aqui e podem ser desarquivados." />
                    ) : (
                        <EmptyState icon={Repeat} title="Nenhum agente rotineiro" description="Crie um agente com objetivo, motor, ferramentas e gatilhos para ele executar sozinho." actionLabel="Novo agente rotineiro" onAction={onNew} />
                    )
                ) : (
                    <ul className="space-y-2" aria-label="Agentes rotineiros">
                        <AnimatePresence initial={false}>
                            {agents.map((agent) => (
                                <motion.li key={agent.id} layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                                    <RoutineAgentItem agent={agent} pending={status.isPending || provisioning.isPending} onAction={(action) => act(agent, action)} />
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>
            <ConfirmDialog
                open={archiving !== null}
                onOpenChange={(open) => !open && setArchiving(null)}
                title={`Arquivar "${archiving?.title ?? ""}"?`}
                description="O agente para de disparar (agendados e webhook), sai da barra lateral e da lista padrão. As execuções em andamento terminam normalmente e o Engramind fica intacto."
                confirmLabel="Arquivar"
                variant="destructive"
                pending={status.isPending}
                onConfirm={() => {
                    if (archiving) status.mutate({ id: archiving.id, action: "archive" }, { onSettled: () => setArchiving(null) })
                }}
            />
        </Card>
    )
}
