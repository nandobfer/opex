import { describe, expect, it } from 'vitest'
import { buildSampleRelated, buildSampleUniverse, SAMPLE_AGENT, SAMPLE_RELATED_MAX, SAMPLE_UNIVERSE_LIMITS } from '@/features/engramind/network/sample-universe'

/** OPE-142: o universo de exemplo da prévia da aba Visualização. */

describe('universo de exemplo da prévia', () => {
  it('gera a quantidade de memórias e de canais pedida, distribuídas entre os canais', () => {
    const { memories, channels } = buildSampleUniverse(120, 3)
    expect(memories).toHaveLength(120)
    expect(channels).toEqual(['exemplo/canal-1', 'exemplo/canal-2', 'exemplo/canal-3'])
    expect(new Set(memories.map((memory) => memory.channel))).toEqual(new Set(channels))
    expect(new Set(memories.map((memory) => memory.id)).size).toBe(120)
  })

  it('é determinístico: ids, canais, usos e idades iguais em toda chamada', () => {
    const strip = (list: ReturnType<typeof buildSampleUniverse>['memories']) => list.map(({ id, channel, retrievals, injections, status }) => ({ id, channel, retrievals, injections, status }))
    expect(strip(buildSampleUniverse(60, 4).memories)).toEqual(strip(buildSampleUniverse(60, 4).memories))
  })

  it('varia o uso, a idade e o estado das memórias (fixadas e inativas aparecem)', () => {
    const { memories } = buildSampleUniverse(500, 5)
    expect(new Set(memories.map((memory) => memory.retrievals)).size).toBeGreaterThan(10)
    expect(new Set(memories.map((memory) => memory.createdAt)).size).toBeGreaterThan(100)
    expect(memories.some((memory) => memory.status === 'permanent')).toBe(true)
    expect(memories.some((memory) => memory.status === 'archived')).toBe(true)
  })

  it('limita a quantidade e os canais aos máximos da prévia', () => {
    const { memories, channels } = buildSampleUniverse(99999, 99)
    expect(memories).toHaveLength(SAMPLE_UNIVERSE_LIMITS.count.max)
    expect(channels).toHaveLength(SAMPLE_UNIVERSE_LIMITS.channels.max)
    expect(buildSampleUniverse(0, 0).memories).toHaveLength(SAMPLE_UNIVERSE_LIMITS.count.min)
  })

  it('OPE-164: similares fictícias determinísticas, do mesmo canal, até 3 e nunca a própria memória', () => {
    const { memories } = buildSampleUniverse(120, 3)
    const related = buildSampleRelated(memories)
    expect(related).toEqual(buildSampleRelated(buildSampleUniverse(120, 3).memories))
    const channelOf = new Map(memories.map((memory) => [memory.id, memory.channel]))
    expect(related.size).toBeGreaterThan(60)
    for (const [id, hits] of related) {
      expect(hits.length).toBeLessThanOrEqual(SAMPLE_RELATED_MAX)
      for (const hit of hits) {
        expect(hit.id).not.toBe(id)
        expect(channelOf.get(hit.id)).toBe(channelOf.get(id))
        expect(hit.score).toBeGreaterThan(0)
        expect(hit.score).toBeLessThanOrEqual(1)
      }
    }
  })

  it('OPE-164: algumas memórias são do agente de exemplo (o link do autor aparece na prévia)', () => {
    const { memories } = buildSampleUniverse(120, 3)
    expect(memories.some((memory) => memory.authorAgent === SAMPLE_AGENT)).toBe(true)
    expect(memories.some((memory) => !memory.authorAgent)).toBe(true)
  })
})
