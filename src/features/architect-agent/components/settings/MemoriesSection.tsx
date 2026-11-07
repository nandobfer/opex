"use client"

import { MemoryUniverseSection } from "@/features/ai/components/memories/MemoryUniverseSection"
import { SelfMemorySwitch } from "@/features/ai/components/memories/SelfMemorySwitch"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/**
 * Seção "Memórias" do Agente Arquiteto: o aprendizado autônomo e o universo único do agente (OPE-148): a lista `architect` (canal do
 * Engramind que entra nas instruções de toda geração) e as Memórias do Opex, com tempo real.
 */
export function MemoriesSection() {
    useMemoriesRealtime(true)
    return (
        <div className="flex flex-col gap-6">
            <SelfMemorySwitch consumer="arquiteto" />
            <MemoryUniverseSection consumer="arquiteto" />
        </div>
    )
}
