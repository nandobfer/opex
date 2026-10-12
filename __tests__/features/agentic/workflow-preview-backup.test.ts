import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Backup do MongoDB da prévia (OPE-54): o agente cria o dump antes de publicar, a retentativa
 * preserva o primeiro arquivo e a conclusão só acontece depois de removê-lo — mesmo com toda a
 * limpeza de ambiente desligada na central.
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
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  runOpencodeShell: mocks.runShell,
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: '/home/u/app/worktrees/ope-54' } }),
      create: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
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
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: vi.fn(async () => undefined), allocatePreviewPort: mocks.allocatePort, waitForPreview: mocks.waitPreview }))
vi.mock('@/features/agentic/server/build-queue', () => ({ pumpBuildQueue: mocks.pumpBuild, buildQueuePosition: vi.fn(async () => null), buildQueuePositions: vi.fn(async () => new Map()) }))
vi.mock('@/features/agentic/server/timer-sync', () => ({ syncWorkbenchTimer: mocks.syncTimer, accumulateWorkPeriodUsage: vi.fn(), closeOrphanWorkPeriods: vi.fn(async () => 0) }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: vi.fn(async () => true), flushPendingSessionDeletions: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: mocks.pumpQueue }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: vi.fn(), moveTask: mocks.moveTask }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench, type IPreviewBackup } from '@/lib/db/models/Agentic'
import { defaultCentralConfig, DEFAULT_AGENTIC_SETTINGS } from '@/features/agentic/schemas'
import { handlePrMerged, retry, startBuildTurn } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

interface State {
  stage: string
  runState: string
  error?: string | null
  previewBackup: IPreviewBackup | null
  lastPrompt?: { text: string } | null
  pr?: { number: number; url: string; state: string } | null
}

const doc = () => model.docs[0] as unknown as State
const backupOf = () => model.docs[0]!.previewBackup as IPreviewBackup

const openPr = { number: 7, url: 'https://github.com/org/app/pull/7', state: 'open', mergedAt: null, mergeCommitSha: null, lastReviewId: 0, lastCommentId: 0, closedNotified: false }

const workbench = async (overrides: Record<string, unknown> = {}) =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'OPE-54',
    taskTitle: 'Dump do MongoDB',
    stage: 'build_queued',
    runState: 'idle',
    sessionId: 'sess-1',
    sessionDirectory: '/home/u/app',
    worktreePath: '/home/u/app/worktrees/ope-54',
    branch: 'feat/ope-54',
    composeProject: 'app-ope-54',
    port: 4015,
    buildQueuedAt: new Date(),
    previewBackup: null,
    startedAt: new Date(),
    pendingSessionDeletions: [],
    plans: [],
    ...overrides,
  })

/** Central SEM limpeza de ambiente (só o backup pode exigir a etapa de limpeza). */
const centralWithoutCleanup = () => ({
  doc: { projectName: 'App', projectId: 'p1' },
  config: { ...defaultCentralConfig('/home/u/app'), cleanup: { teardownEnvironment: false, removeWorktree: false, deleteBranch: false } },
})

const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0.01, durationMs: 5 })
const shellOk = { exitCode: 0, status: 'exited', output: '' }
const shellFail = { exitCode: 1, status: 'exited', output: '' }

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue(centralWithoutCleanup())
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.allocatePort.mockResolvedValue(4015)
  mocks.waitPreview.mockResolvedValue(true)
  mocks.runTurn.mockResolvedValue(succeeded('ok\n```json\n{"ok": true}\n```'))
  mocks.runShell.mockResolvedValue(shellOk)
})

describe('build com backup (OPE-54)', () => {
  it('reserva o backup e manda criar o dump antes de publicar a prévia', async () => {
    const wb = await workbench()

    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().stage).toBe('preview'))

    const backup = backupOf()
    expect(backup.dir).toContain('/.opex-backups/OPE-54/')
    expect(backup.path).toBe(`${backup.dir}/opex-preview-backup.archive`)
    expect(doc().lastPrompt!.text).toContain('mongodump')
    expect(doc().lastPrompt!.text).toContain(backup.path)
    expect(mocks.runShell).toHaveBeenCalledWith(expect.anything(), '/home/u/app', `test -s '${backup.path}'`, { timeoutMs: 15000 })
  })

  it('sem o dump no disco, o build falha mesmo com a prévia no ar', async () => {
    const wb = await workbench()
    mocks.runShell.mockResolvedValue(shellFail)

    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().runState).toBe('failed'))

    expect(doc().stage).toBe('building')
    expect(doc().error).toContain('dump do MongoDB')
  })

  it('dump falho reportado pelo agente bloqueia a publicação', async () => {
    const wb = await workbench()
    mocks.runTurn.mockResolvedValue(succeeded('```json\n{"ok": false, "error": "mongodump indisponível"}\n```'))

    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().runState).toBe('failed'))

    expect(doc().error).toContain('mongodump indisponível')
    expect(mocks.runShell).not.toHaveBeenCalled()
  })

  it('a retentativa preserva o caminho do primeiro dump', async () => {
    const wb = await workbench()
    mocks.runShell.mockResolvedValue(shellFail)
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().runState).toBe('failed'))
    const first = backupOf().dir

    // Tentar novamente volta para a fila e o motor decide a vez.
    await retry(String(wb._id))
    expect(doc().stage).toBe('build_queued')
    expect(backupOf().dir).toBe(first)

    mocks.runShell.mockResolvedValue(shellOk)
    await startBuildTurn(String(wb._id))
    await vi.waitFor(() => expect(doc().stage).toBe('preview'))
    expect(backupOf().dir).toBe(first)
  })
})

describe('conclusão com backup (OPE-54)', () => {
  const withBackup = (overrides: Record<string, unknown> = {}) =>
    workbench({
      stage: 'pr_open',
      pr: openPr,
      previewBackup: { dir: '/home/u/app/worktrees/.opex-backups/OPE-54/tok', path: '/home/u/app/worktrees/.opex-backups/OPE-54/tok/opex-preview-backup.archive', createdAt: new Date() },
      ...overrides,
    })

  it('com toda a limpeza desligada, o backup força a limpeza: confirma a remoção e conclui', async () => {
    const wb = await withBackup()
    const stages: string[] = []
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) => {
      stages.push(request.stage)
      return succeeded('```json\n{"ok": true}\n```')
    })

    await handlePrMerged(String(wb._id), { mergedAt: new Date('2026-10-12T10:00:00Z'), mergeCommitSha: 'abc' })
    await vi.waitFor(() => expect(doc().stage).toBe('done'))

    expect(stages).toEqual(['finishing'])
    expect(doc().previewBackup).toBeNull()
    const removedPath = '/home/u/app/worktrees/.opex-backups/OPE-54/tok/opex-preview-backup.archive'
    expect(mocks.runShell).toHaveBeenCalledWith(expect.anything(), '/home/u/app', `test ! -e '${removedPath}'`, { timeoutMs: 15000 })
  })

  it('não conclui enquanto o backup existir', async () => {
    const wb = await withBackup()
    mocks.runShell.mockResolvedValue(shellFail)

    await handlePrMerged(String(wb._id), { mergedAt: new Date(), mergeCommitSha: 'abc' })
    await vi.waitFor(() => expect(doc().runState).toBe('failed'))

    expect(doc().stage).toBe('finishing')
    expect(doc().error).toContain('ainda existe')
    expect(doc().previewBackup).not.toBeNull()
  })

  it('sem conseguir iniciar a limpeza, a mesa com backup não conclui', async () => {
    const wb = await withBackup()
    mocks.availability.mockResolvedValue({ available: false, reason: 'OpenCode fora do ar' })

    await handlePrMerged(String(wb._id), { mergedAt: new Date(), mergeCommitSha: 'abc' })

    expect(doc().stage).toBe('finishing')
    expect(doc().runState).toBe('failed')
    expect(doc().previewBackup).not.toBeNull()
  })

  it('mesa sem backup conclui sem etapa de limpeza (compatível)', async () => {
    const wb = await withBackup({ previewBackup: null })
    const stages: string[] = []
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) => {
      stages.push(request.stage)
      return succeeded('```json\n{"ok": true}\n```')
    })

    await handlePrMerged(String(wb._id), { mergedAt: new Date(), mergeCommitSha: 'abc' })

    expect(doc().stage).toBe('done')
    expect(stages).toEqual([])
    expect(mocks.runShell).not.toHaveBeenCalled()
  })
})
