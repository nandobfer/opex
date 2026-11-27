"use client"

import { AgentUniverseCard } from "@/features/ai/components/memories/AgentUniverseCard"

/**
 * Aba **Memórias** (OPE-130, D10/D11): um card só, com o universo do agente igual ao de `/engramind`
 * (`AgentUniverseCard`, compartilhado com os demais agentes desde a OPE-148) — todas as memórias que o agente
 * alcança (a raiz do app, o global dos rotineiros, o canal próprio e os extras), com as mesmas ações e o tempo real
 * pelo SSE da lib. "Nova memória" escolhe o canal entre os assinados; o inicial é o canal próprio do agente. O
 * agente (`<app>/rotineiro-<slug>`) e o canal próprio vêm do DTO, já no app da instância (OPE-206).
 */
export function RoutineMemoriesTab({ agent }: { agent: { engramindAgent: string; channel: string } }) {
    return (
        <AgentUniverseCard
            agent={agent.engramindAgent}
            defaultCreateChannel={agent.channel}
            description="Todas as memórias que o agente alcança, por canal. Se o agente ainda não aparece, conclua o provisionamento em Configurar."
        />
    )
}
