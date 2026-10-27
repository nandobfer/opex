"use client"

import { AgentMemoriesCard } from "@/features/ai/components/memories/AgentMemoriesCard"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/**
 * Seção "Memórias" do Agente Adversário: a lista `adversarial` do módulo de memórias dos agentes
 * (entra nas instruções de toda revisão), com tempo real. O texto é revisado pelo "Resumo de memórias"
 * global; o Agente Opex também gerencia esta lista pelas ferramentas de memórias.
 */
export function MemoriesSection() {
    useMemoriesRealtime(true)
    return <AgentMemoriesCard agentId="adversarial" />
}
