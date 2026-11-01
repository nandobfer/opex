"use client"

import { AgentMemoriesCard } from "@/features/ai/components/memories/AgentMemoriesCard"
import { SelfMemorySwitch } from "@/features/ai/components/memories/SelfMemorySwitch"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/**
 * Seção "Memórias" do agente desenvolvedor (OPE-97; Engramind desde a OPE-104), compartilhada pela aba
 * Agente Desenvolvedor (aprendizado autônomo, globais e Memórias do Opex) e pela página da central (as
 * da central e, abaixo, as globais e as do Opex). Salva sozinha, com tempo real; a mudança vale a
 * partir do próximo turno da mesa ou do fork.
 */
export function DeveloperMemoriesSection({ centralId }: { centralId?: string }) {
    useMemoriesRealtime(true)
    return (
        <div className="flex flex-col gap-6">
            {!centralId && <SelfMemorySwitch consumer="desenvolvedor" />}
            {centralId && <AgentMemoriesCard agentId="developer-central" centralId={centralId} />}
            <AgentMemoriesCard agentId="developer-global" />
            <AgentMemoriesCard agentId="app-global" />
        </div>
    )
}
