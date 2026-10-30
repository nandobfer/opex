"use client"

import { AgentMemoriesCard } from "@/features/ai/components/memories/AgentMemoriesCard"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/**
 * Seção "Memórias" do agente desenvolvedor (OPE-97), compartilhada pela aba Desenvolvimento agêntico
 * (só as globais) e pela página da central (as da central e, abaixo, as globais). Salva sozinha (cada
 * memória grava na hora), com tempo real; a mudança vale a partir do próximo turno da mesa ou do fork.
 */
export function DeveloperMemoriesSection({ centralId }: { centralId?: string }) {
    useMemoriesRealtime(true)
    return (
        <div className="flex flex-col gap-6">
            {centralId && <AgentMemoriesCard agentId="developer-central" centralId={centralId} />}
            <AgentMemoriesCard agentId="developer-global" />
        </div>
    )
}
