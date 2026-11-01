"use client"

import { AgentMemoriesCard } from "@/features/ai/components/memories/AgentMemoriesCard"
import { SelfMemorySwitch } from "@/features/ai/components/memories/SelfMemorySwitch"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/**
 * Seção "Memórias" do Agente Adversário: o aprendizado autônomo, a lista `adversarial` (canal do
 * Engramind que entra nas instruções de toda revisão) e as Memórias do Opex, com tempo real. O Agente
 * Opex e o Agente Mentor também gerenciam esta lista.
 */
export function MemoriesSection() {
    useMemoriesRealtime(true)
    return (
        <div className="flex flex-col gap-6">
            <SelfMemorySwitch consumer="adversario" />
            <AgentMemoriesCard agentId="adversarial" />
            <AgentMemoriesCard agentId="app-global" />
        </div>
    )
}
