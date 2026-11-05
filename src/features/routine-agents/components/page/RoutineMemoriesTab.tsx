"use client"

import { AgentMemoriesCard } from "@/features/ai/components/memories/AgentMemoriesCard"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/** Aba **Memórias**: as do canal próprio do agente e as do global dos rotineiros (editar e arquivar aqui). */
export function RoutineMemoriesTab({ agentId, slug }: { agentId: string; slug: string }) {
    useMemoriesRealtime(true)
    return (
        <div className="flex flex-col gap-6">
            <AgentMemoriesCard agentId="routine-specific" routine={{ id: agentId, slug }} />
            <AgentMemoriesCard agentId="routine-global" />
        </div>
    )
}
