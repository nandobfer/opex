import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Métricas dos agentes (OPE-122): o fluxo da mesa grava os fatos que alimentam o Agente Desenvolvedor
 * (tipo de correção, reabertura, interrupção, nova tentativa, conflito, CI e etapa com horário).
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
  metricEvent: vi.fn(async () => undefined),
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
vi.mock('@/features/ai/task-context-prompt', () => ({ buildTaskContextPrompt: vi.fn(() => 'tarefa') }))

// Métricas dos agentes: o registro é mockado para conferir os fatos gravados (sem banco).
vi.mock('@/features/agent-metrics/server/record', () => ({ recordWorkbenchEvent: mocks.metricEvent }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { defaultCentralConfig, DEFAULT_AGENTIC_SETTINGS } from '@/features/agentic/schemas'
import { handlePrCiFailure, handlePrConflict, handlePrFeedback, interrupt, reopen, requestCorrection, retry, revisePlan, submitPrFeedback } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

const PR = { number: 7, url: 'https://github.com/org/app/pull/7', state: 'open', mergedAt: null, mergeCommitSha: null, lastReviewId: 0, lastCommentId: 0, closedNotified: false }


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
        branch: 'feat/ope',
        worktreePath: '/home/u/app/worktrees/ope',
        pendingTurn: null,
        pr: null,
        pastPrs: [],
        pendingSessionDeletions: [],
        pendingPermissions: [],
        pendingForms: [],
        plans: [{ version: 1, text: 'Plano', feedback: null, createdAt: new Date() }],
        startedAt: new Date(),
        ...overrides,
      })
    )._id,
  )


/** Fatos gravados (tipo e dados), na ordem; o registro é disparado sem await. */
const events = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  return mocks.metricEvent.mock.calls.map((call) => {
    const [, type, data] = call as unknown as [unknown, string, Record<string, unknown> | undefined]
    return { type, ...(data ?? {}) }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  const config = defaultCentralConfig('/home/u/app')
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: { ...config, maxConcurrent: 3, git: { ...config.git, inheritCi: false, fixCi: true } } })
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.task.mockImplementation(async (id: string) => ({ id, code: 'OPE-3', title: 'Tarefa', project: { id: 'p1' }, columnId: 'development' }))
  mocks.runTurn.mockReturnValue(new Promise(() => undefined))
})

describe('fatos das métricas gravados pelo fluxo da mesa', () => {
  it('replanejar na revisão do plano = correção de plano; a mudança de etapa grava a entrada', async () => {
    const id = await workbench({ stage: 'plan_review' })
    await revisePlan(id, 'Mude a abordagem')
    expect(await events()).toEqual(expect.arrayContaining([{ type: 'correction', kind: 'plan' }, { type: 'stage-entered', stage: 'planning' }]))
    expect((await events()).filter((event) => event.type === 'correction')).toEqual([{ type: 'correction', kind: 'plan' }])
  })

  it('pedir correção da prévia = correção de prévia', async () => {
    const id = await workbench({ stage: 'preview' })
    await requestCorrection(id, 'O botão sumiu')
    expect((await events()).filter((event) => event.type === 'correction')).toEqual([{ type: 'correction', kind: 'preview' }])
  })

  it('pedido de mudança no PR pelo app e pelo GitHub = correção de PR, com a origem', async () => {
    const app = await workbench({ stage: 'changes_requested', pr: PR })
    await submitPrFeedback(app, 'Troque o nome')
    const github = await workbench({ stage: 'pr_open', pr: { ...PR, number: 8 } })
    await handlePrFeedback(github, 'Faltou teste')
    expect((await events()).filter((event) => event.type === 'correction')).toEqual([
      { type: 'correction', kind: 'pr', source: 'app' },
      { type: 'correction', kind: 'pr', source: 'github' },
    ])
  })

  it('reabrir a mesa concluída grava a reabertura', async () => {
    const id = await workbench({ stage: 'done', pr: { ...PR, state: 'merged' } })
    await reopen(id, 'Ajustar o texto')
    expect((await events()).map((event) => event.type)).toContain('reopened')
  })

  it('interromper e tentar de novo gravam a etapa em que aconteceram', async () => {
    const running = await workbench({ stage: 'implementing', runState: 'running' })
    await interrupt(running)
    const failed = await workbench({ stage: 'implementing', runState: 'failed', error: 'caiu', lastPrompt: { stage: 'implementing', text: 'Implemente' } })
    await retry(failed)
    const facts = await events()
    expect(facts).toEqual(expect.arrayContaining([{ type: 'interrupted', stage: 'implementing' }, { type: 'retried', stage: 'implementing' }]))
  })

  it('conflito de merge e CI falho no PR gravam os fatos com o número do PR', async () => {
    const conflict = await workbench({ stage: 'pr_open', pr: PR })
    expect(await handlePrConflict(conflict, { baseBranch: 'main', headBranch: 'feat/ope', baseSha: 'b1', headSha: 'h1' })).toBe(true)
    const ci = await workbench({ stage: 'pr_open', pr: { ...PR, number: 9 } })
    expect(await handlePrCiFailure(ci, { headBranch: 'feat/ope', headSha: 'h2', failures: [{ name: 'Vitest', conclusion: 'failure', detailsUrl: null, summary: null } as never], key: 'k', rerunAllowed: false, attempt: 1 })).toBe(true)
    expect(await events()).toEqual(expect.arrayContaining([{ type: 'conflict', pr: 7 }, { type: 'ci-failed', pr: 9, attempt: 1 }]))
  })

  it('o registro sem await não derruba o fluxo quando falha', async () => {
    mocks.metricEvent.mockRejectedValue(new Error('mongo fora'))
    const id = await workbench({ stage: 'plan_review' })
    await expect(revisePlan(id, 'De novo')).resolves.toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
