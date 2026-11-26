"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CONVERSATION_PARAM, conversationFocus } from "../memory-focus"
import { memoryUniverseOf } from "@/features/ai/memory-universe"
import { AgentUniverseCard } from "@/features/ai/components/memories/AgentUniverseCard"
import { MemoryUniverseSection } from "@/features/ai/components/memories/MemoryUniverseSection"
import { SelfMemorySwitch } from "@/features/ai/components/memories/SelfMemorySwitch"

/**
 * Aba Memórias do Agente Secretário: o universo do agente e, com `?conversa=<id>`, o universo só com o canal
 * global e o canal daquela conversa (Nova memória já cai no canal da conversa).
 */
export function SecretaryMemories() {
    const params = useSearchParams()
    const pathname = usePathname()
    const focus = conversationFocus(params.get(CONVERSATION_PARAM))
    const all = new URLSearchParams(params.toString())
    all.delete(CONVERSATION_PARAM)
    const def = memoryUniverseOf("secretario", {})
    return (
        <>
            <SelfMemorySwitch consumer="secretario" />
            {focus ? (
                <>
                    <Button asChild variant="outline" className="w-fit">
                        <Link href={`${pathname}?${all.toString()}`}>Ver as memórias de todas as conversas</Link>
                    </Button>
                    <AgentUniverseCard
                        key={focus.defaultCreateChannel}
                        agent={def.agent}
                        title="Memórias desta conversa"
                        description="Memórias globais do Secretário e as desta conversa."
                        defaultCreateChannel={focus.defaultCreateChannel}
                        channels={focus.channels}
                        noticesConsumer="secretario"
                        consumer="secretario"
                    />
                </>
            ) : (
                <MemoryUniverseSection consumer="secretario" />
            )}
        </>
    )
}
