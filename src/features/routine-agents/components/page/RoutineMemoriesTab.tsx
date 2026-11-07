"use client"

import { routineIdentityOf } from "@/features/ai/agents"
import { AgentUniverseCard } from "@/features/ai/components/memories/AgentUniverseCard"
import { OPEX_APP_SLUG } from "@/features/engramind/constants"
import { routineChannelOf } from "../../constants"

/** Agente do rotineiro no Engramind (`opex/rotineiro-<slug>`), o centro do universo. */
export const routineEngramindAgent = (slug: string) => `${OPEX_APP_SLUG}/${routineIdentityOf(slug)}`

/**
 * Aba **Memórias** (OPE-130, D10/D11): um card só, com o universo do agente igual ao de `/engramind`
 * (`AgentUniverseCard`, compartilhado com os demais agentes desde a OPE-148) — todas as memórias que o agente
 * alcança (`opex`, o global dos rotineiros, o canal próprio e os extras), com as mesmas ações e o tempo real
 * pelo SSE da lib. "Nova memória" escolhe o canal entre os assinados; o inicial é o canal próprio do agente.
 */
export function RoutineMemoriesTab({ slug }: { slug: string }) {
    return (
        <AgentUniverseCard
            agent={routineEngramindAgent(slug)}
            defaultCreateChannel={routineChannelOf(slug)}
            description="Todas as memórias que o agente alcança, por canal. Se o agente ainda não aparece, conclua o provisionamento em Configurar."
        />
    )
}
