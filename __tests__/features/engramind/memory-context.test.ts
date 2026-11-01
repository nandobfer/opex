import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'
import { createFakeEngramind, type FakeEngramind } from '../../helpers/fake-engramind'

/**
 * OPE-104: contexto das memórias de cada agente (Engramind ao vivo, If-None-Match e cache de reserva).
 * OPE-109: formato `tagged` (com ids) e o consumo ao vivo publicado só com ids.
 */

const TAGGED = ['<memories version="cv_1">', '<channel slug="opex">', '<PROJECT_RULES>', '#m_1: Use pnpm.', '</PROJECT_RULES>', '</channel>', '<channel slug="agentes/desenvolvedor/global">', '<NAMING>', '#m_2: Nomes em pt-BR.', '</NAMING>', '</channel>', '<titles>', '#m_3: Título só', '</titles>', '</memories>'].join('\n')

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeEngramind, token: 'agent-token' as string | null, headers: [] as (Record<string, string> | undefined)[] }))
const store = vi.hoisted(() => ({ cache: null as unknown as ReturnType<typeof import('../../helpers/memory-model').memoryModel>, state: null as unknown as ReturnType<typeof import('../../helpers/memory-model').memoryModel> }))
vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: (method: string, request: { path: string }, options: { headers?: Record<string, string>; target?: { token: string } }) => {
    holder.headers.push(options.headers)
    if (options.headers?.['If-None-Match'] === holder.fake.state.context.version && !holder.fake.state.contextFails) return Promise.resolve(null)
    return holder.fake.engramindCall(method, request as never, options)
  },
}))
vi.mock('@/features/engramind/server/memory-network', () => ({ agentTarget: async () => (holder.token ? { baseUrl: 'http://e', token: holder.token } : null) }))
vi.mock('@/features/engramind/server/shared', () => ({ engramindLog: { info: vi.fn(), warn: vi.fn() }, publishEngramind: vi.fn(async () => undefined) }))
const consumption = vi.hoisted(() => ({ publishConsumption: vi.fn(async () => undefined) }))
vi.mock('@/features/engramind/server/consumption', () => consumption)
vi.mock('@/features/engramind/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  store.cache = memoryModel()
  store.state = memoryModel()
  return { ENGRAMIND_STATE_ID: 'engramind', engramindDb: async () => undefined, EngramindContextCache: store.cache, EngramindState: store.state }
})

import { getAgentMemoryContext } from '@/features/engramind/server/memory-context'

const channels = ['opex', 'agentes/desenvolvedor/global']

beforeEach(() => {
  holder.fake = createFakeEngramind()
  holder.fake.state.context = { content: TAGGED, version: 'cv_1', counts: { full: 2, titles: 1, overflow: 0 } }
  consumption.publishConsumption.mockClear()
  holder.token = 'agent-token'
  holder.headers = []
  store.cache.docs.length = 0
  store.state.docs.length = 0
})

describe('contexto das memórias', () => {
  it('ao vivo: pede o bloco tagged dos canais do turno com o token do agente e grava o cache com os ids', async () => {
    const result = await getAgentMemoryContext('desenvolvedor', channels)
    expect(result).toMatchObject({ block: TAGGED, source: 'live', counts: { full: 2 } })
    const call = holder.fake.state.calls.find((item) => item.path === '/v1/context')!
    expect(call.query).toEqual({ channels: 'opex,agentes/desenvolvedor/global', format: 'tagged' })
    expect(call.token).toBe('agent-token')
    expect(store.cache.docs).toHaveLength(1)
    expect(store.cache.docs[0]).toMatchObject({ format: 'tagged', memoryIds: ['m_1', 'm_2'], delivered: ['opex', 'agentes/desenvolvedor/global'] })
  })

  it('publica o consumo do contexto só com ids e slugs (a faixa de títulos não conta)', async () => {
    await getAgentMemoryContext('desenvolvedor', channels)
    await vi.waitFor(() => expect(consumption.publishConsumption).toHaveBeenCalledTimes(1))
    const event = consumption.publishConsumption.mock.calls[0]![0] as Record<string, unknown>
    expect(event).toEqual({ agent: 'opex/desenvolvedor', kind: 'context', channels, delivered: ['opex', 'agentes/desenvolvedor/global'], memoryIds: ['m_1', 'm_2'] })
    expect(JSON.stringify(event)).not.toContain('Use pnpm')
  })

  it('segundo turno manda If-None-Match; 304 reaproveita o bloco do cache e anima do mesmo jeito', async () => {
    await getAgentMemoryContext('desenvolvedor', channels)
    const again = await getAgentMemoryContext('desenvolvedor', channels)
    expect(holder.headers.at(-1)).toEqual({ 'If-None-Match': 'cv_1' })
    expect(again).toMatchObject({ block: TAGGED, source: 'live' })
    await vi.waitFor(() => expect(consumption.publishConsumption).toHaveBeenCalledTimes(2))
    expect((consumption.publishConsumption.mock.calls[1]![0] as { memoryIds: string[] }).memoryIds).toEqual(['m_1', 'm_2'])
  })

  it('cache antigo em markdown (antes da OPE-109) não manda If-None-Match: relê o bloco tagged', async () => {
    await getAgentMemoryContext('desenvolvedor', channels)
    const doc = store.cache.docs[0] as Record<string, unknown>
    doc.format = 'markdown'
    delete doc.memoryIds
    await getAgentMemoryContext('desenvolvedor', channels)
    expect(holder.headers.at(-1)).toBeUndefined()
    expect(store.cache.docs[0]).toMatchObject({ format: 'tagged', memoryIds: ['m_1', 'm_2'] })
  })

  it('cache por indisponibilidade e turno sem memórias não publicam consumo', async () => {
    await getAgentMemoryContext('desenvolvedor', channels)
    await vi.waitFor(() => expect(consumption.publishConsumption).toHaveBeenCalledTimes(1))
    holder.fake.state.contextFails = true
    expect((await getAgentMemoryContext('desenvolvedor', channels)).source).toBe('cache')
    holder.fake.state.contextFails = false
    holder.fake.state.context = { content: '<memories version="cv_2">\n</memories>', version: 'cv_2', counts: { full: 0, titles: 0, overflow: 0 } }
    await getAgentMemoryContext('adversario', ['opex', 'agentes/adversario'])
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(consumption.publishConsumption).toHaveBeenCalledTimes(1)
  })

  it('falha ao publicar o consumo não derruba o turno', async () => {
    consumption.publishConsumption.mockRejectedValueOnce(new Error('pusher fora'))
    const result = await getAgentMemoryContext('desenvolvedor', channels)
    expect(result.source).toBe('live')
  })

  it('Engramind fora do ar: usa o último cache e registra a indisponibilidade; sem cache, roda sem memórias', async () => {
    await getAgentMemoryContext('desenvolvedor', channels)
    holder.fake.state.contextFails = true
    const cached = await getAgentMemoryContext('desenvolvedor', channels)
    expect(cached).toMatchObject({ block: TAGGED, source: 'cache' })
    expect(cached.cachedAt).not.toBeNull()
    expect((store.state.docs[0] as { memoryContext: { unavailableSince: Date | null } }).memoryContext.unavailableSince).not.toBeNull()
    const none = await getAgentMemoryContext('adversario', ['opex', 'agentes/adversario'])
    expect(none).toMatchObject({ block: '', source: 'none' })
  })

  it('sem token do agente: não lança, cai em "sem memórias" com o motivo', async () => {
    holder.token = null
    const result = await getAgentMemoryContext('opex', ['opex'])
    expect(result.source).toBe('none')
    expect(result.reason).toContain('token do agente')
  })
})
