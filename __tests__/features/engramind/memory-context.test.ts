import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'
import { createFakeEngramind, type FakeEngramind } from '../../helpers/fake-engramind'

/**
 * OPE-104: contexto das memórias de cada agente (Engramind ao vivo, If-None-Match e cache de reserva).
 * OPE-109: formato `tagged` (com ids) e o consumo ao vivo publicado só com ids.
 */

const TAGGED = ['<memories version="cv_1">', '<channel slug="opex">', '<PROJECT_RULES>', '#m_1: Use pnpm.', '</PROJECT_RULES>', '</channel>', '<channel slug="agentes/desenvolvedor/global">', '<NAMING>', '#m_2: Nomes em pt-BR.', '</NAMING>', '</channel>', '<titles>', '#m_3: Título só', '</titles>', '</memories>'].join('\n')

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeEngramind, token: 'agent-token' as string | null, headers: [] as (Record<string, string> | undefined)[] }))
const store = vi.hoisted(() => ({ cache: null as unknown as ReturnType<typeof import('../../helpers/memory-model').memoryModel>, state: null as unknown as ReturnType<typeof import('../../helpers/memory-model').memoryModel>, delivery: null as unknown as ReturnType<typeof import('../../helpers/memory-model').memoryModel> }))
vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: (method: string, request: { path: string }, options: { headers?: Record<string, string>; target?: { token: string } }) => {
    holder.headers.push(options.headers)
    if (options.headers?.['If-None-Match'] === holder.fake.state.context.version && !holder.fake.state.contextFails) return Promise.resolve(null)
    return holder.fake.engramindCall(method, request as never, options)
  },
}))
vi.mock('@/features/engramind/server/memory-network', () => ({ agentTarget: async () => (holder.token ? { baseUrl: 'http://e', token: holder.token } : null) }))
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }))
vi.mock('@/features/engramind/server/shared', () => ({ engramindLog: log, publishEngramind: vi.fn(async () => undefined) }))
vi.mock('@/features/engramind/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  store.cache = memoryModel()
  store.state = memoryModel()
  store.delivery = memoryModel()
  return { ENGRAMIND_STATE_ID: 'engramind', engramindDb: async () => undefined, EngramindContextCache: store.cache, EngramindState: store.state, EngramindDelivery: store.delivery }
})

import { getAgentMemoryContext } from '@/features/engramind/server/memory-context'

const channels = ['opex', 'agentes/desenvolvedor/global']

beforeEach(() => {
  holder.fake = createFakeEngramind()
  holder.fake.state.context = { content: TAGGED, version: 'cv_1', counts: { full: 2, titles: 1, overflow: 0 } }
  holder.token = 'agent-token'
  holder.headers = []
  store.cache.docs.length = 0
  store.state.docs.length = 0
  store.delivery.docs.length = 0
  log.info.mockClear()
  log.warn.mockClear()
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

  it('OPE-116: o consumo ao vivo não é publicado pelo Opex (vem do webhook memory.consumed); a última entrega fica registrada só com ids e slugs', async () => {
    await getAgentMemoryContext('desenvolvedor', channels)
    await vi.waitFor(() => expect(store.delivery.docs).toHaveLength(1))
    const delivery = store.delivery.docs[0] as Record<string, unknown>
    expect(delivery).toMatchObject({ fullIds: ['m_1', 'm_2'], titleIds: ['m_3'], channels, delivered: ['opex', 'agentes/desenvolvedor/global'], version: 'cv_1', source: 'live' })
    expect(JSON.stringify(delivery)).not.toContain('Use pnpm')
    await expect(import('@/features/engramind/server/consumption' as string)).rejects.toThrow()
  })

  it('segundo turno manda If-None-Match; 304 reaproveita o bloco do cache e registra a entrega como not-modified', async () => {
    await getAgentMemoryContext('desenvolvedor', channels)
    const again = await getAgentMemoryContext('desenvolvedor', channels)
    expect(holder.headers.at(-1)).toEqual({ 'If-None-Match': 'cv_1' })
    expect(again).toMatchObject({ block: TAGGED, source: 'live' })
    await vi.waitFor(() => expect(store.delivery.docs[0]).toMatchObject({ source: 'not-modified', fullIds: ['m_1', 'm_2'] }))
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

  it('OPE-117: manda o foco na query do GET /v1/context e devolve o focus_mode', async () => {
    const result = await getAgentMemoryContext('opex', ['opex'], { focus: 'como rodar os testes' })
    const call = holder.fake.state.calls.find((item) => item.path === '/v1/context')!
    expect(call.method).toBe('GET')
    expect(call.query).toMatchObject({ channels: 'opex', format: 'tagged', focus: 'como rodar os testes' })
    expect(result.focusMode).toBe('hybrid')
  })

  it('OPE-117: Engramind sem suporte ao foco (400) refaz sem foco e o turno segue', async () => {
    holder.fake.state.contextRejectsFocus = true
    const result = await getAgentMemoryContext('opex', ['opex'], { focus: 'foco qualquer' })
    const calls = holder.fake.state.calls.filter((item) => item.path === '/v1/context')
    expect(calls).toHaveLength(2)
    expect(calls[0]!.query?.focus).toBe('foco qualquer')
    expect(calls[1]!.query?.focus).toBeUndefined()
    expect(result).toMatchObject({ source: 'live', block: TAGGED, focusMode: null })
  })

  it('OPE-117: o texto do foco nunca vai para log, cache nem evento', async () => {
    holder.fake.state.contextRejectsFocus = true
    await getAgentMemoryContext('desenvolvedor', channels, { focus: 'SEGREDO-DO-FOCO detalhe' })
    await vi.waitFor(() => expect(store.delivery.docs).toHaveLength(1))
    const logged = JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls])
    expect(logged).not.toContain('SEGREDO-DO-FOCO')
    expect(JSON.stringify(store.cache.docs)).not.toContain('SEGREDO-DO-FOCO')
    expect(JSON.stringify(store.delivery.docs)).not.toContain('SEGREDO-DO-FOCO')
  })

  it('OPE-117: bloco com foco degradado (focus_mode text/none) não entra no cache', async () => {
    holder.fake.state.focusMode = 'none'
    const result = await getAgentMemoryContext('opex', ['opex'], { focus: 'algo' })
    expect(result.focusMode).toBe('none')
    expect(store.cache.docs).toHaveLength(0)
  })

  it('OPE-117: foco diferente do bloco em cache não manda If-None-Match', async () => {
    await getAgentMemoryContext('opex', ['opex'], { focus: 'primeiro' })
    await getAgentMemoryContext('opex', ['opex'], { focus: 'outro foco' })
    expect(holder.headers.at(-1)).toBeUndefined()
    await getAgentMemoryContext('opex', ['opex'], { focus: 'outro foco' })
    expect(holder.headers.at(-1)).toMatchObject({ 'If-None-Match': expect.any(String) })
  })

  it('OPE-117: grava a última entrega por consumidor (ids por faixa, canais e version) e sobrescreve no turno seguinte', async () => {
    await getAgentMemoryContext('desenvolvedor', channels)
    await vi.waitFor(() => expect(store.delivery.docs).toHaveLength(1))
    expect(store.delivery.docs[0]).toMatchObject({ _id: 'desenvolvedor', fullIds: ['m_1', 'm_2'], titleIds: ['m_3'], channels, version: 'cv_1', source: 'live' })
    expect(JSON.stringify(store.delivery.docs[0])).not.toContain('Use pnpm')
    holder.fake.state.context = { content: '<memories version="cv_9">\n</memories>', version: 'cv_9', counts: { full: 0, titles: 0, overflow: 4 } }
    await getAgentMemoryContext('desenvolvedor', channels)
    await vi.waitFor(() => expect((store.delivery.docs[0] as { version: string }).version).toBe('cv_9'))
    expect(store.delivery.docs).toHaveLength(1)
    expect(store.delivery.docs[0]).toMatchObject({ fullIds: [], overflow: 4 })
  })

  it('OPE-117: banco falhando ao gravar a entrega vira aviso, sem rejeição solta', async () => {
    const original = store.delivery.updateOne
    store.delivery.updateOne = vi.fn(async () => {
      throw new Error('mongo fora')
    }) as never
    const result = await getAgentMemoryContext('desenvolvedor', channels)
    expect(result.source).toBe('live')
    await vi.waitFor(() => expect(log.warn).toHaveBeenCalled())
    store.delivery.updateOne = original
  })
})
