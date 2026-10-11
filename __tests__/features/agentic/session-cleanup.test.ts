import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getClient: vi.fn() }))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: mocks.getClient }))
vi.mock('@opencode/client', () => ({ isSessionNotFoundError: (value: unknown) => (value as { notFound?: boolean } | null)?.notFound === true }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticWorkbench: memoryModel() }
})

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { deleteWorkbenchSession, flushPendingSessionDeletions, processPendingSessionDeletions } from '@/features/agentic/server/session-cleanup'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

/** Cliente falso do OpenCode; `remove` pode ser sobrescrito por caso. */
const client = (remove: (input: { sessionID: string }) => Promise<void> = async () => undefined) => ({ session: { remove: vi.fn(remove) } })

const notFound = () => Object.assign(new Error('sessão não encontrada'), { notFound: true })

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.getClient.mockResolvedValue(client())
})

describe('deleteWorkbenchSession', () => {
  it('exclui a sessão e remove a pendência', async () => {
    const wb = await model.create({ taskCode: 'OPE-1', pendingSessionDeletions: ['sess-1'] })
    const c = client()
    mocks.getClient.mockResolvedValue(c)

    expect(await deleteWorkbenchSession(wb._id, 'sess-1')).toBe(true)
    expect(c.session.remove).toHaveBeenCalledWith({ sessionID: 'sess-1' }, expect.anything())
    expect(model.docs[0]!.pendingSessionDeletions).toEqual([])
  })

  it('sessão inexistente conta como excluída (idempotente)', async () => {
    const wb = await model.create({ pendingSessionDeletions: ['sess-1'] })
    mocks.getClient.mockResolvedValue(client(async () => { throw notFound() }))

    expect(await deleteWorkbenchSession(wb._id, 'sess-1')).toBe(true)
    expect(model.docs[0]!.pendingSessionDeletions).toEqual([])
  })

  it('falha do OpenCode mantém a pendência', async () => {
    const wb = await model.create({ pendingSessionDeletions: ['sess-1'] })
    mocks.getClient.mockResolvedValue(client(async () => { throw new Error('fora do ar') }))

    expect(await deleteWorkbenchSession(wb._id, 'sess-1')).toBe(false)
    expect(model.docs[0]!.pendingSessionDeletions).toEqual(['sess-1'])
  })

  it('OpenCode indisponível (sem cliente) mantém a pendência', async () => {
    const wb = await model.create({ pendingSessionDeletions: ['sess-1'] })
    mocks.getClient.mockRejectedValue(new Error('sem configuração'))

    expect(await deleteWorkbenchSession(wb._id, 'sess-1')).toBe(false)
    expect(model.docs[0]!.pendingSessionDeletions).toEqual(['sess-1'])
  })
})

describe('processPendingSessionDeletions', () => {
  it('retoma as pendências, isolando a falha de uma sessão', async () => {
    await model.create({ pendingSessionDeletions: ['sess-a'] })
    await model.create({ pendingSessionDeletions: ['sess-b'] })
    mocks.getClient.mockResolvedValue(client(async ({ sessionID }) => { if (sessionID === 'sess-a') throw new Error('falha isolada') }))

    expect(await processPendingSessionDeletions()).toBe(1)
    expect(model.docs[0]!.pendingSessionDeletions).toEqual(['sess-a'])
    expect(model.docs[1]!.pendingSessionDeletions).toEqual([])
  })

  it('sessão inexistente também sai da lista de pendências', async () => {
    await model.create({ pendingSessionDeletions: ['sess-a'] })
    mocks.getClient.mockResolvedValue(client(async () => { throw notFound() }))

    expect(await processPendingSessionDeletions()).toBe(1)
    expect(model.docs[0]!.pendingSessionDeletions).toEqual([])
  })

  it('nada pendente: não toca o OpenCode', async () => {
    await model.create({ pendingSessionDeletions: [] })
    const c = client()
    mocks.getClient.mockResolvedValue(c)

    expect(await processPendingSessionDeletions()).toBe(0)
    expect(c.session.remove).not.toHaveBeenCalled()
  })

  it('OpenCode indisponível não lança e mantém tudo pendente', async () => {
    await model.create({ pendingSessionDeletions: ['sess-a'] })
    mocks.getClient.mockRejectedValue(new Error('fora do ar'))

    expect(await processPendingSessionDeletions()).toBe(0)
    expect(model.docs[0]!.pendingSessionDeletions).toEqual(['sess-a'])
  })
})

describe('flushPendingSessionDeletions', () => {
  it('exclui as pendências antes de a mesa ser apagada', async () => {
    const c = client()
    mocks.getClient.mockResolvedValue(c)

    await flushPendingSessionDeletions({ _id: 'wb', pendingSessionDeletions: ['sess-1', 'sess-2', 'sess-1'] })
    expect(c.session.remove).toHaveBeenCalledTimes(2)
  })

  it('sem pendências não toca o OpenCode', async () => {
    const c = client()
    mocks.getClient.mockResolvedValue(c)

    await flushPendingSessionDeletions({ _id: 'wb', pendingSessionDeletions: [] })
    expect(mocks.getClient).not.toHaveBeenCalled()
  })
})
