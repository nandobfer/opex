import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'
import { createFakeEngramind, type FakeEngramind } from '../../helpers/fake-engramind'

/** OPE-104: contexto das memórias de cada agente (Engramind ao vivo, If-None-Match e cache de reserva). */

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
  holder.fake.state.context = { content: '- Use pnpm.', version: 'cv_1', counts: { full: 1, titles: 0, overflow: 0 } }
  holder.token = 'agent-token'
  holder.headers = []
  store.cache.docs.length = 0
  store.state.docs.length = 0
})

describe('contexto das memórias', () => {
  it('ao vivo: pede o markdown dos canais do turno com o token do agente e grava o cache', async () => {
    const result = await getAgentMemoryContext('desenvolvedor', channels)
    expect(result).toMatchObject({ block: '- Use pnpm.', source: 'live', counts: { full: 1 } })
    const call = holder.fake.state.calls.find((item) => item.path === '/v1/context')!
    expect(call.query).toEqual({ channels: 'opex,agentes/desenvolvedor/global', format: 'markdown' })
    expect(call.token).toBe('agent-token')
    expect(store.cache.docs).toHaveLength(1)
  })

  it('segundo turno manda If-None-Match; 304 reaproveita o bloco do cache', async () => {
    await getAgentMemoryContext('desenvolvedor', channels)
    const again = await getAgentMemoryContext('desenvolvedor', channels)
    expect(holder.headers.at(-1)).toEqual({ 'If-None-Match': 'cv_1' })
    expect(again).toMatchObject({ block: '- Use pnpm.', source: 'live' })
  })

  it('Engramind fora do ar: usa o último cache e registra a indisponibilidade; sem cache, roda sem memórias', async () => {
    await getAgentMemoryContext('desenvolvedor', channels)
    holder.fake.state.contextFails = true
    const cached = await getAgentMemoryContext('desenvolvedor', channels)
    expect(cached).toMatchObject({ block: '- Use pnpm.', source: 'cache' })
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
