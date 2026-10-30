"use client"

import { aiAgentsOfTab } from "@/features/ai/agents"
import { AgentMemoriesCard } from "@/features/ai/components/memories/AgentMemoriesCard"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/** Seção "Memórias" de um agente de chat: um card por lista da aba (globais, do dono e do cliente), com tempo real. */
export function OpexMemoriesSection({ tab = "agente-opex" }: { tab?: string }) {
    useMemoriesRealtime(true)
    return (
        <>
            {aiAgentsOfTab(tab).map((agentId) => (
                <AgentMemoriesCard key={agentId} agentId={agentId} />
            ))}
        </>
    )
}
