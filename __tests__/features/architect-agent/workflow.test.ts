import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Agente Arquiteto no fluxo da mesa: aprovar o plano (Implementar) grava a versão aprovada e dispara
 * o arquiteto DEPOIS da resposta, sem esperar por ele nem alterar a etapa ou a vaga da mesa — também
 * quando a mesa aguarda vaga.
 */

const mocks = vi.hoisted(() => ({
  prepareHub: vi.fn(),
  publish: vi.fn(),
  publishAgentic: vi.fn(async () => undefined),
  loadCentral: vi.fn(),
  repoForProject: vi.fn(async () => null),
  pumpQueue: vi.fn(async () => undefined),
  recordAudit: vi.fn(async () => undefined),
  runTurn: vi.fn(),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  settings: vi.fn(),
  task: vi.fn(),
}))

vi.mock('@/features/agentic/server/developer-memories', () => ({ syncDeveloperMemories: async () => ({ applied: true, section: '' }), withDeveloperMemories: (_sync: unknown, text: string) => text }))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
// Builder Machine desativada: o build e a limpeza seguem no servidor.
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: async () => false }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
      create: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
    },
  })),
}))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  const workbenches = memoryModel()
  return { AgenticWorkbench: { ...workbenches, create: (doc: Record<string, unknown>) => workbenches.create({ startedAt: new Date(), pendingTurn: null, ...doc }) }, AgenticCentral: memoryModel(), AgenticEvent: memoryModel() }
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
  flushWorkbenchEvents: vi.fn(async () => undefined),
  subscribeWorkbench: vi.fn(),
  listWorkbenchEvents: vi.fn(),
}))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: vi.fn(async () => undefined), allocatePreviewPort: vi.fn(), waitForPreview: vi.fn() }))
vi.mock('@/features/time/server/service', () => ({ listActiveTimers: vi.fn(async () => []), startTimer: vi.fn(async () => undefined), stopTimer: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: vi.fn(async () => true), flushPendingSessionDeletions: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: mocks.pumpQueue }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.task, moveTask: vi.fn() }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { defaultCentralConfig, DEFAULT_AGENTIC_SETTINGS } from '@/features/agentic/schemas'
import { implement } from '@/features/agentic/server/workflow'
import { onPlanApproved } from '@/features/architect-agent/server/workflow-hook'

const model = AgenticWorkbench as unknown as { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }
const state = (id: string) => model.docs.find((doc) => String(doc._id) === id) as Record<string, unknown>

const workbench = async (overrides: Record<string, unknown> = {}) =>
  String(
    (
      await model.create({
        centralId: 'c1',
        taskId: `t${model.docs.length + 1}`,
        taskCode: `OPE-${model.docs.length + 1}`,
        taskTitle: 'Tarefa',
        stage: 'plan_review',
        runState: 'idle',
        sessionId: 'sess-1',
        sessionDirectory: '/home/u/app',
        branch: null,
        worktreePath: null,
        pendingTurn: null,
        pr: null,
        pastPrs: [],
        pendingSessionDeletions: [],
        pendingPermissions: [],
        pendingForms: [],
        plans: [
          { version: 1, text: 'Plano v1', feedback: null, createdAt: new Date() },
          { version: 2, text: 'Plano v2', feedback: 'ajuste', createdAt: new Date() },
        ],
        startedAt: new Date(),
        ...overrides,
      })
    )._id,
  )

const waitFor = async (check: () => boolean) => {
  for (let index = 0; index < 50 && !check(); index++) await new Promise((resolve) => setTimeout(resolve, 5))
}

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: { ...defaultCentralConfig('/home/u/app'), maxConcurrent: 1 } })
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.task.mockImplementation(async (id: string) => ({ id, code: 'OPE-3', title: 'Tarefa', project: { id: 'p1' }, columnId: 'development' }))
  mocks.runTurn.mockReturnValue(new Promise(() => undefined))
})

describe('Agente Arquiteto na aprovação do plano', () => {
  it('Implementar grava a versão aprovada e dispara o arquiteto sem esperar por ele', async () => {
    // O arquiteto nunca termina: a resposta do Implementar não pode depender dele.
    vi.mocked(onPlanApproved).mockReturnValue(new Promise(() => undefined))
    const id = await workbench()
    const dto = await implement(id)
    expect(dto.stage).toBe('implementing')
    expect(state(id).stage).toBe('implementing')
    expect(state(id).approvedPlanVersion).toBe(2)
    await waitFor(() => vi.mocked(onPlanApproved).mock.calls.length > 0)
    expect(onPlanApproved).toHaveBeenCalledWith(id)
  })

  it('com a mesa aguardando vaga, a versão aprovada vale na hora e o arquiteto também dispara', async () => {
    vi.mocked(onPlanApproved).mockResolvedValue(undefined)
    await workbench({ stage: 'implementing', runState: 'running', plans: [] })
    const id = await workbench()
    const dto = await implement(id)
    expect(dto.slotQueue).toEqual({ position: 1, action: 'implement' })
    expect(state(id).stage).toBe('plan_review')
    expect(state(id).approvedPlanVersion).toBe(2)
    await waitFor(() => vi.mocked(onPlanApproved).mock.calls.length > 0)
    expect(onPlanApproved).toHaveBeenCalledWith(id)
  })

  it('uma falha do arquiteto não chega ao Implementar', async () => {
    vi.mocked(onPlanApproved).mockRejectedValue(new Error('Engramind fora do ar'))
    const id = await workbench()
    await expect(implement(id)).resolves.toMatchObject({ stage: 'implementing' })
  })
})
