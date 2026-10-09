import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomId } from '@/lib/random-id'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => vi.unstubAllGlobals())

describe('randomId', () => {
  it('regressão: sem crypto.randomUUID (HTTP fora de localhost) gera UUID v4 com getRandomValues', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.map((_, i) => (i * 37) % 256) })
    const id = randomId()
    expect(id).toMatch(UUID_V4)
  })

  it('usa crypto.randomUUID quando existe e gera ids distintos', () => {
    expect(randomId()).toMatch(UUID_V4)
    expect(randomId()).not.toBe(randomId())
  })
})
