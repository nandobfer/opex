import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fluxo da mesa (OPE-53): a tarefa pode ser preparada para **Publicar prévia** (padrão) ou
 * **PR automático**. No PR automático a implementação pula a prévia/fila do build e encadeia a
 * abertura do PR na mesma sessão; a porta da prévia nunca é reservada.
 */

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
// A fila do build não entra neste teste: a mesa em PR automático não deve passar por ela.
vi.mock('@/features/agentic/server/build-queue', () => ({ buildQueuePosition: vi.fn(async () => null), buildQueuePositions: vi.fn(async () => new Map()), pumpBuildQueue: vi.fn() }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask, moveTask: mocks.moveTask }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'
import { implement, startWorkbench, retry } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

const workbench = async (overrides: Record<string, unknown> = {}) =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'OPE-53',
    taskTitle: 'Switch de fluxo',
    stage: 'plan_review',
    runState: 'idle',
    sessionId: 'sess-1',
    sessionDirectory: '/home/u/app',
    branch: 'feat/ope-53-fluxo',
    worktreePath: '/home/u/app/worktrees/ope-53',
    composeProject: 'app-ope-53',
    pr: null,
    plans: [{ version: 1, text: '# Plano', feedback: null, createdAt: new Date() }],
    pendingSessionDeletions: [],
    startedAt: new Date(),
    ...overrides,
  })

const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0, durationMs: 1 })
const waitForStage = (stage: string) => vi.waitFor(() => expect(model.docs[0]!.stage).toBe(stage))

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
  mocks.repoForProject.mockResolvedValue(null)
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) =>
    request.stage === 'opening_pr' ? succeeded('```json\n{"url":"https://github.com/org/app/pull/9","number":9}\n```') : succeeded('ok'),
  )
})

describe('fluxo Publicar prévia (padrão)', () => {
  it('ao fim da implementação vai para a fila do build, sem abrir PR', async () => {
    const wb = await workbench({ agenticFlow: 'preview' })

    await implement(wb._id)
    await waitForStage('build_queued')

    expect(model.docs[0]!.buildQueuedAt).toBeInstanceOf(Date)
    expect(model.docs[0]!.pr).toBeNull()
    expect(mocks.allocatePort).not.toHaveBeenCalled()
  })
})

describe('fluxo PR automático', () => {
  it('pula a prévia e abre o PR direto após a implementação', async () => {
    const wb = await workbench({ agenticFlow: 'auto_pr' })

    await implement(wb._id)
    await waitForStage('pr_open')

    const doc = model.docs[0]!
    expect(doc.buildQueuedAt ?? null).toBeNull()
    expect(doc.pr).toMatchObject({ number: 9, url: 'https://github.com/org/app/pull/9', state: 'open' })
    expect(mocks.allocatePort).not.toHaveBeenCalled()
    expect(mocks.publish).toHaveBeenCalledWith(wb._id, expect.objectContaining({ type: 'notice', message: expect.stringContaining('PR automático') }))
    expect(mocks.runTurn.mock.calls.map(([, request]) => request.stage)).toEqual(['implementing', 'opening_pr'])
  })

  it('a mesa copia o fluxo salvo na tarefa ao abrir', async () => {
    mocks.getTask.mockResolvedValue({ id: 't1', code: 'OPE-53', title: 'Switch', columnId: 'col', project: { id: 'p1' }, agenticFlow: 'auto_pr' })
    await startWorkbench('c1', 't1')
    expect(model.docs[0]!.agenticFlow).toBe('auto_pr')
  })

  it('tarefa sem fluxo definido abre no padrão Publicar prévia', async () => {
    mocks.getTask.mockResolvedValue({ id: 't2', code: 'OPE-54', title: 'Outra', columnId: 'col', project: { id: 'p1' }, agenticFlow: 'preview' })
    await startWorkbench('c1', 't2')
    expect(model.docs[0]!.agenticFlow).toBe('preview')
  })
})

describe('fluxo herdado do padrão da central (OPE-79)', () => {
  const centralWith = (publishPreview: boolean) => {
    const config = defaultCentralConfig('/home/u/app')
    config.environment.publishPreview = publishPreview
    mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config })
  }
  const task = (overrides: Record<string, unknown>) =>
    mocks.getTask.mockResolvedValue({ id: 't1', code: 'OPE-79', title: 'Fluxo herdado', columnId: 'col', project: { id: 'p1' }, agenticFlow: null, ...overrides })

  it('tarefa sem escolha usa o padrão da central (Publicar prévia)', async () => {
    centralWith(true)
    await task({})
    await startWorkbench('c1', 't1')
    expect(model.docs[0]!.agenticFlow).toBe('preview')
  })

  it('tarefa sem escolha usa o padrão da central (PR automático)', async () => {
    centralWith(false)
    await task({ agenticFlow: null })
    await startWorkbench('c1', 't1')
    expect(model.docs[0]!.agenticFlow).toBe('auto_pr')
  })

  it('a escolha da tarefa vence o padrão da central', async () => {
    centralWith(false)
    await task({ agenticFlow: 'preview' })
    await startWorkbench('c1', 't1')
    expect(model.docs[0]!.agenticFlow).toBe('preview')
  })

  it('a coluna "Ao abrir a mesa" herdada do padrão global move a tarefa', async () => {
    centralWith(true)
    mocks.settings.mockResolvedValue({ settings: { ...DEFAULT_AGENTIC_SETTINGS, columns: { queue: null, onStart: 'doing', onPr: null, onDone: null } } })
    await task({})
    await startWorkbench('c1', 't1')
    expect(mocks.moveTask).toHaveBeenCalledWith('t1', { targetColumn: 'doing' }, 'local')
  })
})

describe('prévia GitHub Action', () => {
  const remote = () => {
    const config = defaultCentralConfig('/home/u/app')
    config.environment.previewMethod = 'github'
    mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config })
    mocks.repoForProject.mockResolvedValue({ repo: 'org/app', repoUrl: 'https://github.com/org/app' })
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) =>
      succeeded(request.stage === 'building' ? '```json\n{"ok":true}\n```' : 'ok'),
    )
  }

  it('encadeia build remoto sem fila e preserva a reserva da porta', async () => {
    remote()
    const wb = await workbench({ agenticFlow: 'preview', port: 4010 })
    await implement(wb._id)
    await waitForStage('preview')
    expect(model.docs[0]!.buildQueuedAt ?? null).toBeNull()
    expect(model.docs[0]!.previewBuild).toMatchObject({ method: 'github', statePath: expect.stringContaining('remote-preview-') })
    expect(model.docs[0]!.previewUrl).toBe('http://localhost:4010')
    expect(model.docs[0]!.pr).toBeNull()
    expect(mocks.runTurn.mock.calls.map(([, r]) => r.stage)).toEqual(['implementing', 'building'])
    expect(mocks.runTurn.mock.calls[1][1].text).toContain('scripts/preview-github.ts')
  })

  it('PR automático pula também o método remoto', async () => {
    remote()
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) =>
      succeeded(request.stage === 'opening_pr' ? '```json\n{"url":"https://github.com/org/app/pull/9","number":9}\n```' : 'ok'),
    )
    const wb = await workbench({ agenticFlow: 'auto_pr' })
    await implement(wb._id)
    await waitForStage('pr_open')
    expect(mocks.allocatePort).not.toHaveBeenCalled()
    expect(model.docs[0]!.previewBuild).toBeUndefined()
  })

  it('retentativa remota não entra na fila mesmo se a central agora estiver Local', async () => {
    mocks.repoForProject.mockResolvedValue({ repo: 'org/app' })
    mocks.runTurn.mockResolvedValue(succeeded('```json\n{"ok":true}\n```'))
    const wb = await workbench({ stage: 'building', runState: 'failed', port: 4010, previewBuild: { method: 'github', attempt: 'old', statePath: '/tmp/old' }, lastPrompt: { stage: 'building', text: 'old' } })
    await retry(wb._id)
    await waitForStage('preview')
    expect(model.docs[0]!.buildQueuedAt ?? null).toBeNull()
    expect((model.docs[0]!.previewBuild as { attempt: string }).attempt).not.toBe('old')
  })
})
