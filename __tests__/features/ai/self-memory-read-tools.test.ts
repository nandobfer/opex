import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEngramind, type FakeEngramind } from '../../helpers/fake-engramind'

/** OPE-117: leitura da faixa de títulos (get_hints, get_memory, search_memories) com o token do agente e os canais do turno. */

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeEngramind, token: 'tk-agente' as string | null }))
vi.mock('@/features/engramind/server/client', () => ({ engramindCall: (...args: Parameters<FakeEngramind['engramindCall']>) => holder.fake.engramindCall(...args) }))
vi.mock('@/features/engramind/server/memory-network', () => ({ agentTarget: async () => (holder.token ? { baseUrl: 'http://eng', token: holder.token } : null) }))
vi.mock('@/features/ai/server/agent-memory-service', () => ({ createAgentMemory: vi.fn(), updateAgentMemory: vi.fn(), deleteAgentMemory: vi.fn(), listAgentMemories: vi.fn(async () => []) }))

import { selfMemoryTools, type SelfMemoryContext } from '@/features/ai/server/self-memory/tools'

const K = 'b'.repeat(24)
const OTHER = 'c'.repeat(24)
const ctx = (overrides: Partial<SelfMemoryContext> = {}): SelfMemoryContext => ({ consumer: 'opex', turn: { kind: 'owner' }, label: 'Agente Opex', turnKey: 't1', actorId: 'local', ...overrides })
const run = (context: SelfMemoryContext, name: string, input: Record<string, unknown>, write = true) => {
  const tool = selfMemoryTools(context, undefined, { write }).find((item) => item.name === name)!
  return tool.execute(tool.input.parse(input), { sessionId: 's', actorId: 'local' }) as Promise<Record<string, unknown>>
}

beforeEach(() => {
  holder.fake = createFakeEngramind()
  holder.token = 'tk-agente'
  for (const slug of ['opex', 'agentes/opex/global', 'agentes/opex/dono', 'agentes/opex/cliente', `agentes/opex/clientes/${K}`, `agentes/opex/clientes/${OTHER}`]) holder.fake.state.channels.set(slug, { slug, archived_at: null })
})

describe('leitura da memória própria', () => {
  it('as três ferramentas de leitura existem mesmo com o aprendizado desligado (e as de gravação somem)', () => {
    const names = selfMemoryTools(ctx(), undefined, { write: false }).map((tool) => tool.name)
    expect(names).toEqual(['get_hints', 'get_memory', 'search_memories'])
    expect(selfMemoryTools(ctx()).every((tool) => tool.name !== 'get_hints' || tool.risk === 'read')).toBe(true)
  })

  it('get_hints: só id, título e canal (nunca o texto), com o token do agente e os canais do turno', async () => {
    holder.fake.createMemory('agentes/opex/dono', { text: 'Rode os testes com vitest related' }, null).memory.title = 'Como rodar testes'
    const result = await run(ctx(), 'get_hints', { text: 'como rodar testes' })
    const call = holder.fake.state.calls.find((item) => item.path === '/v1/hints')!
    expect(call.token).toBe('tk-agente')
    expect(call.body).toMatchObject({ text: 'como rodar testes', channels: ['opex', 'agentes/opex/global', 'agentes/opex/dono'] })
    expect(result.dicas).toEqual([expect.objectContaining({ id: expect.stringMatching(/^m_/), canal: 'agentes/opex/dono' })])
    expect(JSON.stringify(result)).not.toContain('vitest related')
  })

  it('sem embeddings: dicas vazias e a reserva por busca textual encontra a memória com um trecho curto', async () => {
    holder.fake.state.embeddingsOff = true
    holder.fake.createMemory('opex', { text: `Deploy pelo workflow ci-cd ${'longo '.repeat(80)}` }, null)
    const hints = await run(ctx(), 'get_hints', { text: 'deploy' })
    expect(hints.dicas).toEqual([])
    expect(String(hints.dica)).toContain('search_memories')
    const search = await run(ctx(), 'search_memories', { query: 'deploy' })
    const rows = search.resultados as { trecho: string; canal: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.canal).toBe('opex')
    expect(rows[0]!.trecho.length).toBeLessThanOrEqual(240)
  })

  it('portal: get_memory de outro cliente é recusada (o canal é conferido no Opex) e as dicas não mostram o canal alheio', async () => {
    const mine = holder.fake.createMemory(`agentes/opex/clientes/${K}`, { text: 'Cliente K prefere relatórios semanais' }, null).memory
    const foreign = holder.fake.createMemory(`agentes/opex/clientes/${OTHER}`, { text: 'Cliente C relatórios mensais' }, null).memory
    const portal = ctx({ turn: { kind: 'client', clientId: K } })
    await expect(run(portal, 'get_memory', { memoryId: foreign.id })).rejects.toMatchObject({ code: 'SELF_MEMORY_NOT_FOUND' })
    expect(await run(portal, 'get_memory', { memoryId: mine.id })).toMatchObject({ id: mine.id, texto: 'Cliente K prefere relatórios semanais' })
    const hints = await run(portal, 'get_hints', { text: 'relatórios' })
    expect((hints.dicas as { canal: string }[]).map((hint) => hint.canal)).toEqual([`agentes/opex/clientes/${K}`])
  })

  it('Engramind fora do ar ou sem token: erro acionável, sem derrubar o turno', async () => {
    holder.fake.state.hintsFail = true
    await expect(run(ctx(), 'get_hints', { text: 'x' })).rejects.toMatchObject({ code: 'SELF_MEMORY_UNAVAILABLE' })
    holder.token = null
    await expect(run(ctx(), 'get_memory', { memoryId: 'm_1' })).rejects.toMatchObject({ code: 'SELF_MEMORY_UNAVAILABLE' })
  })

  it('não publica consumo nem grava cache (só leitura no Engramind)', async () => {
    await run(ctx(), 'search_memories', { query: 'nada' })
    expect(holder.fake.state.calls.every((call) => call.method === 'POST' && ['/v1/memories/search'].includes(call.path))).toBe(true)
  })
})
