"use client"

import { aiAgentsOfTab } from "@/features/ai/agents"
import { AgentMemoriesCard } from "@/features/ai/components/memories/AgentMemoriesCard"
import { ClientMemoriesCard } from "@/features/ai/components/memories/ClientMemoriesCard"
import { SelfMemorySwitch } from "@/features/ai/components/memories/SelfMemorySwitch"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/**
 * Seção "Memórias" de um agente de chat (Agente Opex ou Agente Maddox): o aprendizado autônomo, as
 * Memórias do Opex (todos os agentes), um card por lista da aba (globais, do dono e do cliente) e as
 * memórias de um cliente específico, com tempo real.
 */
export function OpexMemoriesSection({ tab = "agente-opex" }: { tab?: string }) {
    useMemoriesRealtime(true)
    const maddox = tab === "agente-maddox"
    return (
        <>
            <SelfMemorySwitch consumer={maddox ? "maddox" : "opex"} />
            <AgentMemoriesCard agentId="app-global" />
            {aiAgentsOfTab(tab).map((agentId) => (
                <AgentMemoriesCard key={agentId} agentId={agentId} />
            ))}
            <ClientMemoriesCard agentId={maddox ? "maddox-client-specific" : "opex-client-specific"} />
        </>
    )
}
