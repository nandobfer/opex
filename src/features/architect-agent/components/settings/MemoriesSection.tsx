"use client"

import { AgentMemoriesCard } from "@/features/ai/components/memories/AgentMemoriesCard"
import { SelfMemorySwitch } from "@/features/ai/components/memories/SelfMemorySwitch"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/**
 * Seção "Memórias" do Agente Arquiteto: o aprendizado autônomo, a lista `architect` (canal do
 * Engramind que entra nas instruções de toda geração) e as Memórias do Opex, com tempo real.
 */
export function MemoriesSection() {
    useMemoriesRealtime(true)
    return (
        <div className="flex flex-col gap-6">
            <SelfMemorySwitch consumer="arquiteto" />
            <AgentMemoriesCard agentId="architect" />
            <AgentMemoriesCard agentId="app-global" />
        </div>
    )
}
