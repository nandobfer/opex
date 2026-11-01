import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'

/**
 * Rotinas de limpeza das sessões dos agentes (OPE-106): arquiva as sessões do Agente Opex / Maddox
 * sem interação há X dias e exclui as arquivadas há X dias (carência a partir do arquivamento).
 * Banco em memória; storage e OpenCode falsos.
 */

const store = vi.hoisted(() => ({ sessions: null as unknown, jobs: null as unknown, messages: null as unknown }))
const mocks = vi.hoisted(() => ({
  audit: vi.fn(async () => {}),
  publishAppEvent: vi.fn(async () => {}),
  publishToChannels: vi.fn(async () => {}),
  removeOpencode: vi.fn(async () => {}),
  deleteFiles: vi.fn(async () => {}),
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: mocks.audit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent, publishToChannels: mocks.publishToChannels }))
vi.mock('@/lib/db/models/Opex', () => {
  const model = memoryModel()
  // `updateSession` usa `findByIdAndUpdate` (a coleção em memória só tem `findOneAndUpdate`).
  store.sessions = Object.assign(model, { findByIdAndUpdate: (id: unknown, update: Record<string, unknown>, options: unknown) => model.findOneAndUpdate({ _id: id }, update, options) })
  store.jobs = memoryModel()
  store.messages = memoryModel()
  return { OpexSession: store.sessions, OpexMessage: store.messages, OpexPendingAction: memoryModel(), OpexJob: store.jobs, OpexFile: memoryModel() }
})
vi.mock('@/features/maddox-agent/server/opencode-session', () => ({ removeOpencodeSession: mocks.removeOpencode, interruptOpencodeSession: vi.fn(async () => {}) }))
vi.mock('@/features/opex-agent/server/files', () => ({ deleteSessionFiles: mocks.deleteFiles }))

import { archivedIdleSince, cleanupIdleAgentSessions, describeAgentSessionCleanup } from '@/features/opex-agent/server/session-retention'
import { updateSession } from '@/features/opex-agent/server/sessions'
import { OWNER_SCOPE } from '@/features/opex-agent/server/scope'

type Doc = Record<string, unknown> & { _id: unknown }
const sessions = () => store.sessions as ReturnType<typeof memoryModel>
const jobs = () => store.jobs as ReturnType<typeof memoryModel>
const messages = () => store.messages as ReturnType<typeof memoryModel>
const docOf = (id: string) => sessions().docs.find((doc) => String((doc as Doc)._id) === id) as Doc | undefined

const NOW = new Date('2026-11-01T12:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000)

async function session(fields: Record<string, unknown>): Promise<string> {
  const created = await sessions().create({
    title: 'Conversa',
    status: 'idle',
    archived: false,
    archivedAt: null,
    clientId: null,
    userId: 'local',
    agent: 'opex',
    messageCount: 2,
    lastMessageAt: daysAgo(1),
    createdAt: daysAgo(100),
    updatedAt: daysAgo(1),
    ...fields,
  })
  return String(created._id)
}

beforeEach(() => {
  vi.clearAllMocks()
  sessions().docs.splice(0)
  jobs().docs.splice(0)
  messages().docs.splice(0)
})

describe('cleanupIdleAgentSessions — arquivar', () => {
  it('arquiva a sessão parada há mais de X dias (com archivedAt, auditoria e evento) e mantém a recente', async () => {
    const old = await session({ lastMessageAt: daysAgo(40) })
    const recent = await session({ lastMessageAt: daysAgo(5) })

    const result = await cleanupIdleAgentSessions('opex', 30, NOW)

    expect(result).toEqual({ archived: 1, deleted: 0, failed: 0 })
    expect(docOf(old)).toMatchObject({ archived: true, archivedAt: NOW })
    expect(docOf(recent)).toMatchObject({ archived: false })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entidadeId: old, acao: 'ATUALIZAR', depois: expect.objectContaining({ arquivada: true, motivo: 'inatividade' }) }))
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('opex-session-updated', { id: old })
    expect(describeAgentSessionCleanup(result)).toBe('1 sessão(ões) arquivada(s)')
  })

  it('não toca sessão respondendo, aguardando confirmação nem vinculada a job ativo', async () => {
    const running = await session({ lastMessageAt: daysAgo(40), status: 'running' })
    const awaiting = await session({ lastMessageAt: daysAgo(40), status: 'awaiting_confirmation' })
    const withJob = await session({ lastMessageAt: daysAgo(40) })
    const doneJob = await session({ lastMessageAt: daysAgo(40) })
    await jobs().create({ status: 'scheduled', sessionId: withJob, originSessionId: null, resultSessionId: null })
    await jobs().create({ status: 'done', sessionId: doneJob, originSessionId: null, resultSessionId: null })

    const result = await cleanupIdleAgentSessions('opex', 30, NOW)

    expect(result.archived).toBe(1)
    expect(docOf(running)?.archived).toBe(false)
    expect(docOf(awaiting)?.archived).toBe(false)
    expect(docOf(withJob)?.archived).toBe(false)
    expect(docOf(doneJob)?.archived).toBe(true)
  })

  it('a rotina do Agente Opex não toca o Maddox (e vice-versa); sessão antiga sem `agent` é do Opex', async () => {
    const maddox = await session({ lastMessageAt: daysAgo(40), agent: 'maddox', opencodeSessionId: 'ses_m' })
    const legacy = await session({ lastMessageAt: daysAgo(40), agent: undefined })

    await cleanupIdleAgentSessions('opex', 30, NOW)
    expect(docOf(maddox)?.archived).toBe(false)
    expect(docOf(legacy)?.archived).toBe(true)

    await cleanupIdleAgentSessions('maddox', 30, NOW)
    // Arquivar o Maddox mantém a sessão do OpenCode vinculada (protegida da limpeza do OpenCode).
    expect(docOf(maddox)).toMatchObject({ archived: true, opencodeSessionId: 'ses_m' })
    expect(mocks.removeOpencode).not.toHaveBeenCalled()
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('maddox-session-updated', { id: maddox })
  })

  it('sessão do portal avisa o canal do usuário do cliente', async () => {
    const portal = await session({ lastMessageAt: daysAgo(40), clientId: 'c1', userId: 'u1' })
    await cleanupIdleAgentSessions('opex', 30, NOW)
    expect(docOf(portal)?.archived).toBe(true)
    expect(mocks.publishToChannels).toHaveBeenCalledWith(['private-opex-c1-u1'], 'opex-session-updated', { id: portal })
  })
})

describe('cleanupIdleAgentSessions — excluir as arquivadas', () => {
  it('exclui a arquivada há mais de X dias (mensagens, arquivos, auditoria e evento)', async () => {
    const id = await session({ lastMessageAt: daysAgo(90), archived: true, archivedAt: daysAgo(31), updatedAt: daysAgo(31) })
    await messages().create({ sessionId: id, seq: 1 })

    const result = await cleanupIdleAgentSessions('opex', 30, NOW)

    expect(result).toEqual({ archived: 0, deleted: 1, failed: 0 })
    expect(docOf(id)).toBeUndefined()
    expect(messages().docs).toHaveLength(0)
    expect(mocks.deleteFiles).toHaveBeenCalledWith(id)
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entidadeId: id, acao: 'EXCLUIR', antes: expect.objectContaining({ motivo: 'inatividade' }) }))
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('opex-session-deleted', { id })
  })

  it('regressão: a arquivada recentemente não é excluída, mesmo com a última mensagem antiga (carência)', async () => {
    const id = await session({ lastMessageAt: daysAgo(90), archived: true, archivedAt: daysAgo(2), updatedAt: daysAgo(2) })
    const result = await cleanupIdleAgentSessions('opex', 30, NOW)
    expect(result.deleted).toBe(0)
    expect(docOf(id)).toBeDefined()
  })

  it('a arquivada pela própria rotina só é excluída depois de X dias arquivada', async () => {
    const id = await session({ lastMessageAt: daysAgo(40) })
    await cleanupIdleAgentSessions('opex', 30, NOW)
    expect(docOf(id)).toMatchObject({ archived: true })
    // Execução seguinte, no dia depois: continua (carência).
    await cleanupIdleAgentSessions('opex', 30, new Date(NOW.getTime() + 86_400_000))
    expect(docOf(id)).toBeDefined()
  })

  it('arquivada antes do campo archivedAt usa o updatedAt', async () => {
    const stale = await session({ lastMessageAt: daysAgo(90), archived: true, archivedAt: undefined, updatedAt: daysAgo(60) })
    const fresh = await session({ lastMessageAt: daysAgo(90), archived: true, archivedAt: undefined, updatedAt: daysAgo(3) })
    await cleanupIdleAgentSessions('opex', 30, NOW)
    expect(docOf(stale)).toBeUndefined()
    expect(docOf(fresh)).toBeDefined()
    expect(archivedIdleSince({ lastMessageAt: daysAgo(90), archivedAt: undefined, updatedAt: daysAgo(3), createdAt: daysAgo(100) })).toEqual(daysAgo(3))
  })

  it('Maddox: excluir a arquivada remove também a sessão do OpenCode', async () => {
    const id = await session({ agent: 'maddox', opencodeSessionId: 'ses_m', lastMessageAt: daysAgo(90), archived: true, archivedAt: daysAgo(45) })
    await cleanupIdleAgentSessions('maddox', 30, NOW)
    expect(docOf(id)).toBeUndefined()
    expect(mocks.removeOpencode).toHaveBeenCalledWith('ses_m')
  })

  it('regressão F4: sessão desarquivada e com mensagem nova entre a leitura e a exclusão não é apagada', async () => {
    const id = await session({ lastMessageAt: daysAgo(90), archived: true, archivedAt: daysAgo(45) })
    const model = sessions() as unknown as { find: (...args: unknown[]) => unknown }
    const originalFind = model.find
    let first = true
    model.find = (...args: unknown[]) => {
      const query = originalFind(...args) as { lean: () => Promise<unknown> }
      if (!first) return query
      first = false
      // O usuário desarquiva e manda mensagem logo depois da leitura da rotina.
      return { ...query, sort: () => ({ limit: () => ({ lean: async () => {
        const docs = await query.lean()
        Object.assign(docOf(id)!, { archived: false, archivedAt: null, lastMessageAt: NOW, status: 'running' })
        return docs
      } }) }) }
    }
    try {
      const result = await cleanupIdleAgentSessions('opex', 30, NOW)
      expect(result.deleted).toBe(0)
      expect(docOf(id)).toBeDefined()
      expect(mocks.deleteFiles).not.toHaveBeenCalled()
    } finally {
      model.find = originalFind
    }
  })

  it('falha numa sessão não interrompe as demais', async () => {
    const a = await session({ lastMessageAt: daysAgo(90), archived: true, archivedAt: daysAgo(45) })
    const b = await session({ lastMessageAt: daysAgo(80), archived: true, archivedAt: daysAgo(45) })
    mocks.deleteFiles.mockRejectedValueOnce(new Error('storage fora'))
    const result = await cleanupIdleAgentSessions('opex', 30, NOW)
    expect(result).toEqual({ archived: 0, deleted: 1, failed: 1 })
    expect(docOf(a)).toBeDefined()
    expect(docOf(b)).toBeUndefined()
  })
})

describe('updateSession — archivedAt', () => {
  it('arquivar pela tela grava archivedAt; desarquivar zera', async () => {
    const id = await session({})
    await updateSession(id, { archived: true }, 'local', OWNER_SCOPE)
    expect(docOf(id)?.archivedAt).toBeInstanceOf(Date)
    await updateSession(id, { archived: false }, 'local', OWNER_SCOPE)
    expect(docOf(id)?.archivedAt).toBeNull()
  })
})
