import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Espera por vaga: mesas em Plano pronto, Prévia pronta e PR aberto (e concluídas, ao reabrir) não
 * ocupam vaga no limite da central. Ao voltar a executar com o limite cheio, a ação fica em
 * `pendingTurn` (a mesa aguarda vaga) e o motor da central a lança depois (`startPendingTurn`).
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
import { cancelWait, handlePrConflict, handlePrMerged, implement, reopen, revisePlan, startPendingTurn, startWorkbench } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

interface WorkbenchState {
  stage: string
  runState: string
  pendingTurn: { action: string; stage: string; fromStage: string; reopen: boolean } | null
  pr: { state: string; conflictHeadSha?: string | null } | null
  pastPrs: unknown[]
}

const PR = { number: 7, url: 'https://github.com/org/app/pull/7', state: 'open', mergedAt: null, mergeCommitSha: null, lastReviewId: 0, lastCommentId: 0, closedNotified: false }

const state = (id: string) => model.docs.find((doc) => String(doc._id) === id) as unknown as WorkbenchState

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

/** Ocupa a única vaga da central (limite 1) com uma mesa executando. */
const occupySlot = () => workbench({ stage: 'implementing', runState: 'running' })

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: { ...defaultCentralConfig('/home/u/app'), maxConcurrent: 1 } })
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.task.mockImplementation(async (id: string) => ({ id, code: 'OPE-3', title: 'Tarefa', project: { id: 'p1' }, columnId: 'development' }))
  // O turno fica pendente: o estado logo após o lançamento é estável para as asserções.
  mocks.runTurn.mockReturnValue(new Promise(() => undefined))
})

describe('ações de mesas que não ocupam vaga', () => {
  it('duas aberturas manuais simultâneas não ultrapassam o limite', async () => {
    const results = await Promise.allSettled([startWorkbench('c1', 'new-1'), startWorkbench('c1', 'new-2')])
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
    expect(model.docs).toHaveLength(1)
    expect(mocks.runTurn).toHaveBeenCalledTimes(1)
  })

  it('abrir manualmente não passa na frente de uma retomada esperando', async () => {
    await workbench({ pendingTurn: { action: 'implement', stage: 'implementing', fromStage: 'plan_review', queuedAt: new Date() } })
    await expect(startWorkbench('c1', 'new-1')).rejects.toMatchObject({ code: 'CENTRAL_BUSY' })
    expect(model.docs).toHaveLength(1)
  })

  it('duas ações simultâneas na mesma mesa não lançam turnos duplicados', async () => {
    const id = await workbench()
    const results = await Promise.allSettled([implement(id), implement(id)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(mocks.runTurn).toHaveBeenCalledTimes(1)
  })

  it('duas retomadas simultâneas respeitam uma vaga e enfileiram a segunda', async () => {
    const first = await workbench()
    const second = await workbench()
    await Promise.all([implement(first), implement(second)])
    expect([state(first), state(second)].filter((item) => item.stage === 'implementing')).toHaveLength(1)
    expect([state(first), state(second)].filter((item) => item.pendingTurn)).toHaveLength(1)
    expect(mocks.runTurn).toHaveBeenCalledTimes(1)
  })

  it('com vaga livre, implementar começa na hora (Plano pronto não conta no limite)', async () => {
    await workbench({ stage: 'preview' })
    await workbench({ stage: 'pr_open', pr: PR })
    const id = await workbench()

    const dto = await implement(id)
    expect(state(id).stage).toBe('implementing')
    expect(state(id).pendingTurn).toBeNull()
    expect(mocks.runTurn).toHaveBeenCalledTimes(1)
    expect(dto.slotQueue).toBeNull()
  })

  it('com o limite cheio, implementar aguarda vaga sem sair do Plano pronto', async () => {
    await occupySlot()
    const id = await workbench()

    const dto = await implement(id, 'detalhe')
    expect(state(id).stage).toBe('plan_review')
    expect(state(id).runState).toBe('idle')
    expect(state(id).pendingTurn).toMatchObject({ action: 'implement', stage: 'implementing', fromStage: 'plan_review' })
    expect(dto.slotQueue).toEqual({ position: 1, action: 'implement' })
    expect(mocks.runTurn).not.toHaveBeenCalled()
    expect(mocks.publish).toHaveBeenCalledWith(id, expect.objectContaining({ type: 'notice', message: expect.stringContaining('aguarda vaga') }))
  })

  it('respeita a ordem: com retomada esperando antes, a nova ação também aguarda mesmo com vaga', async () => {
    await workbench({ stage: 'preview', pendingTurn: { action: 'approve', stage: 'opening_pr', text: 'pr', userText: null, feedback: null, extraSet: null, reopen: false, fromStage: 'preview', queuedAt: new Date('2026-10-15T10:00:00Z') } })
    const id = await workbench()

    const dto = await implement(id)
    expect(state(id).pendingTurn).not.toBeNull()
    expect(dto.slotQueue?.position).toBe(2)
  })

  it('OpenCode indisponível continua sendo erro na hora (não entra na espera)', async () => {
    await occupySlot()
    const id = await workbench()
    mocks.availability.mockResolvedValue({ available: false, reason: 'OpenCode desconectado' })

    await expect(implement(id)).rejects.toMatchObject({ code: 'AGENTIC_UNAVAILABLE' })
    expect(state(id).pendingTurn).toBeNull()
  })

  it('enquanto aguarda vaga, as demais ações ficam bloqueadas', async () => {
    await occupySlot()
    const id = await workbench()
    await implement(id)

    await expect(revisePlan(id, 'Mude o plano')).rejects.toMatchObject({ code: 'WORKBENCH_INVALID_STATE' })
  })
})

describe('startPendingTurn', () => {
  it('lança a retomada com o turno guardado e limpa a espera', async () => {
    const busy = await occupySlot()
    const id = await workbench()
    await implement(id, 'detalhe')
    model.docs.splice(model.docs.findIndex((doc) => String(doc._id) === busy), 1)

    expect(await startPendingTurn(id)).toBe('started')
    expect(state(id).stage).toBe('implementing')
    expect(state(id).runState).toBe('running')
    expect(state(id).pendingTurn).toBeNull()
  })

  it('descarta a espera quando a mesa já mudou de etapa', async () => {
    const id = await workbench({ stage: 'implementing', pendingTurn: { action: 'implement', stage: 'implementing', text: 'x', userText: null, feedback: null, extraSet: null, reopen: false, fromStage: 'plan_review', queuedAt: new Date() } })

    expect(await startPendingTurn(id)).toBe('dropped')
    expect(state(id).pendingTurn).toBeNull()
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })

  it('indisponível: mantém a espera e lança o erro (o motor tenta depois)', async () => {
    await occupySlot()
    const id = await workbench()
    await implement(id)
    mocks.availability.mockResolvedValue({ available: false, reason: 'OpenCode desconectado' })

    await expect(startPendingTurn(id)).rejects.toMatchObject({ code: 'AGENTIC_UNAVAILABLE' })
    expect(state(id).pendingTurn).not.toBeNull()
  })
})

describe('cancelWait', () => {
  it('cancela a espera, audita e volta a aguardar o usuário', async () => {
    await occupySlot()
    const id = await workbench()
    await implement(id)

    const dto = await cancelWait(id)
    expect(state(id).pendingTurn).toBeNull()
    expect(state(id).stage).toBe('plan_review')
    expect(dto.slotQueue).toBeNull()
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidadeId: id, depois: expect.objectContaining({ aguardandoVaga: null }) }))
  })

  it('sem espera, cancelar é recusado', async () => {
    const id = await workbench()
    await expect(cancelWait(id)).rejects.toMatchObject({ code: 'WORKBENCH_INVALID_STATE' })
  })
})

describe('reabrir mesa concluída', () => {
  it('com o limite cheio, os efeitos da reabertura só rodam ao ganhar a vaga', async () => {
    const busy = await occupySlot()
    const merged = { ...PR, state: 'merged' }
    const id = await workbench({ stage: 'done', pr: merged })

    await reopen(id, 'Ajustar o texto')
    expect(state(id).stage).toBe('done')
    expect(state(id).pr).toMatchObject({ state: 'merged' })
    expect(state(id).pastPrs).toHaveLength(0)
    expect(state(id).pendingTurn).toMatchObject({ action: 'reopen', reopen: true, fromStage: 'done' })

    model.docs.splice(model.docs.findIndex((doc) => String(doc._id) === busy), 1)
    expect(await startPendingTurn(id)).toBe('started')
    expect(state(id).stage).toBe('planning')
    expect(state(id).pr).toBeNull()
    expect(state(id).pastPrs).toHaveLength(1)
  })
})

describe('eventos do PR', () => {
  it('conflito com o limite cheio aguarda vaga e só grava os SHAs tratados ao começar', async () => {
    const busy = await occupySlot()
    const id = await workbench({ stage: 'pr_open', pr: PR })
    const conflict = { baseBranch: 'main', headBranch: 'feat/ope', baseSha: 'base-1', headSha: 'head-1' }

    expect(await handlePrConflict(id, conflict)).toBe(true)
    expect(state(id).stage).toBe('pr_open')
    expect(state(id).pendingTurn).toMatchObject({ action: 'pr-conflict', stage: 'resolving_conflicts' })
    expect(state(id).pr?.conflictHeadSha).toBeUndefined()
    // Uma nova varredura não reenfileira a mesa que já aguarda.
    expect(await handlePrConflict(id, conflict)).toBe(false)

    model.docs.splice(model.docs.findIndex((doc) => String(doc._id) === busy), 1)
    await startPendingTurn(id)
    expect(state(id).stage).toBe('resolving_conflicts')
    expect(state(id).pr?.conflictHeadSha).toBe('head-1')
  })

  it('merge com o limite cheio: a limpeza aguarda vaga em vez de ser pulada', async () => {
    await occupySlot()
    const id = await workbench({ stage: 'pr_open', pr: PR, previewUrl: 'http://localhost:4001' })

    await handlePrMerged(id, { mergedAt: new Date(), mergeCommitSha: 'abc' })
    expect(state(id).stage).toBe('pr_open')
    expect(state(id).pr).toMatchObject({ state: 'merged' })
    expect(state(id).pendingTurn).toMatchObject({ action: 'pr-cleanup', stage: 'finishing' })
  })

  it('merge descarta uma espera anterior (ex.: replanejar) antes de seguir', async () => {
    const id = await workbench({ stage: 'pr_open', pr: PR, pendingTurn: { action: 'pr-feedback', stage: 'planning', text: 'x', userText: null, feedback: 'x', extraSet: null, reopen: false, fromStage: 'pr_open', queuedAt: new Date() } })

    await handlePrMerged(id, { mergedAt: new Date(), mergeCommitSha: 'abc' })
    expect(state(id).pendingTurn).toBeNull()
    expect(state(id).stage).toBe('finishing')
  })
})
