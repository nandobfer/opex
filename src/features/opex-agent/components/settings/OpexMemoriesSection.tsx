"use client"

import { aiAgentsOfTab } from "@/features/ai/agents"
import { AgentMemoriesCard } from "@/features/ai/components/memories/AgentMemoriesCard"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/** Seção "Memórias" do Agente Opex: um card por lista da aba (globais, do dono e do cliente), com tempo real. */
export function OpexMemoriesSection() {
    useMemoriesRealtime(true)
    return (
        <>
            {aiAgentsOfTab("agente-opex").map((agentId) => (
                <AgentMemoriesCard key={agentId} agentId={agentId} />
            ))}
        </>
    )
}
