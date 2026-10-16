import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Exclusão da mesa (OPE-68): a exclusão em /desenvolvimento roda a MESMA limpeza de ambiente da
 * conclusão antes de apagar o registro e só remove a mesa quando a limpeza (e a sessão do OpenCode)
 * termina. Sem limpeza possível, a mesa permanece com Tentar novamente.
 */

const mocks = vi.hoisted(() => ({
  prepareHub: vi.fn(),
  publish: vi.fn(),
  publishAgentic: vi.fn(async () => undefined),
  loadCentral: vi.fn(),
  repoForProject: vi.fn(async () => ({ repo: 'org/app', repoUrl: 'https://github.com/org/app' })),
  syncTimer: vi.fn(async () => undefined),
  pumpQueue: vi.fn(async () => undefined),
  pumpBuild: vi.fn(async () => undefined),
  recordAudit: vi.fn(async () => undefined),
  runTurn: vi.fn(),
  runShell: vi.fn(),
  allocatePort: vi.fn(async () => 4015),
  waitPreview: vi.fn(async () => true),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  settings: vi.fn(),
  moveTask: vi.fn(async () => undefined),
  releasePort: vi.fn(async () => undefined),
  dropEvents: vi.fn(async () => undefined),
  abort: vi.fn(),
  interrupt: vi.fn(async () => undefined),
  flushPending: vi.fn(async () => true),
  active: false,
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  runOpencodeShell: mocks.runShell,
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
      create: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
      interrupt: mocks.interrupt,
    },
  })),
}))
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
  isWorkbenchActive: () => mocks.active,
  markWorkbenchActive: vi.fn(),
  clearWorkbenchActive: vi.fn(),
  abortWorkbenchRun: mocks.abort,
  dropWorkbenchEvents: mocks.dropEvents,
  flushWorkbenchEvents: vi.fn(async () => undefined),
  subscribeWorkbench: vi.fn(),
  listWorkbenchEvents: vi.fn(),
}))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: mocks.releasePort, allocatePreviewPort: mocks.allocatePort, waitForPreview: mocks.waitPreview }))
vi.mock('@/features/agentic/server/build-queue', () => ({ pumpBuildQueue: mocks.pumpBuild, buildQueuePosition: vi.fn(async () => null), buildQueuePositions: vi.fn(async () => new Map()) }))
vi.mock('@/features/agentic/server/timer-sync', () => ({ syncWorkbenchTimer: mocks.syncTimer, accumulateWorkPeriodUsage: vi.fn(), closeOrphanWorkPeriods: vi.fn(async () => 0) }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: vi.fn(async () => true), flushPendingSessionDeletions: mocks.flushPending }))
vi.mock('@/features/agentic/server/forks', () => ({ deleteWorkbenchForks: vi.fn(async () => undefined), handleWorkbenchDone: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: mocks.pumpQueue }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: vi.fn(), moveTask: mocks.moveTask }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench, type IPreviewBackup } from '@/lib/db/models/Agentic'
import { defaultCentralConfig, DEFAULT_AGENTIC_SETTINGS } from '@/features/agentic/schemas'
import { deleteWorkbench, retry } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

type Doc = Record<string, unknown>
const doc = () => model.docs[0] as unknown as Doc

const backup: IPreviewBackup = {
  dir: '/home/u/app/worktrees/.opex-backups/OPE-68/tok',
  path: '/home/u/app/worktrees/.opex-backups/OPE-68/tok/opex-preview-backup.archive',
  createdAt: new Date(),
}

const centralWithCleanup = () => ({
  doc: { projectName: 'App', projectId: 'p1' },
  config: { ...defaultCentralConfig('/home/u/app'), cleanup: { teardownEnvironment: true, removeWorktree: true, deleteBranch: true } },
})

const centralWithoutCleanup = () => ({
  doc: { projectName: 'App', projectId: 'p1' },
  config: { ...defaultCentralConfig('/home/u/app'), cleanup: { teardownEnvironment: false, removeWorktree: false, deleteBranch: false } },
})

const workbench = async (overrides: Doc = {}) =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'OPE-68',
    taskTitle: 'Excluir mesa',
    stage: 'preview',
    runState: 'idle',
    error: null,
    sessionId: 'sess-1',
    sessionDirectory: '/home/u/app',
    worktreePath: '/home/u/app/worktrees/ope-68',
    branch: 'feat/ope-68',
    composeProject: 'app-ope-68',
    port: 4015,
    previewBuild: { method: 'local' },
    previewUrl: 'http://localhost:4015',
    previewHealthy: true,
    previewBackup: null,
    pr: null,
    pendingSessionDeletions: [],
    plans: [],
    startedAt: new Date(),
    ...overrides,
  })

const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0.01, durationMs: 5 })
const shellOk = { exitCode: 0, status: 'exited', output: '' }

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.active = false
  mocks.loadCentral.mockResolvedValue(centralWithCleanup())
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.runTurn.mockResolvedValue(succeeded('ok\n```json\n{"ok": true}\n```'))
  mocks.runShell.mockResolvedValue(shellOk)
  mocks.flushPending.mockResolvedValue(true)
})

describe('exclusão com limpeza de ambiente', () => {
  it('roda a limpeza da conclusão (com os recursos da mesa) e só então apaga o registro', async () => {
    const wb = await workbench({ previewBackup: backup })
    let prompt = ''
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { text: string }) => {
      prompt = request.text
      return succeeded('```json\n{"ok": true}\n```')
    })

    const result = await deleteWorkbench(String(wb._id))

    // A request responde na hora; a mesa sai só quando a limpeza termina.
    expect(result).toEqual({ deleted: false })
    expect(doc().deletionRequestedAt).toBeInstanceOf(Date)
    expect(doc().stage).toBe('finishing')

    await vi.waitFor(() => expect(model.docs.length).toBe(0))
    expect(prompt).toContain('EXCLUÍDA')
    expect(prompt).toContain('docker compose -p app-ope-68 down')
    expect(prompt).toContain('git worktree remove --force /home/u/app/worktrees/ope-68')
    expect(prompt).toContain('git branch -D feat/ope-68')
    expect(prompt).toContain("rm -rf '/home/u/app/worktrees/.opex-backups/OPE-68/tok'")
    expect(prompt).not.toContain('mergeado')

    // O app conferiu no host que os recursos sumiram (não confia só no JSON do agente).
    expect(mocks.runShell).toHaveBeenCalledWith(expect.anything(), '/home/u/app', "test ! -e '/home/u/app/worktrees/.opex-backups/OPE-68/tok/opex-preview-backup.archive'", { timeoutMs: 15_000 })
    expect(mocks.runShell.mock.calls.some((call) => String(call[2]).includes('show-ref --verify'))).toBe(true)
    expect(mocks.runShell.mock.calls.some((call) => String(call[2]).includes('com.docker.compose.project=app-ope-68'))).toBe(true)
    expect(mocks.flushPending).toHaveBeenCalled()
    expect(mocks.releasePort).toHaveBeenCalled()
    expect(mocks.dropEvents).toHaveBeenCalled()
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'EXCLUIR' }))
    // A tarefa e o PR não são tocados.
    expect(mocks.moveTask).not.toHaveBeenCalled()
  })

  it('não apaga a mesa enquanto a limpeza não confirmar a remoção dos recursos', async () => {
    const wb = await workbench({ previewBackup: backup })
    mocks.runShell.mockResolvedValue({ exitCode: 1, status: 'exited', output: '' })

    await deleteWorkbench(String(wb._id))
    await vi.waitFor(() => expect(doc().runState).toBe('failed'))

    expect(model.docs.length).toBe(1)
    expect(doc().deletionRequestedAt).toBeInstanceOf(Date)
    expect(String(doc().error)).toContain('não confirmou')
  })

  it('limpeza incompleta relatada pelo agente bloqueia a exclusão', async () => {
    const wb = await workbench({ previewBackup: backup })
    mocks.runTurn.mockResolvedValue(succeeded('```json\n{"ok": false, "error": "docker indisponível"}\n```'))

    await deleteWorkbench(String(wb._id))
    await vi.waitFor(() => expect(doc().runState).toBe('failed'))

    expect(model.docs.length).toBe(1)
    expect(String(doc().error)).toContain('docker indisponível')
    expect(mocks.runShell).not.toHaveBeenCalled()
  })

  it('mesa só de planejamento (sem recursos) é removida na hora, sem turno do agente', async () => {
    const wb = await workbench({ stage: 'plan_review', sessionId: null, sessionDirectory: null, worktreePath: null, branch: null, port: null, previewBuild: null, previewUrl: null, previewHealthy: null })

    const result = await deleteWorkbench(String(wb._id))

    expect(result).toEqual({ deleted: true })
    expect(model.docs.length).toBe(0)
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })

  it('respeita a central: com a limpeza desligada a mesa sai sem tocar no worktree/branch (e sem backup)', async () => {
    mocks.loadCentral.mockResolvedValue(centralWithoutCleanup())
    const wb = await workbench({ previewBackup: null })

    const result = await deleteWorkbench(String(wb._id))

    expect(result).toEqual({ deleted: true })
    expect(model.docs.length).toBe(0)
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })

  it('sem poder excluir a sessão, a mesa permanece e a referência é preservada', async () => {
    const wb = await workbench({ stage: 'plan_review', worktreePath: null, branch: null, port: null, previewBuild: null, previewUrl: null, previewHealthy: null, previewBackup: null })
    mocks.flushPending.mockResolvedValue(false)

    await expect(deleteWorkbench(String(wb._id))).rejects.toThrow(/limpar o ambiente/)
    expect(model.docs.length).toBe(1)
    expect(doc().deletionRequestedAt).toBeInstanceOf(Date)
    expect(doc().sessionId).toBeNull()
    expect(doc().pendingSessionDeletions).toEqual(['sess-1'])
  })

  it('mesa concluída é apagada sem novo turno', async () => {
    const wb = await workbench({ stage: 'done', sessionId: null, sessionDirectory: null, worktreePath: null, branch: null, port: null, previewBuild: null, previewUrl: null, previewHealthy: null, previewBackup: null })

    const result = await deleteWorkbench(String(wb._id))

    expect(result).toEqual({ deleted: true })
    expect(model.docs.length).toBe(0)
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })
})

describe('retomada da exclusão (Tentar novamente)', () => {
  it('com o ambiente já limpo, retoma só a exclusão da sessão e remove a mesa', async () => {
    const wb = await workbench({
      stage: 'finishing',
      runState: 'failed',
      deletionRequestedAt: new Date(),
      sessionId: null,
      sessionDirectory: null,
      pendingSessionDeletions: ['sess-1'],
      worktreePath: null,
      branch: null,
      port: null,
      previewBuild: null,
      previewUrl: null,
      previewHealthy: null,
      previewBackup: null,
    })

    await retry(String(wb._id))

    expect(model.docs.length).toBe(0)
    expect(mocks.flushPending).toHaveBeenCalled()
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })
})
