import { describe, expect, it } from 'vitest'
import { readCache, writeCache, type CacheEntry } from '@/features/opencode-quota/server/go-cache'

/** Memória da assinatura OpenCode Go (OPE-180): toda gravação poda as vencidas e respeita o teto. */

const entry = (at: number, ttl: number, value = at): CacheEntry<number> => ({ at, expiresAt: at + ttl, value })

describe('writeCache', () => {
  it('nunca passa do teto: a entrada mais antiga sai primeiro', () => {
    const map = new Map<string, CacheEntry<number>>()
    for (let index = 0; index < 10; index++) {
      writeCache(map, `k${index}`, entry(index, 1_000), 3)
      expect(map.size).toBeLessThanOrEqual(3)
    }
    expect([...map.keys()]).toEqual(['k7', 'k8', 'k9'])
  })

  it('regravar uma chave a torna a mais nova (não conta duas vezes no teto)', () => {
    const map = new Map<string, CacheEntry<number>>()
    writeCache(map, 'a', entry(0, 1_000), 2)
    writeCache(map, 'b', entry(1, 1_000), 2)
    writeCache(map, 'a', entry(2, 1_000), 2)
    writeCache(map, 'c', entry(3, 1_000), 2)
    expect([...map.keys()]).toEqual(['a', 'c'])
  })

  it('descarta a entrada vencida na gravação seguinte, sem depender de leitura', () => {
    const map = new Map<string, CacheEntry<number>>()
    writeCache(map, 'velha', entry(0, 10), 100)
    writeCache(map, 'viva', entry(0, 1_000), 100)
    writeCache(map, 'nova', entry(50, 1_000), 100)
    expect([...map.keys()]).toEqual(['viva', 'nova'])
  })
})

describe('readCache', () => {
  it('devolve a entrada válida e tira a vencida do mapa', () => {
    const map = new Map<string, CacheEntry<number>>()
    writeCache(map, 'a', entry(0, 10, 7), 10)
    expect(readCache(map, 'a', 9)?.value).toBe(7)
    expect(readCache(map, 'a', 10)).toBeUndefined()
    expect(map.has('a')).toBe(false)
  })
})
