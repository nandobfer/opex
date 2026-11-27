import { beforeEach, describe, expect, it, vi } from 'vitest'

/** App e espaço de nomes da instância (OPE-206): app pela chave, reserva gravada e decisão do modo dos nomes. */

const holder = vi.hoisted(() => ({
  whoami: { token_id: 'tk_1', app: { id: 'app_1', slug: 'bootstrap' } } as unknown,
  whoamiFails: false,
  state: {} as Record<string, unknown>,
  channels: [] as { slug: string }[],
  channelsFail: false,
}))

vi.mock('@/features/engramind/server/connection', () => ({
  fetchWhoami: async () => {
    if (holder.whoamiFails) throw new Error('Engramind fora')
    return holder.whoami
  },
}))
vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: async () => {
    if (holder.channelsFail) throw new Error('fora')
    return { channels: holder.channels, next_cursor: null }
  },
}))
vi.mock('@/features/engramind/server/models', () => ({
  ENGRAMIND_STATE_ID: 'engramind',
  engramindDb: async () => undefined,
  EngramindState: {
    findById: () => ({ select: () => ({ lean: async () => holder.state }) }),
    updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
      Object.assign(holder.state, update.$set)
    },
  },
}))

import { assertNoMemoryMaintenance, channelNamespace, instanceApp, isMemoryMaintenance, resetInstanceCache, setChannelNaming, setMemoryMaintenance } from '@/features/engramind/server/instance'

beforeEach(() => {
  holder.whoami = { token_id: 'tk_1', app: { id: 'app_1', slug: 'bootstrap' } }
  holder.whoamiFails = false
  holder.state = {}
  holder.channels = []
  holder.channelsFail = false
  resetInstanceCache()
})

describe('instanceApp', () => {
  it('chave do bootstrap vira o app opex; outra chave usa o próprio app', async () => {
    expect(await instanceApp()).toBe('opex')
    holder.whoami = { token_id: 'tk_7a8c69e7', app: { id: 'app_alf', slug: 'alfredopex' } }
    expect(await instanceApp()).toBe('alfredopex')
    expect(holder.state.instance).toMatchObject({ app: 'alfredopex', tokenId: 'tk_7a8c69e7' })
  })

  it('com o Engramind fora, usa a reserva gravada', async () => {
    holder.state = { instance: { app: 'alfredopex', tokenId: 'tk_x', resolvedAt: new Date() } }
    holder.whoamiFails = true
    expect(await instanceApp()).toBe('alfredopex')
  })

  it('sem reserva e sem Engramind, o erro sobe', async () => {
    holder.whoamiFails = true
    await expect(instanceApp()).rejects.toThrow('Engramind fora')
  })
})

describe('channelNamespace', () => {
  it('app opex com canais agentes/... fica nos nomes antigos (e grava a decisão)', async () => {
    holder.whoami = { token_id: 'tk_1', app: { id: 'app_19b5e9ea', slug: 'opex' } }
    holder.channels = [{ slug: 'opex' }, { slug: 'agentes/maddox/dono' }]
    expect(await channelNamespace()).toEqual({ app: 'opex', prefixed: false })
  })

  it('outro app já nasce com o nome do app', async () => {
    holder.whoami = { token_id: 'tk_7a8c69e7', app: { id: 'app_alf', slug: 'alfredopex' } }
    expect(await channelNamespace()).toEqual({ app: 'alfredopex', prefixed: true })
    // A decisão fica gravada uma vez (vale para as outras instâncias que compartilham o banco).
    expect(holder.state.channelNaming).toBe('prefixed')
  })

  it('app opex sem canais antigos usa o nome do app', async () => {
    holder.whoami = { token_id: 'tk_1', app: { id: 'app_19b5e9ea', slug: 'opex' } }
    holder.state = { channelNaming: null }
    expect(await channelNamespace()).toEqual({ app: 'opex', prefixed: true })
    expect(holder.state.channelNaming).toBe('prefixed')
  })

  it('o modo gravado vale e muda com a migração B (cache zerado)', async () => {
    holder.whoami = { token_id: 'tk_1', app: { id: 'app_19b5e9ea', slug: 'opex' } }
    holder.state = { channelNaming: 'legacy' }
    expect((await channelNamespace()).prefixed).toBe(false)
    await setChannelNaming('prefixed')
    expect((await channelNamespace()).prefixed).toBe(true)
  })
})

describe('manutenção (migração B)', () => {
  it('liga e desliga o portão; gravação recusada com ENGRAMIND_MIGRATING', async () => {
    expect(await isMemoryMaintenance()).toBe(false)
    await setMemoryMaintenance({ migrationId: 'mig1', startedAt: new Date() })
    expect(await isMemoryMaintenance()).toBe(true)
    await expect(assertNoMemoryMaintenance()).rejects.toMatchObject({ code: 'ENGRAMIND_MIGRATING', status: 503 })
    await setMemoryMaintenance(null)
    expect(await isMemoryMaintenance()).toBe(false)
  })
})
