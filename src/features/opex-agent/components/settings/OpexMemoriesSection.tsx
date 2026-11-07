"use client"

import { MemoryUniverseSection } from "@/features/ai/components/memories/MemoryUniverseSection"
import { SelfMemorySwitch } from "@/features/ai/components/memories/SelfMemorySwitch"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/**
 * Seção "Memórias" de um agente de chat (Agente Opex ou Agente Maddox): o aprendizado autônomo e o universo
 * único do agente (OPE-148), com todas as memórias que ele alcança — Memórias do Opex, globais, do dono, do
 * portal e as de cada cliente (rotuladas pelo nome do cliente) —, com tempo real.
 */
export function OpexMemoriesSection({ tab = "agente-opex" }: { tab?: string }) {
    useMemoriesRealtime(true)
    const consumer = tab === "agente-maddox" ? "maddox" : "opex"
    return (
        <div className="flex flex-col gap-6">
            <SelfMemorySwitch consumer={consumer} />
            <MemoryUniverseSection consumer={consumer} />
        </div>
    )
}
