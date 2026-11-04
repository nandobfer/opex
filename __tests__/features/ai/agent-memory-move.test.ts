import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEngramind, type FakeEngramind } from '../../helpers/fake-engramind'

/** Mover memória de lista (OPE-132): o serviço usa o `move_memory` do Engramind, audita e avisa as duas listas. */

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeEngramind, fail: null as null | { code: string } }))
const mocks = vi.hoisted(() => ({ recordAudit: vi.fn(async () => undefined), publishToChannels: vi.fn(async () => undefined) }))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishToChannels: mocks.publishToChannels }))
vi.mock('@/features/engramind/server/client', async () => {
  const { toEngramindError } = await import('@/features/engramind/server/errors')
  return {
    engramindCall: (...args: Parameters<FakeEngramind['engramindCall']>) =>
      holder.fail && args[1].path.endsWith('/move') ? Promise.reject(toEngramindError(403, { code: holder.fail.code, message: holder.fail.code } as never)) : holder.fake.engramindCall(...args),
    engramindTarget: async () => ({ baseUrl: 'http://engramind', token: 'admin-token' }),
  }
})
vi.mock('@/features/engramind/server/memory-network', () => ({ agentTarget: async (consumer: string) => ({ baseUrl: 'http://engramind', token: `agent-token-${consumer}` }) }))
// A central da lista por central (`resolveList` confere a existência).
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticCentral: { findById: () => ({ select: () => ({ lean: async () => ({ projectName: 'App' }) }) }) } }))

import { createAgentMemory, moveAgentMemory } from '@/features/ai/server/agent-memory-service'

const ADVERSARIAL = 'agentes/adversario'
const GLOBAL = 'agentes/desenvolvedor/global'
const agent = { consumer: 'mentor' as const, label: 'Mentor · reorganização' }

beforeEach(() => {
  vi.clearAllMocks()
  holder.fail = null
  holder.fake = createFakeEngramind()
  for (const slug of [ADVERSARIAL, GLOBAL]) holder.fake.state.channels.set(slug, { slug, archived_at: null })
})

const create = async (text: string) => (await createAgentMemory('adversarial', text, 'local')).memoria.id

describe('moveAgentMemory', () => {
  it('move pelo Engramind e registra a auditoria com o ator do agente', async () => {
    const id = await create('Regra que muda de lista')
    mocks.publishToChannels.mockClear()
    const moved = await moveAgentMemory('adversarial', id, 'developer-global', 'local', { agent })
    expect(moved).toMatchObject({ id, texto: 'Regra que muda de lista' })
    expect(holder.fake.state.memories.get(id)!.channel).toBe(GLOBAL)
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entidadeId: id,
        acao: 'ATUALIZAR',
        antes: expect.objectContaining({ agente: 'adversarial' }),
        depois: expect.objectContaining({ agente: 'developer-global', acoes: ['mover'], ator: 'agente:mentor' }),
      }),
    )
    // As duas listas são avisadas.
    expect(mocks.publishToChannels).toHaveBeenCalledTimes(2)
  })

  it('memória escrita pelo dono continua podendo ser movida (não é exclusão nem inativação)', async () => {
    const centralId = 'a'.repeat(24)
    const channel = `agentes/desenvolvedor/central/${centralId}`
    holder.fake.state.channels.set(channel, { slug: channel, archived_at: null })
    const id = await create('Regra do dono')
    const moved = await moveAgentMemory('adversarial', id, 'developer-central', 'local', { to: { centralId }, agent })
    expect(moved.centralId).toBe(centralId)
    expect(holder.fake.state.memories.get(id)!.channel).toBe(channel)
  })

  it('destino com a mesma memória: 409 MEMORY_DUPLICATE, sem auditoria', async () => {
    const id = await create('Regra repetida')
    await createAgentMemory('developer-global', 'Regra repetida', 'local')
    mocks.recordAudit.mockClear()
    await expect(moveAgentMemory('adversarial', id, 'developer-global', 'local', { agent })).rejects.toMatchObject({ status: 409, code: 'MEMORY_DUPLICATE' })
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })

  it('token do Mentor sem alcance no destino: 403 MEMORY_MOVE_FORBIDDEN (pelo código do Engramind), sem fallback', async () => {
    const id = await create('Regra sem alcance')
    holder.fail = { code: 'CHANNEL_NOT_SUBSCRIBED' }
    await expect(moveAgentMemory('adversarial', id, 'developer-global', 'local', { agent })).rejects.toMatchObject({ status: 403, code: 'MEMORY_MOVE_FORBIDDEN' })
    expect(holder.fake.state.memories.get(id)!.channel).toBe(ADVERSARIAL)
  })
})
