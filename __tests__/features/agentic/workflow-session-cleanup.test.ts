import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteSession: vi.fn(async () => true),
  flushPending: vi.fn(async () => undefined),
  publish: vi.fn(),
  prepareHub: vi.fn(),
  releasePreview: vi.fn(async () => undefined),
  publishAgentic: vi.fn(async () => undefined),
  loadCentral: vi.fn(),
  repoForProject: vi.fn(async () => null),
  syncTimer: vi.fn(async () => undefined),
  pumpQueue: vi.fn(async () => undefined),
  recordAudit: vi.fn(async () => undefined),
  central: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: vi.fn() }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticWorkbench: memoryModel(), AgenticCentral: memoryModel(), AgenticEvent: memoryModel() }
})
vi.mock('@/features/agentic/server/centrals', () => ({
  loadCentral: mocks.loadCentral,
  repoForProject: mocks.repoForProject,
  publishAgentic: mocks.publishAgentic,
  entryColumnForProject: vi.fn(async () => null),
}))
vi.mock('@/features/agentic/server/hub', () => ({
  prepareHub: mocks.prepareHub,
  publishWorkbenchEvent: mocks.publish,
  isWorkbenchActive: () => false,
  markWorkbenchActive: vi.fn(),
  clearWorkbenchActive: vi.fn(),
  abortWorkbenchRun: vi.fn(),
  dropWorkbenchEvents: vi.fn(),
  flushWorkbenchEvents: vi.fn(),
  subscribeWorkbench: vi.fn(),
  listWorkbenchEvents: vi.fn(),
}))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: mocks.releasePreview, allocatePreviewPort: vi.fn(), waitForPreview: vi.fn() }))
vi.mock('@/features/agentic/server/timer-sync', () => ({ syncWorkbenchTimer: mocks.syncTimer, accumulateWorkPeriodUsage: vi.fn() }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: mocks.deleteSession, flushPendingSessionDeletions: mocks.flushPending }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: mocks.pumpQueue }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: vi.fn(), agenticAvailability: vi.fn() }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: vi.fn(), moveTask: vi.fn() }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { defaultCentralConfig } from '@/features/agentic/schemas'
import { handlePrMerged } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

/** Central que conclui SEM limpeza (o PR mergeado chama `completeWorkbench` na hora). */
const configWithoutCleanup = () => ({ ...defaultCentralConfig('/home/u/app'), cleanup: { teardownEnvironment: false, removeWorktree: false, deleteBranch: false } })

const workbench = async (overrides: Record<string, unknown> = {}) =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'OPE-46',
    taskTitle: 'Deletar sessões',
    stage: 'pr_open',
    runState: 'idle',
    sessionId: 'sess-old',
    sessionDirectory: '/home/u/app',
    pr: { number: 7, url: 'https://github.com/org/app/pull/7', state: 'open', lastReviewId: 0, lastCommentId: 0, closedNotified: false },
    pendingSessionDeletions: [],
    plans: [],
    ...overrides,
  })

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: configWithoutCleanup() })
  mocks.deleteSession.mockResolvedValue(true)
})

describe('conclusão da mesa e exclusão da sessão', () => {
  it('ao concluir, desvincula a sessão e manda excluí-la no OpenCode', async () => {
    const wb = await workbench()

    await handlePrMerged(wb._id, { mergedAt: new Date('2026-10-11T10:00:00Z'), mergeCommitSha: 'abc' })

    const doc = model.docs[0]!
    expect(doc.stage).toBe('done')
    expect(doc.sessionId).toBeNull()
    expect(doc.sessionDirectory).toBeNull()
    expect(doc.pendingSessionDeletions).toEqual(['sess-old'])
    expect(mocks.deleteSession).toHaveBeenCalledWith(wb._id, 'sess-old')
  })

  it('mesa sem sessão conclui sem chamar o OpenCode', async () => {
    const wb = await workbench({ sessionId: null, sessionDirectory: null })

    await handlePrMerged(wb._id, { mergedAt: new Date(), mergeCommitSha: null })

    expect(model.docs[0]!.stage).toBe('done')
    expect(mocks.deleteSession).not.toHaveBeenCalled()
    expect(model.docs[0]!.pendingSessionDeletions).toEqual([])
  })
})
