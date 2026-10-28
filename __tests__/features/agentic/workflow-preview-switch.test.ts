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
  runBuild: vi.fn(async () => ({ exitCode: 0, tail: '' })),
  allocatePort: vi.fn(async () => 4010),
  moveTask: vi.fn(async () => undefined),
  getTask: vi.fn(),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  settings: vi.fn(),
  pumpBuild: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
// Builder Machine desativada: o build e a limpeza seguem no servidor.
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: async () => false }))
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
  return { AgenticWorkbench: workbench, AgenticCentral: memoryModel(), AgenticEvent: memoryModel(), AgenticBuild: memoryModel() }
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
vi.mock('@/features/agentic/server/build-queue', () => ({ buildQueuePosition: vi.fn(async () => null), buildQueuePositions: vi.fn(async () => new Map()), pumpBuildQueue: mocks.pumpBuild }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
// O app roda o comando do build no host (aba Build).
vi.mock('@/features/agentic/server/preview-build', () => ({ runPreviewBuild: mocks.runBuild }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask, moveTask: mocks.moveTask }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'
import { implement, rebuildPreview, setWorkbenchPreview, startBuildTurn, startPendingTurn } from '@/features/agentic/server/workflow'

/**
 * Chave "Gerar prévia" da mesa: desligada, a mesa pula a prévia e publica direto no PR (fluxo PR
 * automático só nesta mesa); religada com o PR aberto, gera a prévia do código atual na hora.
 */

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

const OPEN_PR = { number: 9, url: 'https://github.com/org/app/pull/9', state: 'open', mergedAt: null, mergeCommitSha: null, lastReviewId: 0, lastCommentId: 0, closedNotified: false, conflictBaseSha: null, conflictHeadSha: null }

const workbench = async (overrides: Record<string, unknown> = {}) =>
  model.create({
    centralId: 'c1',
    taskId: `t${model.docs.length + 1}`,
    taskCode: 'OPE-80',
    taskTitle: 'Gerar prévia',
    stage: 'plan_review',
    runState: 'idle',
    sessionId: 'sess-1',
    sessionDirectory: '/home/u/app',
    branch: 'feat/ope-80',
    worktreePath: '/home/u/app/worktrees/ope-53',
    composeProject: 'app-ope-80',
    pr: null,
    port: 4010,
    pendingTurn: null,
    plans: [{ version: 1, text: '# Plano', feedback: null, createdAt: new Date() }],
    pendingSessionDeletions: [],
    agenticFlow: 'preview',
    startedAt: new Date(),
    ...overrides,
  })

const doc = (id: string) => model.docs.find((item) => String(item._id) === String(id))!
const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0, durationMs: 1 })
const PR_JSON = succeeded('```json\n{"url":"https://github.com/org/app/pull/9","number":9}\n```')
const waitFor = (id: string, stage: string) => vi.waitFor(() => expect([doc(id).stage, doc(id).runState, doc(id).error ?? null]).toEqual([stage, 'idle', null]))
const stages = () => mocks.runTurn.mock.calls.map(([, request]) => request.stage)
const noticeOf = (id: string) => mocks.publish.mock.calls.filter(([target, event]) => target === id && event.type === 'notice').map(([, event]) => event.message as string)

const centralWith = (patch: Record<string, unknown> = {}) => ({ doc: { projectName: 'App', projectId: 'p1' }, config: { ...defaultCentralConfig('/home/u/app'), ...patch } })

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue(centralWith())
  mocks.repoForProject.mockResolvedValue(null)
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) =>
    request.stage === 'opening_pr' ? PR_JSON : request.stage === 'building' ? succeeded('```json\n{"ok":true}\n```') : succeeded('ok'),
  )
})

describe('desligar "Gerar prévia"', () => {
  it('troca só o fluxo da mesa, audita e avisa (vale no próximo fim de implementação)', async () => {
    const wb = await workbench({ stage: 'plan_review' })
    const dto = await setWorkbenchPreview(wb._id, { enabled: false })

    expect(dto.agenticFlow).toBe('auto_pr')
    expect(doc(wb._id).stage).toBe('plan_review')
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ antes: expect.objectContaining({ gerarPrevia: true }), depois: expect.objectContaining({ gerarPrevia: false }) }))
    expect(noticeOf(wb._id)).toContain('Geração de prévia desligada: ao fim da implementação a mesa publica direto no Pull Request.')
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })

  it('desligada durante a implementação: ao fim dela publica no PR sem passar pela prévia', async () => {
    const wb = await workbench()
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) => {
      if (request.stage === 'implementing') {
        await setWorkbenchPreview(wb._id, { enabled: false })
        return succeeded('ok')
      }
      return PR_JSON
    })
    await implement(wb._id)
    await waitFor(wb._id, 'pr_open')

    expect(stages()).toEqual(['implementing', 'opening_pr'])
    expect(doc(wb._id).buildQueuedAt ?? null).toBeNull()
  })

  it('na fila do build: sai da fila e já publica no PR', async () => {
    const wb = await workbench({ stage: 'build_queued', buildQueuedAt: new Date(), pr: OPEN_PR })
    await setWorkbenchPreview(wb._id, { enabled: false })
    // (o dublê do hub não marca a mesa como ativa; aqui só importam a etapa e o turno lançado)
    await vi.waitFor(() => expect([doc(wb._id).stage, doc(wb._id).runState]).toEqual(['pr_open', 'idle']))

    expect(stages()).toEqual(['opening_pr'])
    expect(doc(wb._id).buildQueuedAt).toBeNull()
    expect(noticeOf(wb._id)).toContain('Geração de prévia desligada: a mesa saiu da fila do build e vai publicar no Pull Request.')
    // A mesa saiu da fila: o build não começa mais para ela.
    expect(await startBuildTurn(wb._id)).toBe(false)
  })

  it('com o build rodando: o build termina e a mesa publica no PR sem parar na prévia', async () => {
    const wb = await workbench({ stage: 'build_queued', buildQueuedAt: new Date() })
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) => (request.stage === 'building' ? succeeded('```json\n{"ok":true}\n```') : PR_JSON))
    // A chave é desligada enquanto o app roda o build da prévia.
    mocks.runBuild.mockImplementationOnce(async () => {
      await setWorkbenchPreview(wb._id, { enabled: false })
      return { exitCode: 0, tail: '' }
    })
    await startBuildTurn(wb._id)
    await waitFor(wb._id, 'pr_open')

    expect(mocks.runBuild).toHaveBeenCalledTimes(1)
    expect(stages().at(-1)).toBe('opening_pr')
    expect(doc(wb._id).previewUrl).toBe('http://localhost:4010')
  })

  it('com a prévia pronta: fica como está (vale na próxima implementação)', async () => {
    const wb = await workbench({ stage: 'preview', previewUrl: 'http://localhost:4010', previewHealthy: true })
    await setWorkbenchPreview(wb._id, { enabled: false })
    expect(doc(wb._id).stage).toBe('preview')
    expect(mocks.runTurn).not.toHaveBeenCalled()
    expect(noticeOf(wb._id)[0]).toContain('esta prévia continua para você aprovar ou corrigir')
  })
})

describe('religar "Gerar prévia"', () => {
  it('com a mesa parada em PR aberto: gera a prévia do código atual na hora (fila do build)', async () => {
    const wb = await workbench({ stage: 'pr_open', agenticFlow: 'auto_pr', pr: OPEN_PR })
    const dto = await setWorkbenchPreview(wb._id, { enabled: true })

    expect(dto.agenticFlow).toBe('preview')
    expect(doc(wb._id).stage).toBe('build_queued')
    expect(doc(wb._id).buildQueuedAt).toBeInstanceOf(Date)
    expect(mocks.pumpBuild).toHaveBeenCalled()
    expect(noticeOf(wb._id)).toContain('Geração de prévia ligada: gerando a prévia do código atual (fila do build).')
  })

  it('central no limite: aguarda vaga com "Gerar a prévia" e entra na fila do build quando a vaga chega', async () => {
    mocks.loadCentral.mockResolvedValue(centralWith({ maxConcurrent: 1 }))
    await workbench({ stage: 'implementing', runState: 'running' })
    const wb = await workbench({ stage: 'pr_open', agenticFlow: 'auto_pr', pr: OPEN_PR })
    const dto = await setWorkbenchPreview(wb._id, { enabled: true })

    expect(doc(wb._id).stage).toBe('pr_open')
    expect(doc(wb._id).pendingTurn).toMatchObject({ action: 'generate-preview', fromStage: 'pr_open' })
    expect(dto.slotQueue).toMatchObject({ action: 'generate-preview' })
    expect(noticeOf(wb._id)[0]).toContain('"Gerar a prévia" aguarda vaga')

    expect(await startPendingTurn(wb._id)).toBe('started')
    expect(doc(wb._id).stage).toBe('build_queued')
    expect(doc(wb._id).pendingTurn).toBeNull()
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })

  it('em outra etapa só troca o fluxo (vale na próxima implementação)', async () => {
    const wb = await workbench({ stage: 'plan_review', agenticFlow: 'auto_pr' })
    await setWorkbenchPreview(wb._id, { enabled: true })
    expect(doc(wb._id).stage).toBe('plan_review')
    expect(doc(wb._id).agenticFlow).toBe('preview')
    expect(noticeOf(wb._id)).toContain('Geração de prévia ligada: a próxima implementação volta a passar pela prévia.')
  })
})

describe('"Gerar prévia": bordas', () => {
  it.each(['finishing', 'done'])('em %s é recusada (409)', async (stage) => {
    const wb = await workbench({ stage })
    await expect(setWorkbenchPreview(wb._id, { enabled: false })).rejects.toMatchObject({ status: 409 })
    expect(doc(wb._id).agenticFlow).toBe('preview')
  })

  it('valor igual ao atual não faz nada', async () => {
    const wb = await workbench({ stage: 'pr_open', pr: OPEN_PR })
    await setWorkbenchPreview(wb._id, { enabled: true })
    expect(doc(wb._id).stage).toBe('pr_open')
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })
})

describe('"Gerar nova prévia"', () => {
  it('na prévia pronta: volta à fila do build sem replanejar nem revisar de novo, audita e avisa quem pediu', async () => {
    const wb = await workbench({ stage: 'preview', previewUrl: 'http://localhost:4010', previewHealthy: true })
    await rebuildPreview(wb._id, 'Fork 2')

    expect(doc(wb._id).stage).toBe('build_queued')
    expect(doc(wb._id).buildQueuedAt).toBeInstanceOf(Date)
    expect(mocks.pumpBuild).toHaveBeenCalled()
    expect(mocks.runTurn).not.toHaveBeenCalled()
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ novaPrevia: true, pedidoPor: 'Fork 2' }) }))
    expect(noticeOf(wb._id)).toContain('Nova prévia (pedido pelo Fork 2): reconstruindo com o código atual (fila do build).')
  })

  it('central no limite: aguarda vaga e entra na fila do build quando a vaga chega', async () => {
    mocks.loadCentral.mockResolvedValue(centralWith({ maxConcurrent: 1 }))
    await workbench({ stage: 'implementing', runState: 'running' })
    const wb = await workbench({ stage: 'preview', previewUrl: 'http://localhost:4010' })
    const dto = await rebuildPreview(wb._id)

    expect(doc(wb._id).stage).toBe('preview')
    expect(dto.slotQueue).toMatchObject({ action: 'generate-preview' })
    expect(await startPendingTurn(wb._id)).toBe('started')
    expect(doc(wb._id).stage).toBe('build_queued')
  })

  it.each(['plan_review', 'pr_open', 'implementing'])('fora da prévia pronta (%s) é recusada (409)', async (stage) => {
    const wb = await workbench({ stage, pr: stage === 'pr_open' ? OPEN_PR : null })
    await expect(rebuildPreview(wb._id)).rejects.toMatchObject({ status: 409 })
    expect(doc(wb._id).stage).toBe(stage)
  })
})
