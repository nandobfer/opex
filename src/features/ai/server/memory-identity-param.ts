import { DomainError } from "@/lib/api/route"
import { MEMORY_IDENTITIES, type MemoryIdentity } from "../agents"

/** Identidade de memórias vinda da URL (`opex`, `secretario`, `mentor`...); outra coisa é 404. */
export function memoryIdentityParam(raw: string): MemoryIdentity {
    const value = decodeURIComponent(raw)
    if (!(MEMORY_IDENTITIES as readonly string[]).includes(value)) throw new DomainError(404, "Agente de memórias desconhecido", "MEMORY_AGENT_UNKNOWN")
    return value as MemoryIdentity
}
