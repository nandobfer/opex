import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Merge automático do PR (OPE-50): com a opção ligada na central, o agente faz o merge do próprio PR
 * (merge commit) e apaga a branch remota — sem nova aprovação. O merge é confirmado no GitHub antes
 * de concluir e a exclusão da branch remota é um passo próprio.
 */

const mocks = vi.hoisted(() => ({
  prepareHub: vi.fn(),
  publish: vi.fn(),
  publishAgentic: vi.fn(async () => undefined),
  loadCentral: vi.fn(),
  repoForProject: vi.fn(async () => ({ repo: 'org/app', repoUrl: 'https://github.com/org/app' })),
  syncTimer: vi.fn(async () => undefined),
  pumpQueue: vi.fn(async () => undefined),
  recordAudit: vi.fn(async () => undefined),
  runTurn: vi.fn(),
  githubRequest: vi.fn(),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  settings: vi.fn(),
  moveTask: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: '/home/u/app/worktrees/ope-50' } }),
      create: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
    },
  })),
}))
vi.mock('@/features/github/client', () => ({ githubRequest: mocks.githubRequest, githubPaginate: vi.fn(async () => []) }))
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
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: vi.fn(async () => undefined), allocatePreviewPort: vi.fn(), waitForPreview: vi.fn() }))
vi.mock('@/features/agentic/server/timer-sync', () => ({ syncWorkbenchTimer: mocks.syncTimer, accumulateWorkPeriodUsage: vi.fn(), closeOrphanWorkPeriods: vi.fn(async () => 0) }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: vi.fn(async () => true), flushPendingSessionDeletions: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: mocks.pumpQueue }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: vi.fn(), moveTask: mocks.moveTask }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { defaultCentralConfig, DEFAULT_AGENTIC_SETTINGS } from '@/features/agentic/schemas'
import { handlePrAutoMerge } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

interface WorkbenchState {
  stage: string
  runState: string
  error?: string | null
  lastPrompt?: { text: string } | null
  branch?: string | null
  pr: { number: number; url: string; state: string; mergedAt?: Date | null; mergeCommitSha?: string | null }
}

const doc = () => model.docs[0] as unknown as WorkbenchState

const workbench = async (overrides: Record<string, unknown> = {}) =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'OPE-50',
    taskTitle: 'Merge automático',
    stage: 'pr_open',
    runState: 'idle',
    sessionId: 'sess-1',
    sessionDirectory: '/home/u/app',
    branch: 'feat/ope-50',
    worktreePath: '/home/u/app/worktrees/ope-50',
    pr: { number: 7, url: 'https://github.com/org/app/pull/7', state: 'open', mergedAt: null, mergeCommitSha: null, lastReviewId: 0, lastCommentId: 0, closedNotified: false },
    pendingSessionDeletions: [],
    plans: [],
    ...overrides,
  })

const AUTO_MERGE = { baseBranch: 'main' }

const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0.01, durationMs: 5 })

/** Configuração da central com (ou sem) o merge automático e sem limpeza (conclui na hora). */
const central = (autoMerge: boolean) => ({
  doc: { projectName: 'App', projectId: 'p1' },
  config: { ...defaultCentralConfig('/home/u/app'), cleanup: { teardownEnvironment: false, removeWorktree: false, deleteBranch: false }, git: { ...defaultCentralConfig('/home/u/app').git, autoMerge } },
})

const MERGED = { merged: true, merged_at: '2026-10-12T10:00:00Z', merge_commit_sha: 'mergesha', head: { ref: 'feat/ope-50' } }

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue(central(true))
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.githubRequest.mockResolvedValue(MERGED)
  mocks.runTurn.mockResolvedValue(succeeded('ok.\n```json\n{"ok": true}\n```'))
})

describe('handlePrAutoMerge', () => {
  it('com a opção ligada, inicia o merge na mesa que acompanha o PR', async () => {
    const wb = await workbench()
    expect(await handlePrAutoMerge(String(wb._id), AUTO_MERGE)).toBe(true)
    expect(doc().stage).toBe('merging_pr')
    expect(doc().runState).toBe('running')
    expect(doc().lastPrompt!.text).toContain('--merge')
    expect(doc().lastPrompt!.text).toContain('--admin')
  })

  it('com a opção desligada, não faz nada', async () => {
    mocks.loadCentral.mockResolvedValue(central(false))
    const wb = await workbench()
    expect(await handlePrAutoMerge(String(wb._id), AUTO_MERGE)).toBe(false)
    expect(doc().stage).toBe('pr_open')
    expect(doc().lastPrompt).toBeUndefined()
  })

  it('não age quando a mesa não está acompanhando o PR ou está executando', async () => {
    const wb = await workbench({ stage: 'preview' })
    expect(await handlePrAutoMerge(String(wb._id), AUTO_MERGE)).toBe(false)
    expect(doc().stage).toBe('preview')

    const running = await (model.create as (doc: Record<string, unknown>) => Promise<{ _id: string }>)({
      centralId: 'c1',
      taskId: 't2',
      taskCode: 'OPE-50b',
      taskTitle: 'x',
      stage: 'pr_open',
      runState: 'running',
      branch: 'feat/x',
      pr: { number: 8, url: 'https://github.com/org/app/pull/8', state: 'open', lastReviewId: 0, lastCommentId: 0, closedNotified: false },
    })
    expect(await handlePrAutoMerge(String(running._id), AUTO_MERGE)).toBe(false)
  })
})

describe('execução do merge e da exclusão da branch remota', () => {
  it('confirma o merge no GitHub, apaga a branch remota e conclui a mesa', async () => {
    const wb = await workbench()
    const stages: string[] = []
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) => {
      stages.push(request.stage)
      return succeeded('ok.\n```json\n{"ok": true}\n```')
    })
    await handlePrAutoMerge(String(wb._id), AUTO_MERGE)

    await vi.waitFor(() => expect(doc().stage).toBe('done'))
    // A exclusão remota acontece mesmo com a limpeza da branch LOCAL desligada.
    expect(stages).toEqual(['merging_pr', 'deleting_pr_branch'])
    expect(doc().pr.state).toBe('merged')
    expect(doc().pr.mergeCommitSha).toBe('mergesha')
  })

  it('o bloco JSON do agente não basta: sem confirmação do GitHub, a etapa falha', async () => {
    mocks.githubRequest.mockResolvedValue({ merged: false, merged_at: null, merge_commit_sha: null, head: { ref: 'feat/ope-50' } })
    const wb = await workbench()
    await handlePrAutoMerge(String(wb._id), AUTO_MERGE)

    await vi.waitFor(() => expect(doc().runState).toBe('failed'))
    expect(doc().stage).toBe('merging_pr')
    expect(doc().error).toContain('não confirmou o merge')
  })

  it('branch do PR divergente da esperada: conclui sem apagar a branch remota', async () => {
    mocks.githubRequest.mockResolvedValue({ ...MERGED, head: { ref: 'outra-branch' } })
    const wb = await workbench()
    const stages: string[] = []
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) => {
      stages.push(request.stage)
      return succeeded('ok.\n```json\n{"ok": true}\n```')
    })
    await handlePrAutoMerge(String(wb._id), AUTO_MERGE)

    await vi.waitFor(() => expect(doc().stage).toBe('done'))
    expect(stages).toEqual(['merging_pr'])
  })

  it('falha ao apagar a branch remota deixa a mesa para Tentar novamente', async () => {
    const wb = await workbench()
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { stage: string }) =>
      request.stage === 'merging_pr' ? succeeded('```json\n{"ok": true}\n```') : succeeded('```json\n{"ok": false, "error": "sem permissão"}\n```'),
    )
    await handlePrAutoMerge(String(wb._id), AUTO_MERGE)

    await vi.waitFor(() => expect(doc().runState).toBe('failed'))
    expect(doc().stage).toBe('deleting_pr_branch')
    expect(doc().error).toContain('sem permissão')
  })
})
