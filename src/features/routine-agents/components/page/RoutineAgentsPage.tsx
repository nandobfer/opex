"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Repeat } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AgentPageHeader } from "@/components/list/AgentPageHeader"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { agentDef } from "@/features/agent-metrics/catalog"
import { routineAgentHref, routineSettingsHref } from "../../constants"
import { formatDateTime } from "../../format"
import { ROUTINE_ENGINE_LABELS } from "../../schemas"
import { useRoutineAgents } from "../../hooks/useRoutineAgents"
import { useRoutineRealtime } from "../../hooks/useRoutineRealtime"
import { RoutineAgentStatusBadge, RoutineProvisioningBadge, RoutineRunStatusBadge } from "../RoutineBadges"

/** Grade dos cards (o skeleton usa a mesma). */
export const ROUTINE_GRID = "grid gap-3 md:grid-cols-2 xl:grid-cols-3"
export const ROUTINE_CARD_HEIGHT = "h-[132px]"

/** `/agentes-rotineiros` (OPE-130): agentes não arquivados com status, última execução e próximo disparo. */
export function RoutineAgentsPage() {
    const def = agentDef("rotineiros")
    const router = useRouter()
    const query = useRoutineAgents("current")
    useRoutineRealtime()
    const agents = query.data ?? []
    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <AgentPageHeader icon={def.icon} title={def.title} description={def.description} settingsHref={routineSettingsHref()} />
            {query.isLoading ? (
                <div className={ROUTINE_GRID} data-testid="routine-agents-skeleton">
                    {[0, 1, 2].map((index) => (
                        <Skeleton key={index} className={`${ROUTINE_CARD_HEIGHT} w-full rounded-xl`} />
                    ))}
                </div>
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar os agentes rotineiros" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : agents.length === 0 ? (
                <EmptyState icon={Repeat} title="Nenhum agente rotineiro" description="Crie um agente autônomo com objetivo, ferramentas e gatilhos." actionLabel="Novo agente rotineiro" onAction={() => router.push(routineSettingsHref("novo"))} />
            ) : (
                <div className={ROUTINE_GRID}>
                    {agents.map((agent, index) => (
                        <motion.div key={agent.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}>
                            <Link href={routineAgentHref(agent.id)} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <Card className={`${ROUTINE_CARD_HEIGHT} transition-colors hover:border-primary/50`}>
                                    <CardContent className="flex h-full flex-col gap-1.5 p-4">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate font-semibold">{agent.title}</span>
                                            <RoutineAgentStatusBadge status={agent.status} />
                                            <RoutineProvisioningBadge status={agent.provisioning.status} />
                                        </div>
                                        <p className="line-clamp-1 text-xs text-muted-foreground">{agent.objective}</p>
                                        <p className="text-xs text-muted-foreground">{ROUTINE_ENGINE_LABELS[agent.engine]}</p>
                                        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            {agent.lastRun ? (
                                                <span className="flex items-center gap-1">
                                                    Última {formatDateTime(agent.lastRun.at)} <RoutineRunStatusBadge status={agent.lastRun.status} />
                                                </span>
                                            ) : (
                                                <span>Nenhuma execução ainda</span>
                                            )}
                                            <span>· Próximo disparo {formatDateTime(agent.nextFireAt)}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            )}
        </motion.section>
    )
}
