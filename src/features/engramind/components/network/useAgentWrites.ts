"use client"

import { useEffect, useMemo, useRef } from "react"
import { agentWritesOf, type AgentWrite } from "../../network/network-math"
import type { NetworkMemory } from "../../network/types"
import { useEnteringIds } from "./useEnteringIds"

/**
 * Memórias que um agente acabou de criar (OPE-113): ids que chegam depois da primeira carga
 * (`useEnteringIds`), com agente autor e criados há pouco (`agentWritesOf`). `onWrite` recebe as
 * criações uma vez, para a partícula verde do agente até o canal.
 */
export function useAgentWrites(memories: readonly NetworkMemory[], onWrite: (writes: AgentWrite[]) => void): void {
    const ids = useMemo(() => memories.map((memory) => memory.id), [memories])
    const memoriesRef = useRef(memories)
    const onWriteRef = useRef(onWrite)
    useEffect(() => {
        memoriesRef.current = memories
        onWriteRef.current = onWrite
    })
    useEnteringIds(ids, {
        onEnter: (fresh) => {
            const writes = agentWritesOf(fresh, memoriesRef.current)
            if (writes.length) onWriteRef.current(writes)
        },
    })
}
