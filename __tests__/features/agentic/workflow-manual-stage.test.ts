import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Definir etapa / concluir sem PR (OPE-88, port do MT-22): a mesa vai direto para uma etapa de
 * espera ou para `done` sem passar por implementação, prévia ou PR, com os mesmos efeitos do merge
 * na tarefa (coluna "Ao concluir"), limpeza só do que a mesa registrou — inclusive o backup do
 * MongoDB da prévia, conferido antes de concluir — e o motivo na auditoria.
 */

const mocks = vi.hoisted(() => ({
  active: new Set<string>(),
  prepareHub: vi.fn(),
  publish: vi.fn(),
  publishAgentic: vi.fn(async () => undefined),
  loadCentral: vi.fn(),
  repoForProject: vi.fn(),
  pumpQueue: vi.fn(async () => undefined),
  pumpBuildQueue: vi.fn(),
  recordAudit: vi.fn(async () => undefined),
  runTurn: vi.fn(),
  moveTask: vi.fn(async () => undefined),
  getTask: vi.fn(),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  settings: vi.fn(),
  runShell: vi.fn(async () => ({ exitCode: 0, status: 'exited', output: '' })),
  interrupt: vi.fn(async () => undefined),
  deleteSession: vi.fn(async () => true),
  sessionDirectory: '/home/u/app',
  move: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  runOpencodeShell: mocks.runShell,
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: mocks.sessionDirectory } }),
      create: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
      interrupt: mocks.interrupt,
      move: mocks.move,
    },
  })),
}))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticWorkbench: memoryModel(), AgenticCentral: memoryModel(), AgenticEvent: memoryModel(), AgenticBuild: memoryModel() }
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
  isWorkbenchActive: (id: string) => mocks.active.has(id),
  markWorkbenchActive: (id: string) => mocks.active.add(id),
  clearWorkbenchActive: (id: string) => mocks.active.delete(id),
  abortWorkbenchRun: vi.fn((id: string) => mocks.active.delete(id)),
  dropWorkbenchEvents: vi.fn(),
  flushWorkbenchEvents: vi.fn(async () => undefined),
  subscribeWorkbench: vi.fn(),
  listWorkbenchEvents: vi.fn(),
}))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: vi.fn(async () => undefined), allocatePreviewPort: vi.fn(async () => 4010), waitForPreview: vi.fn(async () => true) }))
vi.mock('@/features/agentic/server/timer-sync', () => ({ syncWorkbenchTimer: vi.fn(async () => undefined), accumulateWorkPeriodUsage: vi.fn(), closeOrphanWorkPeriods: vi.fn(async () => 0) }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: mocks.deleteSession, flushPendingSessionDeletions: vi.fn(async () => true) }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: mocks.pumpQueue }))
vi.mock('@/features/agentic/server/build-queue', () => ({ buildQueuePosition: vi.fn(async () => null), buildQueuePositions: vi.fn(async () => new Map()), pumpBuildQueue: mocks.pumpBuildQueue }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask, moveTask: mocks.moveTask }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: vi.fn(async () => false) }))
vi.mock('@/features/local-docker/server/agentic-hooks', () => ({ teardownForCleanup: vi.fn(async () => false), resolveBuildTarget: vi.fn(async () => null) }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'
import { retry, setWorkbenchStage } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

const plan = { version: 1, text: '# Plano', feedback: null, createdAt: new Date() }
/** Central com a coluna "Ao concluir" (a tarefa vai para lá, como no merge). */
const centralConfig = () => {
  const config = defaultCentralConfig('/home/u/app')
  return { ...config, columns: { ...config.columns, inheritMovement: false, onDone: 'done' } }
}

const createWorkbench = (overrides: Record<string, unknown> = {}) =>
  model.create({ centralId: 'c1', taskId: 't1', taskCode: 'OPE-88', taskTitle: 'Bug', stage: 'plan_review', runState: 'idle', sessionId: 'sess-1', sessionDirectory: '/home/u/app', plans: [plan], pendingSessionDeletions: [], startedAt: new Date(), ...overrides })

const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0, durationMs: 1 })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.active.clear()
  mocks.sessionDirectory = '/home/u/app'
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: centralConfig() })
  mocks.repoForProject.mockResolvedValue({ repo: 'org/app', repoUrl: 'https://github.com/org/app' })
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.getTask.mockResolvedValue({ id: 't1', columnId: 'doing' })
  mocks.runTurn.mockResolvedValue(succeeded('```json\n{"ok": true}\n```'))
})

describe('concluir sem PR', () => {
  it('mesa em Plano pronto conclui na hora, mantendo planos e registrando o motivo', async () => {
    const wb = await createWorkbench()
    const saved = await setWorkbenchStage(wb._id, { stage: 'done', reason: 'Já resolvido em outra tarefa' })

    expect(saved.stage).toBe('done')
    expect(saved.plans).toHaveLength(1)
    expect(saved.manualCompletion).toEqual(expect.objectContaining({ reason: 'Já resolvido em outra tarefa', fromStage: 'plan_review' }))
    expect(model.docs).toHaveLength(1)
    expect(model.docs[0]!.completedAt).toBeInstanceOf(Date)
    expect(model.docs[0]!.sessionId).toBeNull()
    expect(model.docs[0]!.pendingSessionDeletions).toContain('sess-1')
    // Nada registrado para limpar: nenhum turno do agente.
    expect(mocks.runTurn).not.toHaveBeenCalled()
    // Mesmos efeitos do merge na tarefa.
    expect(mocks.moveTask).toHaveBeenCalledWith('t1', { targetColumn: 'done' }, 'local')
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ etapaAnterior: 'plan_review', etapaDefinida: 'done', motivo: 'Já resolvido em outra tarefa', manual: true }) }))
  })

  it('falha ao mover a tarefa só avisa e conclui mesmo assim', async () => {
    mocks.moveTask.mockRejectedValueOnce(new Error('coluna inexistente'))
    const wb = await createWorkbench()
    const saved = await setWorkbenchStage(wb._id, { stage: 'done', reason: 'Resolvido' })
    expect(saved.stage).toBe('done')
    expect(mocks.publish).toHaveBeenCalledWith(wb._id, expect.objectContaining({ level: 'warn', message: expect.stringContaining('Não foi possível mover a tarefa: coluna inexistente') }))
  })

  it('com backup da prévia registrado: a limpeza remove o dump e só conclui depois de conferir', async () => {
    const backup = { dir: '/home/u/app/worktrees/.opex-backups/OPE-88/c1', path: '/home/u/app/worktrees/.opex-backups/OPE-88/c1/opex-preview-backup.archive', createdAt: new Date() }
    const wb = await createWorkbench({ stage: 'preview', previewUrl: 'http://host:4010', previewBackup: backup })
    await setWorkbenchStage(wb._id, { stage: 'done', reason: 'Resolvido fora da mesa' })
    await vi.waitFor(() => expect(model.docs[0]!.stage).toBe('done'))
    const request = mocks.runTurn.mock.calls[0]![1] as { text: string }
    expect(request.text).toContain(`rm -rf '${backup.dir}'`)
    expect(mocks.runShell).toHaveBeenCalledWith(expect.anything(), '/home/u/app', `test ! -e '${backup.path}'`, { timeoutMs: 15000 })
    expect(model.docs[0]!.previewBackup).toBeNull()
  })

  it('com backup e sem conseguir iniciar a limpeza: não conclui (fica em Finalizando com Tentar novamente)', async () => {
    mocks.availability.mockResolvedValue({ available: false, reason: 'OpenCode fora do ar' })
    const backup = { dir: '/b/c1', path: '/b/c1/opex-preview-backup.archive', createdAt: new Date() }
    const wb = await createWorkbench({ stage: 'preview', previewUrl: 'http://host:4010', previewBackup: backup })
    const saved = await setWorkbenchStage(wb._id, { stage: 'done', reason: 'Resolvido' })
    expect(saved.stage).toBe('finishing')
    expect(saved.runState).toBe('failed')
    expect(model.docs[0]!.previewBackup).not.toBeNull()
  })

  it('com worktree e branch registrados limpa só o que a mesa criou e depois conclui', async () => {
    const wb = await createWorkbench({ stage: 'preview', previewUrl: 'http://host:4010', port: 4010, worktreePath: '/home/u/app/worktrees/ope-88', branch: 'feat/ope-88' })
    await setWorkbenchStage(wb._id, { stage: 'done', reason: 'Não precisa mais' })
    await vi.waitFor(() => expect(model.docs[0]!.stage).toBe('done'))
    expect(mocks.runTurn).toHaveBeenCalledTimes(1)
    const request = mocks.runTurn.mock.calls[0]![1] as { stage: string; text: string }
    expect(request.stage).toBe('finishing')
    expect(request.text).toContain('CONCLUÍDA manualmente')
    expect(request.text).toContain('git worktree remove --force /home/u/app/worktrees/ope-88')
    expect(request.text).toContain('git branch -D feat/ope-88')
  })

  it('interrompe o turno em andamento antes de concluir', async () => {
    const wb = await createWorkbench({ stage: 'implementing', runState: 'running' })
    mocks.active.add(wb._id)
    const saved = await setWorkbenchStage(wb._id, { stage: 'done', reason: 'Parar e concluir' })
    expect(mocks.interrupt).toHaveBeenCalledWith({ sessionID: 'sess-1' })
    expect(saved.stage).toBe('done')
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ turnoInterrompido: true }) }))
  })

  it('Tentar novamente na limpeza manual refaz só os alvos registrados', async () => {
    const wb = await createWorkbench({ stage: 'finishing', runState: 'failed', branch: 'feat/ope-88', worktreePath: null, lastPrompt: { stage: 'finishing', text: 'limpeza' }, manualCompletion: { reason: 'x', fromStage: 'preview', at: new Date() } })
    await retry(wb._id)
    await vi.waitFor(() => expect(model.docs[0]!.stage).toBe('done'))
    const request = mocks.runTurn.mock.calls[0]![1] as { text: string }
    expect(request.text).toContain('CONCLUÍDA manualmente')
    expect(request.text).not.toContain('git worktree remove')
    expect(mocks.move).not.toHaveBeenCalled()
  })

  it('sessão ainda no worktree (já removido) volta ao diretório da central antes da limpeza (GO-DEV-805)', async () => {
    mocks.sessionDirectory = '/home/u/app/worktrees/ope-88'
    const wb = await createWorkbench({ stage: 'finishing', runState: 'failed', sessionDirectory: '/home/u/app/worktrees/ope-88', branch: 'feat/ope-88', worktreePath: '/home/u/app/worktrees/ope-88', lastPrompt: { stage: 'finishing', text: 'limpeza' }, manualCompletion: { reason: 'x', fromStage: 'preview', at: new Date() } })
    await retry(wb._id)
    await vi.waitFor(() => expect(model.docs[0]!.stage).toBe('done'))
    expect(mocks.move).toHaveBeenCalledWith({ sessionID: 'sess-1', directory: '/home/u/app' })
    expect(mocks.move.mock.invocationCallOrder[0]).toBeLessThan(mocks.runTurn.mock.invocationCallOrder[0]!)
  })
})

describe('definir etapa de espera', () => {
  it('volta da prévia para Plano pronto sem replanejar e descarta a espera por vaga', async () => {
    const wb = await createWorkbench({ stage: 'preview', previewUrl: 'http://host:4010', pendingTurn: { action: 'approve', stage: 'opening_pr', text: '', queuedAt: new Date() } })
    const saved = await setWorkbenchStage(wb._id, { stage: 'plan_review', reason: 'Revisar o plano de novo' })
    expect(saved.stage).toBe('plan_review')
    expect(saved.runState).toBe('idle')
    expect(model.docs[0]!.pendingTurn).toBeNull()
    expect(mocks.runTurn).not.toHaveBeenCalled()
    expect(mocks.moveTask).not.toHaveBeenCalled()
  })
})

describe('transições inválidas', () => {
  it('recusa sair de uma mesa concluída (use Reabrir)', async () => {
    const wb = await createWorkbench({ stage: 'done' })
    await expect(setWorkbenchStage(wb._id, { stage: 'plan_review', reason: 'Voltar' })).rejects.toMatchObject({ status: 409, code: 'WORKBENCH_INVALID_STAGE', message: expect.stringContaining('Reabrir') })
    expect(model.docs[0]!.stage).toBe('done')
  })

  it('recusa PR aberto quando a mesa não tem PR', async () => {
    const wb = await createWorkbench()
    await expect(setWorkbenchStage(wb._id, { stage: 'pr_open', reason: 'Acompanhar' })).rejects.toMatchObject({ status: 409, message: 'A mesa não tem um Pull Request aberto' })
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })

  it('recusa a mesa em exclusão', async () => {
    const wb = await createWorkbench({ stage: 'finishing', deletionRequestedAt: new Date() })
    await expect(setWorkbenchStage(wb._id, { stage: 'done', reason: 'Concluir' })).rejects.toMatchObject({ status: 409, code: 'WORKBENCH_DELETING' })
  })
})
