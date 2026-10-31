import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { _id: string; agentId: string; centralId?: string | null; texto: string; resumo: string; createdBy: string; updatedBy: string; createdAt: Date; updatedAt: Date }

const store = vi.hoisted(() => ({ rows: [] as Row[], seq: 0, clock: 0, centrals: [] as { id: string; projectName: string }[] }))
const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => undefined),
  publishToChannels: vi.fn(async () => undefined),
  formatMemory: vi.fn(async (texto: string) => ({ texto, resumo: texto.split('.')[0]!, formatadaPorIa: false })),
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishToChannels: mocks.publishToChannels }))
vi.mock('@/features/ai/server/memory-summary', () => ({ formatMemory: mocks.formatMemory }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticCentral: { exists: async (query: { _id: string }) => (store.centrals.some((central) => central.id === query._id) ? { _id: query._id } : null) } }))
vi.mock('@/features/agentic/server/centrals', () => ({ listCentrals: async () => store.centrals.map((central) => ({ ...central })) }))
vi.mock('@/lib/db/models/AgentMemory', () => {
  const matches = (row: Row, query: Record<string, unknown>): boolean =>
    Object.entries(query).every(([key, value]) => {
      if (key === '$or') return (value as Record<string, unknown>[]).some((part) => matches(row, part))
      const field = (row as unknown as Record<string, unknown>)[key]
      if (value && typeof value === 'object' && '$in' in value) return (value.$in as unknown[]).includes(field)
      return String(field) === String(value)
    })
  const chain = (rows: Row[]) => {
    let out = [...rows]
    const api = {
      sort: (spec: Record<string, number>) => {
        const [key, dir] = Object.entries(spec)[0]!
        out.sort((a, b) => ((a as unknown as Record<string, Date>)[key]!.getTime() - (b as unknown as Record<string, Date>)[key]!.getTime()) * dir)
        return api
      },
      limit: (count: number) => {
        out = out.slice(0, count)
        return api
      },
      select: () => api,
      lean: async () => out.map((row) => ({ ...row })),
    }
    return api
  }
  const AgentMemory = {
    find: (query: Record<string, unknown>) => chain(store.rows.filter((row) => matches(row, query))),
    findOne: (query: Record<string, unknown>) => ({ lean: async () => store.rows.find((row) => matches(row, query)) ?? null }),
    countDocuments: async (query: Record<string, unknown>) => store.rows.filter((row) => matches(row, query)).length,
    create: async (doc: Omit<Row, '_id'>) => {
      const row = { ...doc, _id: (++store.seq).toString(16).padStart(24, '0'), createdAt: new Date(++store.clock), updatedAt: new Date(store.clock) }
      store.rows.push(row)
      return { toObject: () => ({ ...row }) }
    },
    findOneAndUpdate: (query: Record<string, unknown>, update: { $set: Partial<Row> }) => ({
      lean: async () => {
        const row = store.rows.find((item) => matches(item, query))!
        Object.assign(row, update.$set)
        return { ...row }
      },
    }),
    deleteOne: async (query: Record<string, unknown>) => {
      store.rows = store.rows.filter((row) => !matches(row, query))
    },
    deleteMany: async (query: Record<string, unknown>) => {
      const before = store.rows.length
      store.rows = store.rows.filter((row) => !matches(row, query))
      return { deletedCount: before - store.rows.length }
    },
  }
  return { AgentMemory }
})

import { agentMemoryTexts, createAgentMemory, deleteAgentMemory, deleteCentralMemories, developerMemoryTexts, getAgentMemory, listAgentMemories, memoriesSection, updateAgentMemory } from '@/features/ai/server/agent-memory-service'
import { memoryTools } from '@/features/opex-agent/server/tools/memories'
import { aiAgentsOfTab, opexMemoryAgentsFor } from '@/features/ai/agents'

const run = (name: string, raw: unknown) => {
  const tool = memoryTools.find((item) => item.name === name)!
  return (tool.execute as (input: unknown, context: { sessionId: string; actorId: string }) => Promise<Record<string, unknown>>)(tool.input.parse(raw), { sessionId: 's1', actorId: 'local' })
}

beforeEach(() => {
  vi.clearAllMocks()
  store.rows = []
  store.seq = 0
  store.centrals = []
})

const C1 = 'c0000000000000000000000a'
const C2 = 'c0000000000000000000000b'

describe('memórias do Agente Opex', () => {
  it('criar, editar e excluir: formatação, auditoria, tempo real e autor (dono)', async () => {
    const created = await createAgentMemory('opex-global', 'Responda sempre em pt-BR. Seja breve.', 'local')
    expect(created).toMatchObject({ formatadaPorIa: false, memoria: { texto: 'Responda sempre em pt-BR. Seja breve.', resumo: 'Responda sempre em pt-BR', autor: 'Usuário local' } })
    mocks.formatMemory.mockResolvedValueOnce({ texto: 'Cite o código.', resumo: 'Cite o código', formatadaPorIa: true })
    const updated = await updateAgentMemory('opex-global', created.memoria.id, 'cite o codigo', 'local')
    expect(updated).toMatchObject({ formatadaPorIa: true, memoria: { texto: 'Cite o código.' } })
    expect(mocks.publishToChannels).toHaveBeenCalledWith(['private-integration-ai'], 'ai-memories-updated', { agentId: 'opex-global' })
    await deleteAgentMemory('opex-global', created.memoria.id, 'local')
    expect(await listAgentMemories('opex-global')).toEqual([])
    expect(mocks.recordAudit.mock.calls.map((call) => (call as unknown as [{ acao: string }])[0].acao)).toEqual(['CRIAR', 'ATUALIZAR', 'EXCLUIR'])
  })

  it('lista desconhecida, texto inválido e memória de outra lista', async () => {
    await expect(listAgentMemories('sales-agent')).rejects.toMatchObject({ status: 404, code: 'AI_AGENT_NOT_FOUND' })
    await expect(createAgentMemory('opex-owner', 'x', 'local')).rejects.toMatchObject({ status: 400 })
    const owner = await createAgentMemory('opex-owner', 'Só do dono.', 'local')
    await expect(updateAgentMemory('opex-client', owner.memoria.id, 'Outra lista', 'local')).rejects.toMatchObject({ status: 404 })
  })

  it('sem limite de quantidade: cria além das antigas 50 por lista e todas entram no prompt', async () => {
    for (let index = 1; index <= 51; index += 1) await createAgentMemory('opex-owner', `Memória ${index}`, 'local')
    expect(await listAgentMemories('opex-owner')).toHaveLength(51)
    expect(await agentMemoryTexts(['opex-owner'])).toHaveLength(51)
  })

  it('origem opcional: fica no documento e no DTO, nunca no texto, e vai para a auditoria com o contexto', async () => {
    const created = await createAgentMemory('adversarial', 'Confira testes de tela.', 'local', { origin: { source: 'mentor', label: 'Mentor · OPE-1' }, auditContext: { mesa: 'w1' } })
    expect(created.memoria.origin).toEqual({ source: 'mentor', label: 'Mentor · OPE-1' })
    expect(created.memoria.texto).not.toContain('Mentor')
    expect(mocks.recordAudit.mock.calls.at(-1)?.[0]).toMatchObject({ acao: 'CRIAR', depois: { agente: 'adversarial', origem: 'Mentor · OPE-1', mesa: 'w1' } })
    const plain = await createAgentMemory('adversarial', 'Sem origem.', 'local')
    expect(plain.memoria.origin).toBeNull()
    const updated = await updateAgentMemory('adversarial', plain.memoria.id, 'Fundida pelo Mentor.', 'local', { origin: { source: 'mentor', label: 'Mentor · OPE-2' } })
    expect(updated.memoria.origin).toEqual({ source: 'mentor', label: 'Mentor · OPE-2' })
  })

  it('prompt: dono recebe globais + do dono; portal recebe globais + do cliente, em ordem', async () => {
    await createAgentMemory('opex-owner', 'Regra do dono.', 'local')
    await createAgentMemory('opex-global', 'Regra global.', 'local')
    await createAgentMemory('opex-client', 'Regra do cliente.', 'local')
    expect(await agentMemoryTexts(opexMemoryAgentsFor('owner'))).toEqual(['Regra global.', 'Regra do dono.'])
    expect(await agentMemoryTexts(opexMemoryAgentsFor('client'))).toEqual(['Regra global.', 'Regra do cliente.'])
    expect(memoriesSection([])).toBe('')
    expect(memoriesSection(['Linha\num'])).toContain('- Linha um')
  })

  it('ferramentas do agente gerenciam as três listas', async () => {
    const created = await run('create_agent_memory', { agent: 'opex-client', text: 'Seja cordial com o cliente.' })
    expect(created).toMatchObject({ ok: true, agent: 'opex-client', agentLabel: 'Memórias do cliente', formattedByAi: false })
    await run('create_agent_memory', { agent: 'opex-global', text: 'Liste antes de alterar.' })
    const all = (await run('list_agent_memories', {})) as { total: number; agents: { agent: string; items: unknown[] }[] }
    expect(all.total).toBe(2)
    expect(all.agents.map((list) => [list.agent, list.items.length])).toEqual([['opex-global', 1], ['opex-owner', 0], ['opex-client', 1], ['maddox-global', 0], ['maddox-owner', 0], ['maddox-client', 0], ['adversarial', 0], ['developer-global', 0]])
    const id = created.id as string
    expect(await run('get_agent_memory', { agent: 'opex-client', memoryId: id })).toMatchObject({ text: 'Seja cordial com o cliente.' })
    expect(await run('update_agent_memory', { agent: 'opex-client', memoryId: id, text: 'Seja cordial e objetivo.' })).toMatchObject({ text: 'Seja cordial e objetivo.' })
    expect(await run('delete_agent_memory', { agent: 'opex-client', memoryId: id })).toMatchObject({ ok: true })
    expect(() => memoryTools[0]!.input.parse({ agent: 'opex-agent' })).toThrow()
  })

  it('o prompt do Agente Opex nunca recebe as memórias do Agente Adversário', async () => {
    await createAgentMemory('adversarial', 'X é intencional.', 'local')
    expect(await agentMemoryTexts(opexMemoryAgentsFor('owner'))).toEqual([])
    expect(await agentMemoryTexts(opexMemoryAgentsFor('client'))).toEqual([])
  })
})

describe('memórias do Agente Adversário', () => {
  it('lista própria (agentId "adversarial"): criar, listar e entrar só no prompt do adversário', async () => {
    const created = await createAgentMemory('adversarial', 'Validação X é intencional. Não aponte.', 'local')
    expect(created).toMatchObject({ memoria: { resumo: 'Validação X é intencional' } })
    expect(mocks.publishToChannels).toHaveBeenCalledWith(['private-integration-ai'], 'ai-memories-updated', { agentId: 'adversarial' })
    await createAgentMemory('opex-global', 'Regra global.', 'local')
    expect(await listAgentMemories('adversarial')).toHaveLength(1)
    expect(await agentMemoryTexts(['adversarial'])).toEqual(['Validação X é intencional. Não aponte.'])
  })

  it('as ferramentas do Agente Opex também gerenciam a lista do adversário', async () => {
    const created = await run('create_agent_memory', { agent: 'adversarial', text: 'Rotas sempre conferem permissões.' })
    expect(created).toMatchObject({ ok: true, agent: 'adversarial', agentLabel: 'Memórias do Agente Adversário' })
    const listed = (await run('list_agent_memories', { agent: 'adversarial' })) as { total: number }
    expect(listed.total).toBe(1)
  })

  it('regressão: a aba do Agente Opex não lista a memória do adversário (cada aba mostra as suas listas)', () => {
    expect(aiAgentsOfTab('agente-opex')).toEqual(['opex-global', 'opex-owner', 'opex-client'])
    expect(aiAgentsOfTab('agente-maddox')).toEqual(['maddox-global', 'maddox-owner', 'maddox-client'])
    expect(aiAgentsOfTab('agente-adversario')).toEqual(['adversarial'])
  })
})

describe('memórias do agente desenvolvedor (OPE-97)', () => {
  beforeEach(() => {
    store.centrals = [
      { id: C1, projectName: 'opex' },
      { id: C2, projectName: 'site' },
    ]
  })

  it('lista da central: isolada por central, com auditoria e tempo real levando o centralId', async () => {
    const created = await createAgentMemory('developer-central', 'Rode pnpm lint antes do PR.', 'local', { centralId: C1 })
    expect(created.memoria).toMatchObject({ centralId: C1, texto: 'Rode pnpm lint antes do PR.' })
    await createAgentMemory('developer-central', 'Use a pasta app/.', 'local', { centralId: C2 })
    expect((await listAgentMemories('developer-central', C1)).map((memory) => memory.texto)).toEqual(['Rode pnpm lint antes do PR.'])
    expect(mocks.publishToChannels).toHaveBeenCalledWith(['private-integration-ai'], 'ai-memories-updated', { agentId: 'developer-central', centralId: C1 })
    expect(mocks.recordAudit.mock.calls[0]?.[0]).toMatchObject({ acao: 'CRIAR', depois: { agente: 'developer-central', central: C1 } })
    // A memória de uma central não é alcançada pela outra.
    await expect(getAgentMemory('developer-central', created.memoria.id, C2)).rejects.toMatchObject({ status: 404 })
    await expect(updateAgentMemory('developer-central', created.memoria.id, 'Outra central', 'local', { centralId: C2 })).rejects.toMatchObject({ status: 404 })
    await expect(deleteAgentMemory('developer-central', created.memoria.id, 'local', C2)).rejects.toMatchObject({ status: 404 })
    expect(await updateAgentMemory('developer-central', created.memoria.id, 'Rode pnpm lint e tsc.', 'local', { centralId: C1 })).toMatchObject({ memoria: { texto: 'Rode pnpm lint e tsc.' } })
    await deleteAgentMemory('developer-central', created.memoria.id, 'local', C1)
    expect(await listAgentMemories('developer-central', C1)).toEqual([])
  })

  it('central obrigatória na lista da central, recusada nas demais e inexistente dá 404', async () => {
    await expect(listAgentMemories('developer-central')).rejects.toMatchObject({ status: 400, code: 'CENTRAL_REQUIRED' })
    await expect(createAgentMemory('developer-central', 'Sem central.', 'local')).rejects.toMatchObject({ status: 400, code: 'CENTRAL_REQUIRED' })
    await expect(listAgentMemories('developer-global', C1)).rejects.toMatchObject({ status: 400, code: 'CENTRAL_NOT_ALLOWED' })
    await expect(listAgentMemories('developer-central', 'c0000000000000000000000f')).rejects.toMatchObject({ status: 404, code: 'CENTRAL_NOT_FOUND' })
    await expect(listAgentMemories('developer-central', 'nao-e-id')).rejects.toMatchObject({ status: 404, code: 'CENTRAL_NOT_FOUND' })
  })

  it('prompt da central: globais e depois as da central, sem as de outra central nem as dos outros agentes', async () => {
    await createAgentMemory('developer-central', 'Da central 1.', 'local', { centralId: C1 })
    await createAgentMemory('developer-global', 'Global do desenvolvedor.', 'local')
    await createAgentMemory('developer-central', 'Da central 2.', 'local', { centralId: C2 })
    await createAgentMemory('opex-global', 'Do Agente Opex.', 'local')
    await createAgentMemory('adversarial', 'Do adversário.', 'local')
    expect(await developerMemoryTexts(C1)).toEqual(['Global do desenvolvedor.', 'Da central 1.'])
    expect(await developerMemoryTexts(C2)).toEqual(['Global do desenvolvedor.', 'Da central 2.'])
    // O Agente Opex não recebe as memórias do desenvolvedor.
    expect(await agentMemoryTexts(opexMemoryAgentsFor('owner'))).toEqual(['Do Agente Opex.'])
  })

  it('excluir a central remove só as memórias dela', async () => {
    await createAgentMemory('developer-central', 'Da central 1.', 'local', { centralId: C1 })
    await createAgentMemory('developer-central', 'Da central 2.', 'local', { centralId: C2 })
    await createAgentMemory('developer-global', 'Global.', 'local')
    expect(await deleteCentralMemories(C1)).toBe(1)
    expect(await developerMemoryTexts(C1)).toEqual(['Global.'])
    expect(await developerMemoryTexts(C2)).toEqual(['Global.', 'Da central 2.'])
    expect(await deleteCentralMemories(C1)).toBe(0)
  })

  it('ferramentas do Agente Opex: criar/editar/excluir na central e listar agrupado por central', async () => {
    const created = await run('create_agent_memory', { agent: 'developer-central', centralId: C1, text: 'Siga o AGENTS.md.' })
    expect(created).toMatchObject({ ok: true, agent: 'developer-central', centralId: C1, agentLabel: 'Memórias da central' })
    await run('create_agent_memory', { agent: 'developer-global', text: 'Escreva testes.' })
    const grouped = (await run('list_agent_memories', { agent: 'developer-central' })) as { total: number; agents: { centralId?: string; centralName?: string; items: unknown[] }[] }
    expect(grouped.agents.map((list) => [list.centralName, list.items.length])).toEqual([['opex', 1], ['site', 0]])
    const one = (await run('list_agent_memories', { agent: 'developer-central', centralId: C1 })) as { total: number }
    expect(one.total).toBe(1)
    const all = (await run('list_agent_memories', {})) as { total: number; agents: { agent: string }[] }
    expect(all.total).toBe(2)
    expect(all.agents.map((list) => list.agent)).toEqual(['opex-global', 'opex-owner', 'opex-client', 'maddox-global', 'maddox-owner', 'maddox-client', 'adversarial', 'developer-global', 'developer-central', 'developer-central'])
    const id = created.id as string
    expect(await run('update_agent_memory', { agent: 'developer-central', centralId: C1, memoryId: id, text: 'Siga o AGENTS.md sempre.' })).toMatchObject({ text: 'Siga o AGENTS.md sempre.' })
    await expect(run('get_agent_memory', { agent: 'developer-central', memoryId: id })).rejects.toMatchObject({ code: 'CENTRAL_REQUIRED' })
    expect(await run('delete_agent_memory', { agent: 'developer-central', centralId: C1, memoryId: id })).toMatchObject({ ok: true })
    await expect(run('list_agent_memories', { agent: 'developer-central', centralId: 'c0000000000000000000000f' })).rejects.toMatchObject({ status: 404 })
  })

  it('a aba Desenvolvimento agêntico mostra só as globais (as da central ficam na página da central)', () => {
    expect(aiAgentsOfTab('desenvolvimento-agentico')).toEqual(['developer-global'])
  })
})
