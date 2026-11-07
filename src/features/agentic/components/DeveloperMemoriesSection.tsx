"use client"

import { MemoryUniverseSection } from "@/features/ai/components/memories/MemoryUniverseSection"
import { SelfMemorySwitch } from "@/features/ai/components/memories/SelfMemorySwitch"
import { useMemoriesRealtime } from "@/features/ai/hooks/useMemories"

/**
 * Seção "Memórias" do agente desenvolvedor (OPE-97; Engramind desde a OPE-104; card único desde a OPE-148),
 * compartilhada pela aba Agente Desenvolvedor (aprendizado autônomo e o universo com todas as memórias do
 * agente) e pela página da central (o universo só com o que vale nela: Memórias do Opex, globais e as da
 * central). A mudança vale a partir do próximo turno da mesa ou do fork.
 */
export function DeveloperMemoriesSection({ centralId }: { centralId?: string }) {
    useMemoriesRealtime(true)
    return (
        <div className="flex flex-col gap-6">
            {!centralId && <SelfMemorySwitch consumer="desenvolvedor" />}
            <MemoryUniverseSection consumer="desenvolvedor" centralId={centralId} />
        </div>
    )
}
