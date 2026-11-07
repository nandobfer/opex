"use client"

import { useMemo } from "react"
import { Network } from "lucide-react"
import { AgentUniverse, NETWORK_CANVAS_COMPACT_CLASS } from "@engramind/client/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OpexEngramindProvider } from "@/features/engramind/components/OpexEngramindProvider"
import { useMemoriesMeta } from "../../hooks/useMemories"
import { MemoriesNotices, type NoticesUniverse } from "./MemoriesNotices"

/** Avisos do universo (migração pendente, Engramind indisponível, memórias fora do contexto do agente). */
function UniverseNotices({ universe }: { universe: NoticesUniverse }) {
    const meta = useMemoriesMeta()
    return <MemoriesNotices meta={meta.data} universe={universe} />
}

export interface AgentUniverseCardProps {
    /** Agente no Engramind (`opex/<identidade>`), o centro do universo. */
    agent: string
    description: string
    /** Canal inicial de "Nova memória" (a escolha fica entre os canais do universo). */
    defaultCreateChannel: string
    /** Só estes canais entram no universo (`null` = todos os que o agente assina). */
    channels?: readonly string[] | null
    /** Consumidor dos avisos de memórias (`null` = sem avisos, ex.: rotineiros). */
    noticesConsumer?: string | null
    title?: string
}

/**
 * Card único das memórias de um agente (OPE-130 nos rotineiros, OPE-148 em todos): o universo do agente
 * (`AgentUniverse` da lib), com todas as memórias que ele alcança por canal, as ações e o tempo real pelo SSE
 * da lib. A rede preenche a altura disponível da página (`fill`), com o mínimo da lib.
 */
export function AgentUniverseCard({ agent, description, defaultCreateChannel, channels = null, noticesConsumer = null, title = "Rede de memórias" }: AgentUniverseCardProps) {
    const channelsKey = channels ? channels.join("\n") : ""
    // Função estável: a lib memoriza o universo por ela.
    const includeChannel = useMemo(() => {
        if (!channelsKey) return null
        const allowed = new Set(channelsKey.split("\n"))
        return (slug: string) => allowed.has(slug)
    }, [channelsKey])
    const universe = useMemo<NoticesUniverse | null>(() => (noticesConsumer ? { consumer: noticesConsumer, channels: channelsKey ? channelsKey.split("\n") : null } : null), [noticesConsumer, channelsKey])
    return (
        <Card data-testid="agent-universe-card" data-agent={agent}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Network className="h-4 w-4" aria-hidden /> {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {universe && <UniverseNotices universe={universe} />}
                <OpexEngramindProvider>
                    <AgentUniverse agent={agent} defaultCreateChannel={defaultCreateChannel} includeChannel={includeChannel} className={NETWORK_CANVAS_COMPACT_CLASS} fill />
                </OpexEngramindProvider>
            </CardContent>
        </Card>
    )
}
