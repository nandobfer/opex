import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prepareHub: vi.fn(),
  publish: vi.fn(),
  publishAgentic: vi.fn(async () => undefined),
  loadCentral: vi.fn(),
  repoForProject: vi.fn(),
  shell: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
  syncTimer: vi.fn(async () => undefined),
  pumpQueue: vi.fn(async () => undefined),
  recordAudit: vi.fn(async () => undefined),
  runTurn: vi.fn(),
  allocatePort: vi.fn(async () => 4010),
  moveTask: vi.fn(async () => undefined),
  getTask: vi.fn(),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  settings: vi.fn(),
  assertAgentConfigs: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  runOpencodeShell: mocks.shell,
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: '/home/u/app/worktrees/ope-53' } }),
      create: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
    },
  })),
}))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  const workbench = memoryModel()
  // O schema real aplica `startedAt` por padrão; o dublê em memória precisa do mesmo default.
  const baseCreate = workbench.create
  workbench.create = (doc: Record<string, unknown>) => baseCreate({ startedAt: new Date(), ...doc })
  return { AgenticWorkbench: workbench, AgenticCentral: memoryModel(), AgenticEvent: memoryModel() }
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
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: vi.fn(async () => undefined), allocatePreviewPort: mocks.allocatePort, waitForPreview: vi.fn(async () => true) }))
vi.mock('@/features/agentic/server/timer-sync', () => ({ syncWorkbenchTimer: mocks.syncTimer, accumulateWorkPeriodUsage: vi.fn(), closeOrphanWorkPeriods: vi.fn(async () => 0) }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: vi.fn(async () => true), flushPendingSessionDeletions: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: mocks.pumpQueue }))
vi.mock('@/features/agentic/server/build-queue', () => ({ buildQueuePosition: vi.fn(async () => null), buildQueuePositions: vi.fn(async () => new Map()), pumpBuildQueue: vi.fn() }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability, assertAgentConfigs: mocks.assertAgentConfigs }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask, moveTask: mocks.moveTask }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'
import { getWorkbench, implement, setWorkbenchModel } from '@/features/agentic/server/workflow'

/**
 * Troca do modelo na mesa: vale só para o papel escolhido, a partir do próximo turno, mantendo o
 * agente da etapa; "voltar ao padrão" remove a troca.
 */

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

const workbench = async (overrides: Record<string, unknown> = {}) =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'OPE-70',
    taskTitle: 'Trocar modelo',
    stage: 'plan_review',
    runState: 'idle',
    sessionId: 'sess-1',
    sessionDirectory: '/home/u/app',
    branch: 'feat/ope-70',
    worktreePath: '/home/u/app/worktrees/ope-53',
    composeProject: 'app-ope-70',
    pr: null,
    plans: [{ version: 1, text: '# Plano', feedback: null, createdAt: new Date() }],
    pendingSessionDeletions: [],
    agenticFlow: 'auto_pr',
    modelOverrides: null,
    startedAt: new Date(),
    ...overrides,
  })

const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0, durationMs: 1 })
const waitForStage = (stage: string) => vi.waitFor(() => expect([model.docs[0]!.stage, model.docs[0]!.runState, model.docs[0]!.error]).toEqual([stage, 'idle', null]))
const agentOf = (stage: string) => mocks.runTurn.mock.calls.find(([, request]) => request.stage === stage)?.[1].agent

const settings = {
  ...DEFAULT_AGENTIC_SETTINGS,
  agents: {
    ...DEFAULT_AGENTIC_SETTINGS.agents,
    planning: { agent: 'plan', model: 'anthropic/opus', variant: 'high' },
    implementation: { agent: 'build', model: 'anthropic/sonnet', variant: null },
    pr: { agent: 'build', model: 'anthropic/haiku', variant: null },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
  mocks.repoForProject.mockResolvedValue(null)
  mocks.settings.mockResolvedValue({ settings })
  mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) =>
    request.stage === 'opening_pr' ? succeeded('```json\n{"url":"https://github.com/org/app/pull/9","number":9}\n```') : succeeded('ok'),
  )
})

describe('trocar o modelo na mesa', () => {
  it('grava a troca do papel (mesa antiga com o campo nulo), confere no OpenCode, audita e avisa', async () => {
    const wb = await workbench()
    const dto = await setWorkbenchModel(wb._id, { role: 'planning', model: 'openai/gpt-5', variant: 'medium' })

    expect(model.docs[0]!.modelOverrides).toEqual({ planning: { model: 'openai/gpt-5', variant: 'medium' } })
    expect(mocks.assertAgentConfigs).toHaveBeenCalledWith([{ label: 'Modelo do Plano', config: { agent: null, model: 'openai/gpt-5', variant: 'medium' } }], false)
    expect(dto.models).toMatchObject({
      planning: { model: 'openai/gpt-5', variant: 'medium', overridden: true },
      implementation: { model: 'anthropic/sonnet', variant: null, overridden: false },
    })
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ antes: expect.objectContaining({ etapa: 'Planejamento', modelo: 'anthropic/opus (high)', trocado: false }), depois: expect.objectContaining({ modelo: 'openai/gpt-5 (medium)', trocado: true }) }),
    )
    expect(mocks.publish).toHaveBeenCalledWith(wb._id, expect.objectContaining({ type: 'notice', message: 'Modelo do Plano trocado para openai/gpt-5 (medium): vale a partir do próximo turno.' }))
  })

  it('voltar ao padrão remove só a troca daquele papel', async () => {
    const wb = await workbench({ modelOverrides: { planning: { model: 'openai/gpt-5', variant: null }, pr: { model: 'openai/o3', variant: null } } })
    const dto = await setWorkbenchModel(wb._id, { role: 'planning', model: null, variant: null })

    expect(model.docs[0]!.modelOverrides).toEqual({ pr: { model: 'openai/o3', variant: null } })
    expect(dto.models?.planning).toEqual({ model: 'anthropic/opus', variant: 'high', overridden: false })
    expect(mocks.assertAgentConfigs).not.toHaveBeenCalled()
    expect(mocks.publish).toHaveBeenCalledWith(wb._id, expect.objectContaining({ message: expect.stringContaining('Modelo do Plano voltou ao padrão (anthropic/opus (high))') }))
  })

  it('modelo inexistente no OpenCode não é gravado', async () => {
    const wb = await workbench()
    mocks.assertAgentConfigs.mockRejectedValueOnce(Object.assign(new Error('Modelo do Plano: modelo x/y não está disponível no OpenCode'), { status: 400 }))
    await expect(setWorkbenchModel(wb._id, { role: 'planning', model: 'x/y', variant: null })).rejects.toMatchObject({ status: 400 })
    expect(model.docs[0]!.modelOverrides).toBeNull()
  })

  it('o turno usa o modelo trocado do papel e mantém o agente; os outros papéis seguem o configurado', async () => {
    const wb = await workbench({ modelOverrides: { implementation: { model: 'openai/gpt-5', variant: 'high' } } })
    await implement(wb._id)
    await waitForStage('pr_open')

    expect(agentOf('implementing')).toEqual({ agent: 'build', model: 'openai/gpt-5', variant: 'high' })
    expect(agentOf('opening_pr')).toEqual({ agent: 'build', model: 'anthropic/haiku', variant: null })
  })

  it('trocar com o agente respondendo não muda o turno atual: vale a partir do próximo', async () => {
    const wb = await workbench()
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) => {
      if (request.stage === 'implementing') {
        await setWorkbenchModel(wb._id, { role: 'implementation', model: 'openai/gpt-5', variant: null })
        await setWorkbenchModel(wb._id, { role: 'pr', model: 'openai/o3', variant: null })
        return succeeded('ok')
      }
      return succeeded('```json\n{"url":"https://github.com/org/app/pull/9","number":9}\n```')
    })
    await implement(wb._id)
    await waitForStage('pr_open')

    expect(agentOf('implementing')).toEqual({ agent: 'build', model: 'anthropic/sonnet', variant: null })
    expect(agentOf('opening_pr')).toEqual({ agent: 'build', model: 'openai/o3', variant: null })
  })

  it('central ilegível: a mesa vem sem os modelos (seletor oculto)', async () => {
    const wb = await workbench()
    mocks.loadCentral.mockRejectedValueOnce(new Error('central excluída'))
    expect((await getWorkbench(wb._id)).models).toBeNull()
  })
})
