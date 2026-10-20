"use client"

import { AI_AGENT_IDS } from "@/features/ai/agents"
import { AgentMemoriesCard } from "@/features/ai/components/memories/AgentMemoriesCard"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/** Seção "Memórias" do Agente Opex: um card por lista (globais, do dono e do cliente), com tempo real. */
export function OpexMemoriesSection() {
    useMemoriesRealtime(true)
    return (
        <>
            {AI_AGENT_IDS.map((agentId) => (
                <AgentMemoriesCard key={agentId} agentId={agentId} />
            ))}
        </>
    )
}
