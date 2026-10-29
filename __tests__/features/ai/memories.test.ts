import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { _id: string; agentId: string; texto: string; resumo: string; createdBy: string; updatedBy: string; createdAt: Date; updatedAt: Date }

const store = vi.hoisted(() => ({ rows: [] as Row[], seq: 0, clock: 0 }))
const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => undefined),
  publishToChannels: vi.fn(async () => undefined),
  formatMemory: vi.fn(async (texto: string) => ({ texto, resumo: texto.split('.')[0]!, formatadaPorIa: false })),
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishToChannels: mocks.publishToChannels }))
vi.mock('@/features/ai/server/memory-summary', () => ({ formatMemory: mocks.formatMemory }))
vi.mock('@/lib/db/models/AgentMemory', () => {
  const matches = (row: Row, query: Record<string, unknown>) =>
    Object.entries(query).every(([key, value]) => {
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
  }
  return { AgentMemory }
})

import { agentMemoryTexts, createAgentMemory, deleteAgentMemory, listAgentMemories, memoriesSection, updateAgentMemory } from '@/features/ai/server/agent-memory-service'
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
})

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
    expect(all.agents.map((list) => [list.agent, list.items.length])).toEqual([['opex-global', 1], ['opex-owner', 0], ['opex-client', 1], ['adversarial', 0]])
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
    expect(aiAgentsOfTab('agente-adversario')).toEqual(['adversarial'])
  })
})
