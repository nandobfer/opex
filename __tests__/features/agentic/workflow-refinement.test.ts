import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Refinamento na mesa de trabalho (OPE-137): "Refinar tarefa" abre a mesa em "Refinando" (ocupa vaga) ou
 * em "Especificação pronta" (não ocupa); sem vaga, a tarefa vai para a fila da central; a mesa reflete o
 * estado final do refinamento (concluído → Especificação pronta ou, com "Gerar plano após refinar", o
 * planejamento) e as saídas de "Especificação pronta" respeitam a vaga.
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
  moveTask: vi.fn(async () => undefined),
  isActive: vi.fn<(runId: string) => boolean>(() => false),
  snapshot: vi.fn(),
  refinementState: vi.fn(),
  startRefinement: vi.fn(async () => undefined),
  continueRefinement: vi.fn(async () => undefined),
  restartRefinement: vi.fn(async () => undefined),
  sendRefinementMessage: vi.fn(async () => undefined),
  queueRefinementStart: vi.fn(async () => ({ refinement: { id: 'r1' } })),
  takeQueued: vi.fn(async () => null),
  release: vi.fn(async () => undefined),
  queueList: vi.fn(async () => [{ taskId: 't-fila', position: 2 }]),
}))

// Métricas dos agentes (OPE-122): o registro dos fatos é mockado (sem banco nem consulta real).
vi.mock('@/features/agent-metrics/server/record', () => ({ recordWorkbenchEvent: vi.fn(async () => undefined), recordPrReviewReplanned: vi.fn(async () => undefined), recordAgentEvent: vi.fn(), recordAgentRun: vi.fn() }))
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
// O serviço do refinamento é o mesmo da página da tarefa: aqui só o que a mesa chama dele.
vi.mock('@/features/refinement/server/service', () => ({
  refinementSnapshot: mocks.snapshot,
  getRefinementState: mocks.refinementState,
  startRefinement: mocks.startRefinement,
  continueRefinement: mocks.continueRefinement,
  restartRefinement: mocks.restartRefinement,
  sendRefinementMessage: mocks.sendRefinementMessage,
  queueRefinementStart: mocks.queueRefinementStart,
  takeQueuedRefinementStart: mocks.takeQueued,
  releaseRefinementSession: mocks.release,
}))
// Modelo do Agente Refinador (base do papel "Refinamento" da mesa).
vi.mock('@/features/ai/server/settings', () => ({ loadTaskRefinementSettings: async () => ({ settings: { agent: 'plan', model: 'anthropic/opus', variant: null } }) }))
vi.mock('@/lib/db/models/Refinement', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { TaskRefinement: memoryModel() }
})
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
  isWorkbenchActive: mocks.isActive,
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
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: mocks.pumpQueue, listCentralQueue: mocks.queueList }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.task, moveTask: mocks.moveTask }))
vi.mock('@/features/ai/task-context-prompt', () => ({ buildTaskContextPrompt: vi.fn(() => 'tarefa') }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { TaskRefinement } from '@/lib/db/models/Refinement'
import { defaultCentralConfig, DEFAULT_AGENTIC_SETTINGS } from '@/features/agentic/schemas'
import {
  applyRefinementState,
  continueRefinementInWorkbench,
  generatePlan,
  refineWorkbench,
  setWorkbenchPlanAfterRefinement,
  startPendingTurn,
  startWorkbench,
  startWorkbenchFromQueue,
} from '@/features/agentic/server/workflow'

type Docs = { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }
const workbenches = AgenticWorkbench as unknown as Docs
const refinements = TaskRefinement as unknown as Docs

const byTask = (taskId: string) => workbenches.docs.find((doc) => doc.taskId === taskId) as Record<string, unknown> | undefined
const byId = (id: string) => workbenches.docs.find((doc) => String(doc._id) === id) as Record<string, unknown>

/** Refinamento existente da tarefa (o que `refinementSnapshot` devolve). */
const snapshot = (patch: Record<string, unknown> = {}) => ({ id: 'r1', concluded: false, running: false, liveChat: true, queuedStart: null, ...patch })

const workbench = async (overrides: Record<string, unknown> = {}) =>
  String(
    (
      await workbenches.create({
        centralId: 'c1',
        taskId: 't1',
        taskCode: 'OPE-1',
        taskTitle: 'Tarefa',
        stage: 'refining',
        runState: 'running',
        refinementPhase: true,
        planAfterRefinement: false,
        sessionId: null,
        pendingTurn: null,
        pendingPermissions: [],
        pendingForms: [],
        pendingSessionDeletions: [],
        plans: [],
        pr: null,
        pastPrs: [],
        startedAt: new Date(),
        ...overrides,
      })
    )._id,
  )

/** Ocupa a única vaga da central (limite 1) com outra mesa executando. */
const occupySlot = () => workbench({ taskId: 'outra', taskCode: 'OPE-9', stage: 'implementing', runState: 'running' })

const SETTINGS_WITH_QUEUE = { ...DEFAULT_AGENTIC_SETTINGS, columns: { ...DEFAULT_AGENTIC_SETTINGS.columns, queue: 'opencode' } }

beforeEach(() => {
  vi.clearAllMocks()
  workbenches.docs.length = 0
  refinements.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: { ...defaultCentralConfig('/home/u/app'), maxConcurrent: 1 } })
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.task.mockImplementation(async (id: string) => ({ id, code: 'OPE-1', title: 'Tarefa', project: { id: 'p1' }, columnId: 'development', agenticFlow: null, planAfterRefinement: null }))
  mocks.snapshot.mockResolvedValue(null)
  mocks.refinementState.mockResolvedValue({ refinement: null, availability: { available: true, reason: null }, workbench: null, refinerModel: null })
  mocks.isActive.mockReturnValue(false)
  mocks.runTurn.mockReturnValue(new Promise(() => undefined))
})

describe('Refinar tarefa (tela inicial da mesa)', () => {
  it('sem refinamento: a mesa nasce em Refinando e o texto e os anexos vão no primeiro prompt', async () => {
    const result = await refineWorkbench('c1', 't1', { text: '  Use o componente X  ' })
    const doc = byTask('t1')!
    expect(result.queue).toBeNull()
    expect(doc).toMatchObject({ stage: 'refining', refinementPhase: true, planAfterRefinement: false })
    expect(mocks.startRefinement).toHaveBeenCalledWith('t1', { text: 'Use o componente X', fileIds: [], fromWorkbench: true })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'CRIAR', depois: expect.objectContaining({ etapa: 'Refinando', origem: 'Refinar tarefa' }) }))
  })

  it('"Gerar plano após refinar" da tarefa vence o padrão da central (desligado)', async () => {
    mocks.task.mockImplementation(async (id: string) => ({ id, code: 'OPE-1', title: 'Tarefa', project: { id: 'p1' }, columnId: 'development', planAfterRefinement: true }))
    await refineWorkbench('c1', 't1', {})
    expect(byTask('t1')!.planAfterRefinement).toBe(true)
  })

  it('refinamento já concluído: abre em Especificação pronta sem precisar de vaga e sem novo turno', async () => {
    await occupySlot()
    mocks.snapshot.mockResolvedValue(snapshot({ concluded: true }))
    const result = await refineWorkbench('c1', 't1', { text: 'ignorado' })
    expect(result.workbench?.stage).toBe('spec_ready')
    expect(mocks.startRefinement).not.toHaveBeenCalled()
    expect(mocks.continueRefinement).not.toHaveBeenCalled()
  })

  it('refinamento em andamento (página da tarefa) rodando: continua a mesma conversa, sem turno novo', async () => {
    mocks.snapshot.mockResolvedValue(snapshot({ running: true }))
    await refineWorkbench('c1', 't1', {})
    expect(byTask('t1')!.stage).toBe('refining')
    expect(mocks.startRefinement).not.toHaveBeenCalled()
    expect(mocks.continueRefinement).not.toHaveBeenCalled()
    expect(mocks.sendRefinementMessage).not.toHaveBeenCalled()
  })

  it('rodando com texto: o texto vai como mensagem do chat ao vivo', async () => {
    mocks.snapshot.mockResolvedValue(snapshot({ running: true }))
    await refineWorkbench('c1', 't1', { text: 'considere o módulo X' })
    expect(mocks.sendRefinementMessage).toHaveBeenCalledWith('t1', 'considere o módulo X', [])
  })

  it('rodando com texto e o chat ao vivo desligado: recusa sem abrir a mesa', async () => {
    mocks.snapshot.mockResolvedValue(snapshot({ running: true, liveChat: false }))
    await expect(refineWorkbench('c1', 't1', { text: 'x' })).rejects.toMatchObject({ code: 'LIVE_CHAT_DISABLED' })
    expect(byTask('t1')).toBeUndefined()
  })

  it('refinamento parado: retoma a mesma conversa com o texto', async () => {
    mocks.snapshot.mockResolvedValue(snapshot())
    await refineWorkbench('c1', 't1', { text: 'mais um detalhe' })
    expect(mocks.continueRefinement).toHaveBeenCalledWith('t1', { text: 'mais um detalhe', fileIds: [], fromWorkbench: true })
  })

  it('falha ao iniciar o refinamento desfaz a abertura da mesa', async () => {
    mocks.startRefinement.mockRejectedValueOnce(Object.assign(new Error('OpenCode fora'), { code: 'X' }))
    await expect(refineWorkbench('c1', 't1', {})).rejects.toThrow('OpenCode fora')
    expect(byTask('t1')).toBeUndefined()
  })

  it('Agente Refinador indisponível: recusa com o motivo', async () => {
    mocks.refinementState.mockResolvedValue({ refinement: null, availability: { available: false, reason: 'OpenCode não está conectado' }, workbench: null, refinerModel: null })
    await expect(refineWorkbench('c1', 't1', {})).rejects.toMatchObject({ code: 'REFINEMENT_UNAVAILABLE', message: 'OpenCode não está conectado' })
  })

  it('sem vaga e com coluna de fila: guarda o pedido, move a tarefa para a fila e devolve a posição', async () => {
    mocks.settings.mockResolvedValue({ settings: SETTINGS_WITH_QUEUE })
    await occupySlot()
    const result = await refineWorkbench('c1', 't-fila', { text: 'texto' })
    expect(result).toEqual({ workbench: null, queue: { position: 2 } })
    expect(byTask('t-fila')).toBeUndefined()
    expect(mocks.queueRefinementStart).toHaveBeenCalledWith('t-fila', { text: 'texto', fileIds: [], modelOverrides: {} })
    expect(mocks.moveTask).toHaveBeenCalledWith('t-fila', { targetColumn: 'opencode' }, 'local')
    expect(mocks.startRefinement).not.toHaveBeenCalled()
  })

  it('sem vaga e sem coluna de fila: recusa (CENTRAL_BUSY)', async () => {
    await occupySlot()
    await expect(refineWorkbench('c1', 't1', {})).rejects.toMatchObject({ code: 'CENTRAL_BUSY' })
    expect(mocks.queueRefinementStart).not.toHaveBeenCalled()
  })
})

describe('Abrir mesa e gerar o plano com refinamento (item 8)', () => {
  it('refinamento não concluído bloqueia o planejamento direto', async () => {
    mocks.snapshot.mockResolvedValue(snapshot())
    await expect(startWorkbench('c1', 't1')).rejects.toMatchObject({ code: 'REFINEMENT_IN_PROGRESS', message: 'Há um refinamento em andamento. Continue-o pelo Refinar tarefa ou encerre-o.' })
    expect(byTask('t1')).toBeUndefined()
  })

  it('refinamento concluído: segue o fluxo atual, direto para o planejamento', async () => {
    mocks.snapshot.mockResolvedValue(snapshot({ concluded: true }))
    await startWorkbench('c1', 't1')
    expect(byTask('t1')!.stage).toBe('planning')
  })
})

describe('fila da central e coluna Opencode (item 19)', () => {
  it('refinamento não concluído: a mesa nasce em Refinando com o pedido guardado sem vaga', async () => {
    mocks.snapshot.mockResolvedValue(snapshot({ queuedStart: { text: 'pedido guardado', fileIds: [], modelOverrides: null } }))
    await startWorkbenchFromQueue('c1', 't1')
    expect(byTask('t1')).toMatchObject({ stage: 'refining', refinementPhase: true })
    expect(mocks.continueRefinement).toHaveBeenCalledWith('t1', { text: 'pedido guardado', fileIds: [], fromWorkbench: true })
    expect(mocks.takeQueued).toHaveBeenCalledWith('t1')
  })

  it('sem refinamento: abre no planejamento como antes', async () => {
    await startWorkbenchFromQueue('c1', 't1')
    expect(byTask('t1')!.stage).toBe('planning')
    expect(mocks.startRefinement).not.toHaveBeenCalled()
  })
})

describe('a mesa reflete o estado final do refinamento', () => {
  const refinement = (patch: Record<string, unknown>) => refinements.create({ taskId: 't1', runState: 'idle', resolved: false, closedAt: null, spec: null, pendingForms: [], pendingPermissions: [], error: null, ...patch })

  it('agente rodando com pergunta pendente: Refinando espelha o status e as contagens', async () => {
    const id = await workbench({ runState: 'idle' })
    const { _id } = await refinement({ runState: 'running', pendingForms: [{ id: 'f1' }] })
    mocks.isActive.mockImplementation((runId: string) => runId === String(_id))
    await applyRefinementState(id)
    expect(byId(id)).toMatchObject({ stage: 'refining', runState: 'running', refinementId: String(_id), refinementPending: { forms: 1, permissions: 0 } })
  })

  it('concluído com "Gerar plano após refinar" desligado: vai para Especificação pronta', async () => {
    const id = await workbench()
    await refinement({ resolved: true, spec: '- critério' })
    await applyRefinementState(id)
    expect(byId(id)).toMatchObject({ stage: 'spec_ready', runState: 'idle', error: null })
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })

  it('concluído pela reconexão (turno recuperado): o efeito sai pelo estado final, não pelo gatilho', async () => {
    const id = await workbench({ runState: 'interrupted' })
    await refinement({ resolved: true, spec: '- critério' })
    await applyRefinementState(id)
    expect(byId(id).stage).toBe('spec_ready')
  })

  it('concluído com o switch ligado: a mesa passa sozinha ao planejamento e libera a sessão do refinamento', async () => {
    const id = await workbench({ planAfterRefinement: true })
    await refinement({ resolved: true, spec: '- critério' })
    await applyRefinementState(id)
    expect(byId(id).stage).toBe('planning')
    await vi.waitFor(() => expect(mocks.release).toHaveBeenCalledWith('t1'))
  })

  it('encerrado sem especificação: Especificação pronta mesmo com o switch ligado', async () => {
    const id = await workbench({ planAfterRefinement: true })
    await refinement({ closedAt: new Date(), spec: null })
    await applyRefinementState(id)
    expect(byId(id).stage).toBe('spec_ready')
  })

  it('terminou sem a especificação: continua em Refinando com o aviso', async () => {
    const id = await workbench()
    await refinement({ error: 'O agente terminou sem produzir a especificação técnica. Use Continuar para finalizá-la.' })
    await applyRefinementState(id)
    expect(byId(id)).toMatchObject({ stage: 'refining', runState: 'idle', error: expect.stringContaining('sem produzir a especificação') })
  })
})

describe('Especificação pronta', () => {
  it('Gerar plano com vaga: inicia o planejamento na mesma mesa', async () => {
    const id = await workbench({ stage: 'spec_ready', runState: 'idle' })
    await generatePlan(id, 'use o componente X')
    expect(byId(id).stage).toBe('planning')
    expect(byId(id).refinementPending).toBeNull()
    await vi.waitFor(() => expect(mocks.release).toHaveBeenCalledWith('t1'))
  })

  it('Gerar plano sem vaga: aguarda a vez na fila da central', async () => {
    await occupySlot()
    const id = await workbench({ stage: 'spec_ready', runState: 'idle' })
    await generatePlan(id)
    expect(byId(id)).toMatchObject({ stage: 'spec_ready', pendingTurn: expect.objectContaining({ action: 'generate-plan', stage: 'planning' }) })
  })

  it('Continuar refinamento com vaga volta a Refinando na mesma conversa', async () => {
    mocks.snapshot.mockResolvedValue(snapshot({ concluded: true }))
    const id = await workbench({ stage: 'spec_ready', runState: 'idle' })
    await continueRefinementInWorkbench(id)
    expect(byId(id).stage).toBe('refining')
    expect(mocks.continueRefinement).toHaveBeenCalledWith('t1', { fromWorkbench: true })
  })

  it('Continuar refinamento sem vaga aguarda e, com a vaga, entra em Refinando', async () => {
    mocks.snapshot.mockResolvedValue(snapshot({ concluded: true }))
    const busy = await occupySlot()
    const id = await workbench({ stage: 'spec_ready', runState: 'idle' })
    await continueRefinementInWorkbench(id)
    expect(byId(id)).toMatchObject({ stage: 'spec_ready', pendingTurn: expect.objectContaining({ action: 'continue-refinement', fromStage: 'spec_ready' }) })
    expect(mocks.continueRefinement).not.toHaveBeenCalled()

    byId(busy).stage = 'done'
    expect(await startPendingTurn(id)).toBe('started')
    expect(byId(id)).toMatchObject({ stage: 'refining', pendingTurn: null })
    expect(mocks.continueRefinement).toHaveBeenCalledWith('t1', { fromWorkbench: true })
  })

  it('Agente Refinador indisponível bloqueia Continuar refinamento (Gerar plano continua liberado)', async () => {
    mocks.refinementState.mockResolvedValue({ refinement: null, availability: { available: false, reason: 'OpenCode não está conectado' }, workbench: null, refinerModel: null })
    const id = await workbench({ stage: 'spec_ready', runState: 'idle' })
    await expect(continueRefinementInWorkbench(id)).rejects.toMatchObject({ code: 'REFINEMENT_UNAVAILABLE' })
    await generatePlan(id)
    expect(byId(id).stage).toBe('planning')
  })
})

describe('Gerar plano após refinar na barra da mesa', () => {
  it('muda em Refinando e audita', async () => {
    const id = await workbench()
    await setWorkbenchPlanAfterRefinement(id, true)
    expect(byId(id).planAfterRefinement).toBe(true)
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ gerarPlanoAposRefinar: true }) }))
  })

  it('fora de Refinando é recusado', async () => {
    const id = await workbench({ stage: 'spec_ready', runState: 'idle' })
    await expect(setWorkbenchPlanAfterRefinement(id, true)).rejects.toMatchObject({ code: 'WORKBENCH_INVALID_STATE' })
  })
})
