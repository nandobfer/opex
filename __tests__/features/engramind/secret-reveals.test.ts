import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Cofre do "Ver token": cifrado, lido uma única vez e recusado depois do prazo (410). */

type Stored = { _id: string; sealed: unknown; title: string; expiresAt: Date }
const store = vi.hoisted(() => new Map<string, { _id: string; sealed: unknown; title: string; expiresAt: Date }>())

vi.mock('@/lib/db', () => ({ dbConnect: async () => {} }))
vi.mock('@/lib/crypto/secretBox', () => ({
  encryptSecret: (value: string) => ({ v: 1, data: Buffer.from(value).toString('base64').split('').reverse().join('') }),
  decryptSecret: (sealed: { data: string }) => Buffer.from(sealed.data.split('').reverse().join(''), 'base64').toString('utf8'),
}))
vi.mock('mongoose', async (original) => {
  const actual = await original<typeof import('mongoose')>()
  const fakeModel = {
    createIndexes: async () => {},
    create: async (doc: Stored) => {
      store.set(doc._id, { ...doc })
      return doc
    },
    // findOneAndDelete({ _id, expiresAt: { $gt: agora } }) como o Mongo: só apaga e devolve se ainda vale.
    findOneAndDelete: (filter: { _id: string; expiresAt: { $gt: Date } }) => ({
      lean: async () => {
        const doc = store.get(filter._id)
        if (!doc || !(doc.expiresAt.getTime() > filter.expiresAt.$gt.getTime())) return null
        store.delete(filter._id)
        return doc
      },
    }),
  }
  return { ...actual, models: {}, model: () => fakeModel }
})

import { consumeSecretReveal, createSecretReveal } from '@/features/opex-agent/server/secret-reveals'

describe('secret-reveals', () => {
  beforeEach(() => store.clear())

  it('guarda cifrado e devolve a ação do card com prazo', async () => {
    const action = await createSecretReveal('eng.tk_1.segredo', { title: 'Token eng.tk_1', label: 'Ver token', ttlMs: 600_000 })
    expect(action).toMatchObject({ kind: 'reveal-secret', label: 'Ver token', title: 'Token eng.tk_1' })
    expect(action.id).toMatch(/^rv_/)
    expect(Date.parse(action.expiresAt) - Date.now()).toBeGreaterThan(590_000)
    expect(JSON.stringify([...store.values()])).not.toContain('eng.tk_1.segredo')
  })

  it('a primeira leitura devolve o segredo; a segunda dá 410', async () => {
    const action = await createSecretReveal('eng.tk_1.segredo', { title: 'T', label: 'Ver token', ttlMs: 600_000 })
    expect(await consumeSecretReveal(action.id)).toEqual({ secret: 'eng.tk_1.segredo', title: 'T' })
    await expect(consumeSecretReveal(action.id)).rejects.toMatchObject({ status: 410, code: 'SECRET_REVEAL_GONE' })
  })

  it('vencido dá 410 mesmo sem ter sido lido', async () => {
    const action = await createSecretReveal('eng.tk_2.segredo', { title: 'T', label: 'Ver token', ttlMs: 600_000 })
    store.get(action.id)!.expiresAt = new Date(Date.now() - 1_000)
    await expect(consumeSecretReveal(action.id)).rejects.toMatchObject({ status: 410 })
  })

  it('id desconhecido dá 410', async () => {
    await expect(consumeSecretReveal('rv_inexistente00')).rejects.toMatchObject({ status: 410 })
  })
})
