import { ageColor, ageRatios, lastRealUseOf, lastUseOf, memoryUses, particleBrightness, particleColor, particleSize, PARTICLE_MAX_PX } from "./network-math"
import type { MemoryUsageMap, NetworkMemory } from "./types"

/** Aparência calculada de uma partícula de memória (módulo puro, OPE-109). */
export interface ParticleVisual {
    id: string
    size: number
    /** Cor final (idade apagada pelo brilho). */
    color: string
    /** Cor da idade, sem o brilho. */
    ageColor: string
    brightness: number
    uses: number
    /** Data usada no brilho (cai na criação). */
    lastUse: string
    /** Último uso real (`null` = nunca usada). */
    lastRealUse: string | null
    pinned: boolean
    archived: boolean
}

/** Crescimento local por consumo ao vivo, até a releitura dos contadores. */
export const LIVE_BUMP_PX = 2

/**
 * Escala relativa ao universo visível: cor pela idade (mais nova verde, mais antiga roxa), tamanho
 * logarítmico pelo uso e brilho pelo prazo do consolidador. A escala considera todas as memórias do
 * universo, inclusive as que a busca apaga (o destaque não recalcula nada).
 */
export function buildParticles(memories: readonly NetworkMemory[], options: { usage?: MemoryUsageMap; staleAfterDays: number; bumps?: Record<string, number>; now?: number }): Map<string, ParticleVisual> {
    const ages = ageRatios(memories)
    const maxUses = memories.reduce((max, memory) => Math.max(max, memoryUses(memory)), 0)
    const now = options.now ?? Date.now()
    const result = new Map<string, ParticleVisual>()
    for (const memory of memories) {
        const uses = memoryUses(memory)
        const lastUse = lastUseOf(memory, options.usage)
        const brightness = particleBrightness({ status: memory.status, stale: memory.stale, lastUse }, options.staleAfterDays, now)
        const base = ageColor(ages.get(memory.id) ?? 0)
        const bump = (options.bumps?.[memory.id] ?? 0) * LIVE_BUMP_PX
        result.set(memory.id, {
            id: memory.id,
            size: Math.min(PARTICLE_MAX_PX + 4 * LIVE_BUMP_PX, particleSize(uses, maxUses) + bump),
            color: memory.status === "archived" ? "var(--color-muted-foreground)" : particleColor(base, brightness),
            ageColor: base,
            brightness,
            uses,
            lastUse,
            lastRealUse: lastRealUseOf(memory, options.usage),
            pinned: memory.status === "permanent",
            archived: memory.status === "archived",
        })
    }
    return result
}
