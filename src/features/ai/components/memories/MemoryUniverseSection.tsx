"use client"

import { memoryUniverseOf } from "../../memory-universe"
import type { MemoryConsumer } from "../../agents"
import { AgentUniverseCard } from "./AgentUniverseCard"

/**
 * Universo único das memórias de um agente do Opex (OPE-148): um card só, com todas as memórias que o agente
 * alcança (na central, só as que valem nela). Substitui os cards por lista e o seletor de cliente: os canais
 * de cliente aparecem no universo com o nome do cliente.
 */
export function MemoryUniverseSection({ consumer, centralId }: { consumer: MemoryConsumer; centralId?: string | null }) {
    const def = memoryUniverseOf(consumer, { centralId })
    return <AgentUniverseCard agent={def.agent} description={def.description} defaultCreateChannel={def.defaultCreateChannel} channels={def.channels} noticesConsumer={consumer} />
}
