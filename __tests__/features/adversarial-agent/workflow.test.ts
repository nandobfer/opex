import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Agente Adversário no fluxo da mesa: ao fim da implementação, a revisão adversária roda antes
 * da prévia (ou do PR) e decide o próximo passo; no bloqueio, o usuário corrige, revisa de novo ou segue.
 */

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  loadCentral: vi.fn(),
  runTurn: vi.fn(),
  getTask: vi.fn(),
  settings: vi.fn(),
  applies: vi.fn(async () => true),
  round: vi.fn(),
  prepareUserFix: vi.fn(async () => 'CORRIJA F1'),
  recordSkip: vi.fn(async () => undefined),
  recordRerun: vi.fn(async () => undefined),
  restoreAwaiting: vi.fn(async () => undefined),
  failOrphans: vi.fn(async () => undefined),
  active: vi.fn(() => false),
  removeReviewSessions: vi.fn(async () => undefined),
  repoForProject: vi.fn(async () => null as { repo: string; repoUrl: string } | null),
  shell: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  runOpencodeShell: mocks.shell,
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: '/home/u/app/worktrees/opx-1' } }),
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
vi.mock('@/features/agentic/server/centrals', () => ({ loadCentral: mocks.loadCentral, repoForProject: mocks.repoForProject, publishAgentic: vi.fn(async () => undefined), entryColumnForProject: vi.fn(async () => null) }))
vi.mock('@/features/agentic/server/hub', () => ({
  prepareHub: vi.fn(),
  publishWorkbenchEvent: mocks.publish,
  isWorkbenchActive: mocks.active,
  markWorkbenchActive: vi.fn(),
  clearWorkbenchActive: vi.fn(),
  abortWorkbenchRun: vi.fn(),
  dropWorkbenchEvents: vi.fn(),
  flushWorkbenchEvents: vi.fn(async () => undefined),
  subscribeWorkbench: vi.fn(),
  listWorkbenchEvents: vi.fn(),
}))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: vi.fn(async () => undefined), allocatePreviewPort: vi.fn(async () => 4010), waitForPreview: vi.fn(async () => true) }))
vi.mock('@/features/agentic/server/timer-sync', () => ({ syncWorkbenchTimer: vi.fn(async () => undefined), accumulateWorkPeriodUsage: vi.fn(), closeOrphanWorkPeriods: vi.fn(async () => 0) }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: vi.fn(async () => true), flushPendingSessionDeletions: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/build-queue', () => ({ buildQueuePosition: vi.fn(async () => null), buildQueuePositions: vi.fn(async () => new Map()), pumpBuildQueue: vi.fn() }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask, moveTask: vi.fn(async () => undefined) }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))
vi.mock('@/features/adversarial-agent/server/workflow-hook', () => ({
  adversaryApplies: mocks.applies,
  runAdversaryRound: mocks.round,
  prepareUserFix: mocks.prepareUserFix,
  recordSkip: mocks.recordSkip,
  recordRerun: mocks.recordRerun,
  restoreAwaiting: mocks.restoreAwaiting,
  failOrphanReviews: mocks.failOrphans,
  removeWorkbenchReviewSessions: mocks.removeReviewSessions,
}))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'
import { adversarialFix, adversarialRerun, adversarialSkip, getWorkbench, implement, retry, sendLiveMessage } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }

const workbench = (overrides: Record<string, unknown> = {}) =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'OPX-1',
    taskTitle: 'Exportar CSV',
    stage: 'plan_review',
    runState: 'idle',
    sessionId: 'sess-1',
    sessionDirectory: '/home/u/app',
    branch: 'feat/opx-1',
    worktreePath: '/home/u/app/worktrees/opx-1',
    composeProject: 'app-opx-1',
    agenticFlow: 'preview',
    pr: null,
    plans: [{ version: 1, text: '# Plano', feedback: null, createdAt: new Date() }],
    pendingSessionDeletions: [],
    startedAt: new Date(),
    ...overrides,
  })

const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0, durationMs: 1 })
const stage = () => model.docs[0]!.stage
const waitFor = (expected: string, runState = 'idle') => vi.waitFor(() => expect([stage(), model.docs[0]!.runState]).toEqual([expected, runState]))
const stages = () => mocks.runTurn.mock.calls.map(([, request]) => request.stage)

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.applies.mockResolvedValue(true)
  mocks.active.mockReturnValue(false)
  mocks.repoForProject.mockResolvedValue(null)
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) =>
    request.stage === 'opening_pr' ? succeeded('```json\n{"url":"https://github.com/org/app/pull/9","number":9}\n```') : succeeded('Implementado.'),
  )
})

describe('fim da implementação com o agente adversário', () => {
  it('aprovado: revisa com a resposta do implementador e segue para a fila do build', async () => {
    mocks.round.mockResolvedValue({ kind: 'proceed', level: 'success', message: 'Aprovado' })
    const wb = await workbench()
    await implement(wb._id)
    await waitFor('build_queued')
    expect(mocks.round).toHaveBeenCalledWith(expect.objectContaining({ workbenchId: wb._id, worktreePath: '/home/u/app/worktrees/opx-1', baseBranch: 'main', implementationText: 'Implementado.' }))
    expect(stages()).toEqual(['implementing'])
  })

  it('adversário desativado ou fora do escopo: fluxo de sempre, sem revisão', async () => {
    mocks.applies.mockResolvedValue(false)
    const wb = await workbench()
    await implement(wb._id)
    await waitFor('build_queued')
    expect(mocks.round).not.toHaveBeenCalled()
  })

  it('correção automática encadeia a implementação e uma nova revisão; no PR automático, abre o PR ao aprovar', async () => {
    mocks.round.mockResolvedValueOnce({ kind: 'fix', text: 'CORRIJA F1', message: 'Bloqueou' }).mockResolvedValueOnce({ kind: 'proceed', level: 'success', message: 'Aprovado' })
    const wb = await workbench({ agenticFlow: 'auto_pr' })
    await implement(wb._id)
    await waitFor('pr_open')
    expect(stages()).toEqual(['implementing', 'implementing', 'opening_pr'])
    expect(mocks.runTurn.mock.calls[1]![1].text).toBe('CORRIJA F1')
    expect(mocks.round).toHaveBeenCalledTimes(2)
  })

  it('bloqueio com confirmação para em "Revisão bloqueou" sem ocupar vaga', async () => {
    mocks.round.mockResolvedValue({ kind: 'blocked', message: 'Bloqueou' })
    const wb = await workbench()
    await implement(wb._id)
    await waitFor('adversarial_blocked')
  })

  it('prévia no GitHub: aprovado encadeia o build remoto (sem fila local)', async () => {
    const config = defaultCentralConfig('/home/u/app')
    config.environment.previewMethod = 'github'
    mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config })
    mocks.repoForProject.mockResolvedValue({ repo: 'org/app', repoUrl: 'https://github.com/org/app' })
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) => succeeded(request.stage === 'building' ? '```json\n{"ok":true}\n```' : 'Implementado.'))
    mocks.round.mockResolvedValue({ kind: 'proceed', level: 'success', message: 'Aprovado' })
    const wb = await workbench({ port: 4010 })
    await implement(wb._id)
    await waitFor('preview')
    expect(mocks.round).toHaveBeenCalledTimes(1)
    expect(stages()).toEqual(['implementing', 'building'])
    expect(model.docs[0]!.previewBuild).toMatchObject({ method: 'github' })
  })

  it('falha com "pausar": a mesa para na revisão com o erro', async () => {
    mocks.round.mockResolvedValue({ kind: 'failed', message: 'Agente adversário falhou: tempo esgotado' })
    const wb = await workbench()
    await implement(wb._id)
    await waitFor('adversarial_review', 'failed')
    expect(model.docs[0]!.error).toBe('Agente adversário falhou: tempo esgotado')
  })
})

describe('decisões no bloqueio', () => {
  it('Corrigir: o implementador recebe o pedido montado pelo adversário', async () => {
    mocks.round.mockResolvedValue({ kind: 'proceed', level: 'success', message: 'Aprovado' })
    const wb = await workbench({ stage: 'adversarial_blocked' })
    await adversarialFix(wb._id, { text: 'F2 é intencional', excluded: ['F2'] })
    await waitFor('build_queued')
    expect(mocks.prepareUserFix).toHaveBeenCalledWith(wb._id, '/home/u/app/worktrees/opx-1', { text: 'F2 é intencional', excluded: ['F2'] })
    expect(mocks.runTurn.mock.calls[0]![1]).toMatchObject({ stage: 'implementing', text: 'CORRIJA F1' })
  })

  it('Revisar de novo: nova rodada sem passar pelo implementador', async () => {
    mocks.round.mockResolvedValue({ kind: 'blocked', message: 'Bloqueou de novo' })
    const wb = await workbench({ stage: 'adversarial_blocked' })
    await adversarialRerun(wb._id)
    await vi.waitFor(() => expect(mocks.round).toHaveBeenCalled())
    await waitFor('adversarial_blocked')
    expect(mocks.recordRerun).toHaveBeenCalledWith(wb._id)
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })

  it('Seguir mesmo assim: vai para a fila do build (prévia) e registra a decisão', async () => {
    const wb = await workbench({ stage: 'adversarial_blocked' })
    await adversarialSkip(wb._id)
    expect(stage()).toBe('build_queued')
    expect(mocks.recordSkip).toHaveBeenCalledWith(wb._id)
  })

  it('Seguir mesmo assim depois de uma revisão que falhou (fluxo PR automático) abre o PR', async () => {
    const wb = await workbench({ stage: 'adversarial_review', runState: 'failed', agenticFlow: 'auto_pr', lastPrompt: { stage: 'adversarial_review', text: '' } })
    await adversarialSkip(wb._id)
    await waitFor('pr_open')
    expect(stages()).toEqual(['opening_pr'])
  })

  it('ação indisponível fora da etapa', async () => {
    const wb = await workbench({ stage: 'preview' })
    await expect(adversarialFix(wb._id, {})).rejects.toMatchObject({ status: 409 })
  })
})

describe('reinício e chat durante a revisão', () => {
  it('rodada órfã: a mesa "revisando" sem turno vivo vira interrompida e a rodada é marcada como falha', async () => {
    const wb = await workbench({ stage: 'adversarial_review', runState: 'running', lastPrompt: { stage: 'adversarial_review', text: 'Implementado.' } })
    const dto = await getWorkbench(wb._id)
    expect(dto.runState).toBe('interrupted')
    expect(dto.error).toContain('revisão adversária foi perdida')
    expect(mocks.failOrphans).toHaveBeenCalledWith(wb._id, expect.stringContaining('revisão adversária foi perdida'))
  })

  it('outras etapas não mexem nas rodadas do adversário ao reconciliar', async () => {
    const wb = await workbench({ stage: 'implementing', runState: 'running' })
    await getWorkbench(wb._id)
    expect(mocks.failOrphans).not.toHaveBeenCalled()
  })

  it('Tentar novamente refaz a rodada numa sessão nova com a resposta do implementador', async () => {
    mocks.round.mockResolvedValue({ kind: 'proceed', level: 'success', message: 'Aprovado' })
    const wb = await workbench({ stage: 'adversarial_review', runState: 'failed', lastPrompt: { stage: 'adversarial_review', text: 'Implementado.' } })
    await retry(wb._id)
    await waitFor('build_queued')
    expect(mocks.round).toHaveBeenCalledWith(expect.objectContaining({ implementationText: 'Implementado.' }))
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })

  it('a mesa expõe se o adversário se aplica (passo na trilha)', async () => {
    const wb = await workbench()
    expect((await getWorkbench(wb._id)).adversarial).toBe(true)
    mocks.applies.mockResolvedValue(false)
    expect((await getWorkbench(wb._id)).adversarial).toBe(false)
  })

  it('sem chat durante a revisão (guarda no servidor)', async () => {
    const wb = await workbench({ stage: 'adversarial_review', runState: 'running' })
    mocks.active.mockReturnValue(true)
    await expect(sendLiveMessage(wb._id, 'olá')).rejects.toMatchObject({ status: 409, code: 'WORKBENCH_ADVERSARIAL_REVIEW' })
  })
})
