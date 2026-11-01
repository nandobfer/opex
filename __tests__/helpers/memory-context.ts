import { vi } from 'vitest'
import { contextChannelsFor, type MemoryConsumer, type MemoryTurn } from '@/features/ai/agents'

/**
 * Mock do contexto das memórias (OPE-104): o bloco de cada turno é montado com os textos por canal do
 * Engramind (`blocks`), na ordem dos canais do turno. Use em `vi.mock('@/features/ai/server/agent-memory-context', …)`.
 */
export function memoryContextModule(blocks: Record<string, string[]> = {}, source: 'live' | 'cache' | 'none' = 'live') {
  const build = (consumer: MemoryConsumer, turn: MemoryTurn) => {
    const lines = contextChannelsFor(consumer, turn).flatMap((channel) => (blocks[channel] ?? []).map((text) => `- ${text}`))
    return { block: lines.join('\n'), source, cachedAt: source === 'cache' ? '2026-10-30T12:00:00.000Z' : null, counts: { full: lines.length, titles: 0, overflow: 0 }, reason: source === 'live' ? null : 'fora do ar' }
  }
  return {
    agentMemoryContext: vi.fn(async (consumer: MemoryConsumer, turn: MemoryTurn) => build(consumer, turn)),
    adversarialMemoryContext: vi.fn(async () => build('adversario', { kind: 'review' })),
    architectMemoryContext: vi.fn(async () => build('arquiteto', { kind: 'review' })),
    developerMemoryContext: vi.fn(async (centralId: string | null) => build('desenvolvedor', { kind: 'central', centralId })),
    getMemoriesMeta: vi.fn(),
  }
}

/** Mock do "Aprendizado autônomo" (desligado por padrão nos testes que não tratam dele). */
export function selfMemorySettingsModule(enabled = false) {
  return { selfMemoryEnabled: vi.fn(async () => enabled), loadSelfMemorySettings: vi.fn(), getSelfMemorySettings: vi.fn(), saveSelfMemorySettings: vi.fn() }
}
