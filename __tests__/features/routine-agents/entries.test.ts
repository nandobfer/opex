import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection, type FakeCollection } from '../../helpers/fake-collection'

/**
 * Entradas do dono (OPE-130/OPE-149): a listagem de um agente traz as dele e as de "Todos os rotineiros"
 * de qualquer agente; as de "Este agente" não vazam para os outros.
 */

const holder = vi.hoisted(() => ({
  agents: null as unknown as FakeCollection,
  entries: null as unknown as FakeCollection,
  memories: [] as unknown[],
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: async () => undefined, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: async () => undefined }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/ai/server/agent-memory-service', () => ({
  createAgentMemory: async (list: string, text: string) => {
    holder.memories.push({ list, text })
    return { memoria: { id: `m_${holder.memories.length}` } }
  },
}))
vi.mock('@/lib/db/models/RoutineAgent', () => ({
  get RoutineAgent() {
    return holder.agents
  },
  get RoutineEntry() {
    return holder.entries
  },
}))

import { addRoutineEntry, listRoutineEntries } from '@/features/routine-agents/server/entries'

let agentA = ''
let agentB = ''
beforeEach(() => {
  holder.agents = createFakeCollection()
  holder.entries = createFakeCollection()
  holder.memories = []
  agentA = String(holder.agents.insert({ name: 'Vagas', slug: 'vagas' })._id)
  agentB = String(holder.agents.insert({ name: 'Outro', slug: 'outro' })._id)
})

const texts = async (agentId: string) => (await listRoutineEntries(agentId)).map((entry) => entry.text)

describe('listagem das entradas dos agentes rotineiros', () => {
  it('a entrada "Todos os rotineiros" gravada num agente aparece nos outros, com o canal global', async () => {
    await addRoutineEntry(agentA, { text: 'vale para todos', target: 'global' }, 'local')
    const list = await listRoutineEntries(agentB)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ text: 'vale para todos', target: 'global', channel: 'agentes/rotineiros/global' })
  })

  it('a entrada "Este agente" não vaza para outro agente', async () => {
    await addRoutineEntry(agentA, { text: 'só do A', target: 'agent' }, 'local')
    expect(await texts(agentB)).toEqual([])
    expect(await texts(agentA)).toEqual(['só do A'])
  })

  it('o agente criador vê a própria global uma única vez, sem duplicata', async () => {
    await addRoutineEntry(agentA, { text: 'global do A', target: 'global' }, 'local')
    await addRoutineEntry(agentA, { text: 'específica do A', target: 'agent' }, 'local')
    expect((await texts(agentA)).sort()).toEqual(['específica do A', 'global do A'])
  })

  it('ordena pelas mais recentes e mistura as globais de vários agentes', async () => {
    const at = (minutes: number) => new Date(Date.UTC(2026, 10, 7, 12, minutes))
    holder.entries.insert({ agentId: holder.agents.docs[0]!._id, target: 'agent', channel: 'agentes/rotineiros/vagas', text: 'a1', createdAt: at(1) })
    holder.entries.insert({ agentId: holder.agents.docs[1]!._id, target: 'global', channel: 'agentes/rotineiros/global', text: 'g2', createdAt: at(2) })
    holder.entries.insert({ agentId: holder.agents.docs[1]!._id, target: 'agent', channel: 'agentes/rotineiros/outro', text: 'b3', createdAt: at(3) })
    holder.entries.insert({ agentId: holder.agents.docs[0]!._id, target: 'global', channel: 'agentes/rotineiros/global', text: 'g4', createdAt: at(4) })
    expect(await texts(agentA)).toEqual(['g4', 'g2', 'a1'])
    expect(await texts(agentB)).toEqual(['g4', 'b3', 'g2'])
  })

  it('mantém o limite de 200 entradas', async () => {
    for (let i = 0; i < 205; i++) holder.entries.insert({ agentId: holder.agents.docs[1]!._id, target: 'global', channel: 'agentes/rotineiros/global', text: `g${i}`, createdAt: new Date(2026, 0, 1, 0, 0, i) })
    expect(await listRoutineEntries(agentA)).toHaveLength(200)
  })
})
