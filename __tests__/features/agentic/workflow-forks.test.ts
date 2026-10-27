import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Pontos da mesa ligados aos forks da conversa: a conclusão aplica a política da central aos forks
 * em aberto, reabrir dispensa a pergunta pendente, excluir a mesa apaga os forks e os resumos
 * integrados ao contexto valem também numa sessão nova (ou vão no prompt quando não sincronizados).
 */

const mocks = vi.hoisted(() => ({
  prepareHub: vi.fn(),
  publish: vi.fn(),
  publishAgentic: vi.fn(async () => undefined),
  loadCentral: vi.fn(),
  runTurn: vi.fn(),
  sessionGet: vi.fn(),
  put: vi.fn(async () => undefined),
  handleWorkbenchDone: vi.fn(async () => undefined),
  deleteWorkbenchForks: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
// Builder Machine desativada: o build e a limpeza seguem no servidor.
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: async () => false }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: mocks.sessionGet,
      create: async () => ({ id: 'sess-new', location: { directory: '/home/u/app' } }),
      instructions: { entry: { put: mocks.put } },
    },
  })),
}))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticWorkbench: memoryModel(), AgenticCentral: memoryModel(), AgenticEvent: memoryModel(), AgenticFork: memoryModel() }
})
vi.mock('@/features/agentic/server/centrals', () => ({ loadCentral: mocks.loadCentral, repoForProject: vi.fn(async () => null), entryColumnForProject: vi.fn(async () => null), publishAgentic: mocks.publishAgentic }))
vi.mock('@/features/agentic/server/hub', () => ({
  prepareHub: mocks.prepareHub,
  publishWorkbenchEvent: mocks.publish,
  isWorkbenchActive: () => false,
  markWorkbenchActive: vi.fn(),
  clearWorkbenchActive: vi.fn(),
  abortWorkbenchRun: vi.fn(),
  dropWorkbenchEvents: vi.fn(),
  flushWorkbenchEvents: vi.fn(async () => undefined),
}))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: vi.fn(async () => undefined), allocatePreviewPort: vi.fn(), waitForPreview: vi.fn() }))
vi.mock('@/features/time/server/service', () => ({ listActiveTimers: vi.fn(async () => []), startTimer: vi.fn(async () => undefined), stopTimer: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: vi.fn(async () => true), flushPendingSessionDeletions: vi.fn(async () => true) }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/forks', () => ({ handleWorkbenchDone: mocks.handleWorkbenchDone, deleteWorkbenchForks: mocks.deleteWorkbenchForks }))
vi.mock('@/features/agentic/server/settings', async () => {
  const { DEFAULT_AGENTIC_SETTINGS } = await import('@/features/agentic/schemas')
  return { loadAgenticSettings: vi.fn(async () => ({ settings: DEFAULT_AGENTIC_SETTINGS })), agenticAvailability: vi.fn(async () => ({ available: true, reason: null })) }
})
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: vi.fn(async () => ({ id: 't1', columnId: 'todo' })), moveTask: vi.fn() }))
vi.mock('@/features/agentic/server/timer-sync', () => ({ syncWorkbenchTimer: vi.fn(async () => undefined) }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { defaultCentralConfig } from '@/features/agentic/schemas'
import { FORK_NOTES_INSTRUCTIONS_KEY } from '@/features/agentic/constants'
import { deleteWorkbench, handlePrMerged, implement, reopen } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }
const state = (id: string) => model.docs.find((doc) => String(doc._id) === id) as Record<string, unknown>
const NOTE = { forkId: 'f1', number: 1, summary: 'Usar o serviço X', createdAt: new Date() }

const workbench = async (overrides: Record<string, unknown> = {}) =>
  String(
    (
      await model.create({
        centralId: 'c1',
        taskId: 't1',
        taskCode: 'OPE-1',
        taskTitle: 'Tarefa',
        stage: 'plan_review',
        runState: 'idle',
        sessionId: 'sess-1',
        sessionDirectory: '/home/u/app',
        pendingTurn: null,
        pr: null,
        pastPrs: [],
        pendingSessionDeletions: [],
        pendingPermissions: [],
        pendingForms: [],
        forkNotes: [],
        forkNotesSynced: true,
        forksDonePrompt: null,
        plans: [{ version: 1, text: 'Plano', feedback: null, createdAt: new Date() }],
        startedAt: new Date(),
        ...overrides,
      })
    )._id,
  )

const config = (patch: Record<string, unknown> = {}) => ({ ...defaultCentralConfig('/home/u/app'), cleanup: { teardownEnvironment: false, removeWorktree: false, deleteBranch: false }, columns: { queue: null, onStart: null, onPr: null, onDone: null }, ...patch })

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: config() })
  mocks.sessionGet.mockResolvedValue({ id: 'sess-1', location: { directory: '/home/u/app' } })
  mocks.runTurn.mockReturnValue(new Promise(() => undefined))
})

describe('conclusão da mesa com forks', () => {
  it('aplica a política configurada na central aos forks em aberto', async () => {
    mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: config({ forks: { onWorkbenchDone: 'conclude' } }) })
    const id = await workbench({ stage: 'pr_open', pr: { number: 7, url: 'https://github.com/org/app/pull/7', state: 'open' } })
    await handlePrMerged(id, { mergedAt: new Date(), mergeCommitSha: null })
    expect(state(id).stage).toBe('done')
    expect(mocks.handleWorkbenchDone).toHaveBeenCalledWith(expect.objectContaining({ _id: id }), 'conclude')
  })

  it('reabrir dispensa a pergunta sobre os forks em aberto', async () => {
    const id = await workbench({ stage: 'done', sessionId: null, forksDonePrompt: { count: 2, at: new Date() } })
    await reopen(id, 'Ajustar o texto')
    expect(state(id).forksDonePrompt).toBeNull()
  })

  it('excluir a mesa apaga os forks dela', async () => {
    const id = await workbench()
    await deleteWorkbench(id)
    expect(mocks.deleteWorkbenchForks).toHaveBeenCalledWith(id)
  })
})

describe('resumos de forks no contexto da conversa principal', () => {
  it('sessão nova: os resumos voltam a valer como instrução durável', async () => {
    mocks.sessionGet.mockResolvedValue(null)
    const id = await workbench({ forkNotes: [NOTE] })
    await implement(id)
    await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ sessionID: 'sess-new', key: FORK_NOTES_INSTRUCTIONS_KEY, value: expect.stringContaining('Usar o serviço X') })))
  })

  it('não sincronizados na sessão: vão uma vez no prompt do próximo turno', async () => {
    const id = await workbench({ forkNotes: [NOTE], forkNotesSynced: false })
    await implement(id)
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalled())
    expect(mocks.runTurn.mock.calls[0]![1].text).toContain('Usar o serviço X')
    expect(state(id).forkNotesSynced).toBe(true)
  })
})
