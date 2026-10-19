import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * CI falho no PR (OPE-81): a rotina de acompanhamento aciona o agente para corrigir a branch do PR
 * (ou reexecutar a falha de infraestrutura) sem nova aprovação; ao concluir, a mesa volta a
 * acompanhar o PR (`pr_open`).
 */

const mocks = vi.hoisted(() => ({
  prepareHub: vi.fn(),
  publish: vi.fn(),
  publishAgentic: vi.fn(async () => undefined),
  loadCentral: vi.fn(),
  repoForProject: vi.fn(async () => null),
  syncTimer: vi.fn(async () => undefined),
  pumpQueue: vi.fn(async () => undefined),
  recordAudit: vi.fn(async () => undefined),
  runTurn: vi.fn(),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  settings: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: '/home/u/app/worktrees/ope-81' } }),
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
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: vi.fn(async () => undefined), allocatePreviewPort: vi.fn(), waitForPreview: vi.fn() }))
vi.mock('@/features/agentic/server/timer-sync', () => ({ syncWorkbenchTimer: mocks.syncTimer, accumulateWorkPeriodUsage: vi.fn(), closeOrphanWorkPeriods: vi.fn(async () => 0) }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: vi.fn(async () => true), flushPendingSessionDeletions: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: mocks.pumpQueue }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: vi.fn(), moveTask: vi.fn() }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { defaultCentralConfig, DEFAULT_AGENTIC_SETTINGS } from '@/features/agentic/schemas'
import { handlePrCiFailure, handlePrCiLimit } from '@/features/agentic/server/workflow'
import type { CiFailure } from '@/features/agentic/ci'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

interface WorkbenchState {
  stage: string
  runState: string
  error?: string | null
  previewHealthy?: boolean
  lastPrompt?: { text: string } | null
  pr: { state: string; ciFixKey?: string | null; ciFixHeadSha?: string | null; ciFixAttempts?: number; ciFixLimitNotified?: boolean }
}

const doc = () => model.docs[0] as unknown as WorkbenchState

const workbench = async (overrides: Record<string, unknown> = {}) =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'OPE-81',
    taskTitle: 'Corrigir o CI do PR',
    stage: 'pr_open',
    runState: 'idle',
    sessionId: 'sess-1',
    sessionDirectory: '/home/u/app',
    branch: 'feat/ope-81',
    worktreePath: '/home/u/app/worktrees/ope-81',
    previewHealthy: true,
    pr: { number: 7, url: 'https://github.com/org/app/pull/7', state: 'open', mergedAt: null, mergeCommitSha: null, lastReviewId: 0, lastCommentId: 0, closedNotified: false },
    pendingSessionDeletions: [],
    plans: [],
    ...overrides,
  })

const FAILURE: CiFailure = { id: 'check:31', name: 'test', url: 'https://github.com/org/app/actions/runs/900/job/901', runId: 900, jobId: 901, summary: '1 teste falhou' }
const CI = { headBranch: 'feat/ope-81', headSha: 'head-1', failures: [FAILURE], key: 'head-1:check:31', rerunAllowed: true, attempt: 1 }

const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0.01, durationMs: 5 })

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  // Sem JSON final: o turno fica pendente e o estado inicial da mesa é estável para as asserções.
  mocks.runTurn.mockReturnValue(new Promise(() => undefined))
})

describe('handlePrCiFailure', () => {
  it('inicia a correção na mesma sessão, grava as falhas tratadas e envia o prompt do CI', async () => {
    const wb = await workbench()
    expect(await handlePrCiFailure(String(wb._id), CI)).toBe(true)

    expect(doc().stage).toBe('fixing_ci')
    expect(doc().runState).toBe('running')
    expect(doc().pr).toMatchObject({ ciFixKey: 'head-1:check:31', ciFixHeadSha: 'head-1', ciFixAttempts: 1, ciFixLimitNotified: false })
    expect(doc().lastPrompt!.text).toContain('gh run view <run> --log-failed')
    expect(doc().lastPrompt!.text).toContain('gh run rerun <run> --failed')
    expect(mocks.recordAudit).toHaveBeenCalled()
  })

  it('não faz nada com a correção de CI desligada (padrão global herdado)', async () => {
    const wb = await workbench()
    mocks.settings.mockResolvedValue({ settings: { ...DEFAULT_AGENTIC_SETTINGS, ci: { fixCi: false, ciFixLimit: null } } })
    expect(await handlePrCiFailure(String(wb._id), CI)).toBe(false)
    expect(doc().stage).toBe('pr_open')
  })

  it('central que personaliza vence o padrão global', async () => {
    const wb = await workbench()
    const config = defaultCentralConfig('/home/u/app')
    mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: { ...config, git: { ...config.git, inheritCi: false, fixCi: true } } })
    mocks.settings.mockResolvedValue({ settings: { ...DEFAULT_AGENTIC_SETTINGS, ci: { fixCi: false, ciFixLimit: null } } })
    expect(await handlePrCiFailure(String(wb._id), CI)).toBe(true)
    expect(doc().stage).toBe('fixing_ci')
  })

  it('não faz nada quando a mesa não está acompanhando o PR aberto', async () => {
    const wb = await workbench({ stage: 'preview' })
    expect(await handlePrCiFailure(String(wb._id), CI)).toBe(false)
    expect(doc().stage).toBe('preview')
  })

  it('avisa e mantém a mesa elegível quando a correção não pode começar', async () => {
    const wb = await workbench()
    mocks.availability.mockResolvedValue({ available: false, reason: 'OpenCode desconectado' })
    expect(await handlePrCiFailure(String(wb._id), CI)).toBe(false)
    expect(doc().stage).toBe('pr_open')
    expect(doc().pr.ciFixKey).toBeUndefined()
    expect(mocks.publish).toHaveBeenCalledWith(String(wb._id), expect.objectContaining({ type: 'notice', level: 'warn' }))
  })
})

describe('conclusão da correção de CI', () => {
  it('push da correção volta a acompanhar o PR e invalida a prévia', async () => {
    const wb = await workbench()
    mocks.runTurn.mockResolvedValue(succeeded('Corrigido.\n```json\n{"ok": true, "sha": "abc1234"}\n```'))
    await handlePrCiFailure(String(wb._id), CI)

    await vi.waitFor(() => expect(doc().stage).toBe('pr_open'))
    expect(doc().runState).toBe('idle')
    expect(doc().previewHealthy).toBe(false)
  })

  it('só reexecução volta a acompanhar o PR sem invalidar a prévia', async () => {
    const wb = await workbench()
    mocks.runTurn.mockResolvedValue(succeeded('Reexecutei.\n```json\n{"ok": true, "rerun": true}\n```'))
    await handlePrCiFailure(String(wb._id), CI)

    await vi.waitFor(() => expect(doc().stage).toBe('pr_open'))
    expect(doc().previewHealthy).toBe(true)
  })

  it('marca falha quando o agente não conclui a correção (Tentar novamente / Voltar ao planejamento)', async () => {
    const wb = await workbench()
    mocks.runTurn.mockResolvedValue(succeeded('```json\n{"ok": false, "error": "teste instável"}\n```'))
    await handlePrCiFailure(String(wb._id), CI)

    await vi.waitFor(() => expect(doc().runState).toBe('failed'))
    expect(doc().stage).toBe('fixing_ci')
    expect(doc().error).toContain('teste instável')
  })
})

describe('handlePrCiLimit', () => {
  it('avisa do limite e marca o aviso como dado', async () => {
    const wb = await workbench()
    await handlePrCiLimit(String(wb._id), { max: 3 })
    expect(mocks.publish).toHaveBeenCalledWith(String(wb._id), expect.objectContaining({ type: 'notice', level: 'warn', message: expect.stringContaining('limite de 3') }))
    expect(doc().pr.ciFixLimitNotified).toBe(true)
  })
})
