import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fluxo Plugin da mesa (OPE-172): tarefa do tipo Plugin passa por plano → implementação na pasta de
 * trabalho → versão compilada → prévia ao vivo → aprovação → testes do plugin no host → consolidação,
 * sem PR, build de imagem, porta nem deploy. A parte que fala com o host e com o serviço de plugins
 * (`plugin-workflow.ts`) é mockada; as regras puras (`workbenchKindFor`) são as reais.
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
  runBuild: vi.fn(async () => ({ exitCode: 0, tail: '' })),
  allocatePort: vi.fn(async () => 4010),
  moveTask: vi.fn(async () => undefined),
  getTask: vi.fn(),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  settings: vi.fn(),
  prepare: vi.fn(),
  buildDraft: vi.fn(),
  publishPreview: vi.fn(),
  runTests: vi.fn(),
  consolidate: vi.fn(),
  release: vi.fn(async () => undefined),
}))

vi.mock('@/features/agentic/server/plugin-workflow', async () => {
  const actual = await vi.importActual<typeof import('@/features/agentic/server/plugin-workflow')>('@/features/agentic/server/plugin-workflow')
  return {
    workbenchKindFor: actual.workbenchKindFor,
    pluginClientName: async () => null,
    preparePluginImplementation: mocks.prepare,
    buildPluginDraft: mocks.buildDraft,
    publishPluginPreview: mocks.publishPreview,
    runPluginTests: mocks.runTests,
    consolidatePluginWorkbench: mocks.consolidate,
    releasePluginPreview: mocks.release,
  }
})

// Métricas dos agentes (OPE-122): o registro dos fatos é mockado (sem banco nem consulta real).
vi.mock('@/features/agent-metrics/server/record', () => ({ recordWorkbenchEvent: vi.fn(async () => undefined), recordPrReviewReplanned: vi.fn(async () => undefined), recordAgentEvent: vi.fn(), recordAgentRun: vi.fn() }))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR', APROVAR: 'APROVAR' } }))
// Builder Machine desativada: o build e a limpeza seguem no servidor.
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: async () => false }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  runOpencodeShell: mocks.shell,
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: '/home/u/app/worktrees/plugins/ope-172' } }),
      create: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
    },
  })),
}))
// Refinamento na mesa (OPE-137): a tarefa não tem refinamento (abre direto no planejamento).
vi.mock('@/features/refinement/server/service', () => ({ refinementSnapshot: vi.fn(async () => null), releaseRefinementSession: vi.fn(async () => undefined) }))
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
// A fila do build não entra neste teste: a mesa em PR automático não deve passar por ela.
vi.mock('@/features/agentic/server/build-queue', () => ({ buildQueuePosition: vi.fn(async () => null), buildQueuePositions: vi.fn(async () => new Map()), pumpBuildQueue: vi.fn() }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
// O app roda o comando do build no host (aba Build).
vi.mock('@/features/agentic/server/preview-build', () => ({ runPreviewBuild: mocks.runBuild }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask, moveTask: mocks.moveTask }))
vi.mock('@/features/ai/task-context-prompt', () => ({ buildTaskContextPrompt: vi.fn(() => 'tarefa') }))
// OPE-117: memórias (contexto e MCP) mockadas, para o turno não depender do Engramind nem do OpenCode.
vi.mock('@/features/ai/server/agent-memory-context', async () => (await import('../../helpers/memory-context')).memoryContextModule())
vi.mock('@/features/ai/server/self-memory/settings', async () => (await import('../../helpers/memory-context')).selfMemorySettingsModule())
vi.mock('@/features/ai/server/self-memory/mcp', async () => (await import('../../helpers/memory-context')).selfMemoryMcpModule())

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'
import { approve, implement, requestCorrection, retry, startWorkbench } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

const WORKDIR = '/home/u/app/worktrees/plugins/ope-172'
const pluginState = (overrides: Record<string, unknown> = {}) => ({ pluginId: null, scope: 'owner', clientId: null, baseVersionId: null, draftVersionId: null, workDir: null, approved: false, compileAttempts: 0, testAttempts: 0, ...overrides })

const workbench = async (overrides: Record<string, unknown> = {}) =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'OPE-172',
    taskTitle: 'Relógio no dashboard',
    stage: 'plan_review',
    runState: 'idle',
    sessionId: 'sess-1',
    sessionDirectory: '/home/u/app',
    composeProject: 'app-ope-172',
    agenticFlow: 'preview',
    kind: 'plugin',
    plugin: pluginState(),
    pr: null,
    plans: [{ version: 1, text: '# Plano', feedback: null, createdAt: new Date() }],
    pendingSessionDeletions: [],
    startedAt: new Date(),
    ...overrides,
  })

const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0, durationMs: 1 })
const waitForStage = (stage: string) => vi.waitFor(() => expect({ stage: model.docs[0]!.stage, error: model.docs[0]!.error ?? null }).toEqual({ stage, error: null }))
const stages = () => mocks.runTurn.mock.calls.map(([, request]) => request.stage)

beforeEach(async () => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
  mocks.repoForProject.mockResolvedValue(null)
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.runTurn.mockResolvedValue(succeeded('ok'))
  mocks.prepare.mockImplementation(async (doc: { _id: string }) => {
    const next = pluginState({ pluginId: 'relogio', workDir: WORKDIR })
    await (AgenticWorkbench as unknown as { updateOne: (f: unknown, u: unknown) => Promise<unknown> }).updateOne({ _id: doc._id }, { $set: { plugin: next } })
    return next
  })
  mocks.buildDraft.mockImplementation(async (doc: { _id: string }) => {
    await (AgenticWorkbench as unknown as { updateOne: (f: unknown, u: unknown) => Promise<unknown> }).updateOne({ _id: doc._id }, { $set: { 'plugin.draftVersionId': 'v1' } })
    return { ok: true, versionId: 'v1', number: 1 }
  })
  mocks.publishPreview.mockResolvedValue({ previewUrl: '/dashboard', number: 1, runtimeError: null })
  mocks.runTests.mockResolvedValue({ exitCode: 0, output: 'Test Files 1 passed' })
  mocks.consolidate.mockResolvedValue({ number: 1 })
})

describe('abertura de uma tarefa do tipo Plugin', () => {
  it('a mesa nasce com o tipo plugin, o escopo da tarefa e o bloco do fluxo de plugin no plano', async () => {
    mocks.getTask.mockResolvedValue({ id: 't1', code: 'OPE-172', title: 'Relógio', columnId: 'col', project: { id: 'p1' }, agenticFlow: null, taskType: 'plugin', pluginTarget: { scope: 'client', clientId: 'cli1', pluginId: null } })
    await startWorkbench('c1', 't1')
    expect(model.docs[0]).toMatchObject({ kind: 'plugin', plugin: { scope: 'client', clientId: 'cli1', pluginId: null, approved: false } })
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalled())
    expect(mocks.runTurn.mock.calls[0][1].text).toContain('Tarefa do tipo Plugin (OPE-172)')
    expect(mocks.runTurn.mock.calls[0][1].text).toContain('plugin de CLIENTE')
  })

  it('tarefa de outro tipo continua no fluxo do repositório', async () => {
    mocks.getTask.mockResolvedValue({ id: 't1', code: 'OPE-1', title: 'Feature', columnId: 'col', project: { id: 'p1' }, agenticFlow: null, taskType: 'feature', pluginTarget: null })
    await startWorkbench('c1', 't1')
    expect(model.docs[0]).toMatchObject({ kind: 'repo', plugin: null })
  })
})

describe('implementação de uma mesa Plugin', () => {
  beforeEach(async () => {
    // Turnos órfãos dos testes de abertura terminam antes das contagens desta seção.
    await new Promise((resolve) => setTimeout(resolve, 50))
    mocks.runTurn.mockClear()
  })

  it('exporta para a pasta de trabalho, compila e publica a prévia ao vivo, sem build nem PR', async () => {
    const wb = await workbench()
    await implement(wb._id)
    await waitForStage('preview')
    const doc = model.docs[0]!
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(mocks.runTurn.mock.calls[0][1].text).toContain(`MOVA ESTA SESSÃO para ${WORKDIR}`)
    expect(mocks.runTurn.mock.calls[0][1].text).toContain('NÃO faça push e NÃO abra Pull Request')
    expect(doc.worktreePath).toBe(WORKDIR)
    expect(doc.branch ?? null).toBeNull()
    expect(doc.previewUrl).toBe('/dashboard')
    expect(doc.buildQueuedAt ?? null).toBeNull()
    expect(doc.pr).toBeNull()
    expect(mocks.allocatePort).not.toHaveBeenCalled()
    expect(mocks.runBuild).not.toHaveBeenCalled()
    expect(stages()).toEqual(['implementing'])
  })

  it('versão que não compila volta ao agente com os problemas e segue quando passa', async () => {
    mocks.buildDraft.mockResolvedValueOnce({ ok: false, issues: ['plugin.json: Id do plugin inválido'] }).mockImplementation(async () => ({ ok: true, versionId: 'v2', number: 2 }))
    const wb = await workbench()
    await implement(wb._id)
    await waitForStage('preview')
    expect(stages()).toEqual(['implementing', 'implementing'])
    expect(mocks.runTurn.mock.calls[1][1].text).toContain('plugin.json: Id do plugin inválido')
  })
})

describe('compilador de plugins indisponível no servidor', () => {
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    mocks.runTurn.mockClear()
  })

  it('falha a etapa sem mandar ao agente; o Tentar novamente só recompila e segue para a prévia', async () => {
    const { compilerUnavailable } = await import('@/features/plugins/server/compiler/unavailable')
    mocks.buildDraft.mockRejectedValueOnce(compilerUnavailable('Rolldown', new Error('Cannot find native binding.')))
    const wb = await workbench()
    await implement(wb._id)
    await vi.waitFor(() => expect(model.docs[0]).toMatchObject({ stage: 'implementing', runState: 'failed' }))
    expect(model.docs[0]!.error).toBe('O compilador de plugins não está disponível neste servidor (Rolldown: Cannot find native binding.). Não é um problema do plugin: atualize a imagem do Opex e use Tentar novamente.')
    expect(model.docs[0]!.plugin).toMatchObject({ compilePending: true })
    expect(stages()).toEqual(['implementing'])

    await retry(wb._id)
    await waitForStage('preview')
    // Nenhum turno novo do agente: só a compilação foi refeita.
    expect(stages()).toEqual(['implementing'])
    expect(mocks.buildDraft).toHaveBeenCalledTimes(2)
    expect(model.docs[0]!.plugin).toMatchObject({ compilePending: false, draftVersionId: 'v1' })
    expect(model.docs[0]!.previewUrl).toBe('/dashboard')
  })

  it('problema do plugin continua indo ao agente e não deixa a compilação pendente', async () => {
    mocks.buildDraft.mockResolvedValueOnce({ ok: false, issues: ['Erro de compilação: Unexpected token'] })
    const wb = await workbench()
    await implement(wb._id)
    await waitForStage('preview')
    expect(stages()).toEqual(['implementing', 'implementing'])
    expect(model.docs[0]!.plugin).toMatchObject({ compilePending: false })
  })

  it('outra falha na implementação mantém a retentativa pelo agente', async () => {
    mocks.runTurn.mockResolvedValueOnce({ outcome: 'failed', text: '', message: 'Sessão caiu', costUsd: 0, durationMs: 1 })
    const wb = await workbench()
    await implement(wb._id)
    await vi.waitFor(() => expect(model.docs[0]).toMatchObject({ stage: 'implementing', runState: 'failed' }))
    await retry(wb._id)
    await waitForStage('preview')
    expect(stages()).toEqual(['implementing', 'implementing'])
    expect(mocks.runTurn.mock.calls[1][1].text).toContain('A execução anterior desta etapa não terminou (Sessão caiu)')
  })

  it('marca de compilação pendente de uma rodada anterior não faz o Tentar novamente pular o agente', async () => {
    const wb = await workbench()
    // Rodada anterior: compilador indisponível deixou a marca (e um descritivo) gravados.
    await model.updateOne({ _id: wb._id }, { $set: { 'plugin.compilePending': true, 'plugin.changeSummary': 'Antigo' } })
    mocks.runTurn.mockResolvedValueOnce({ outcome: 'failed', text: '', message: 'Erro do modelo', costUsd: 0, durationMs: 1 })
    await implement(wb._id)
    await vi.waitFor(() => expect(model.docs[0]).toMatchObject({ stage: 'implementing', runState: 'failed' }))
    expect(model.docs[0]!.plugin).toMatchObject({ compilePending: false, changeSummary: null })
    await retry(wb._id)
    await waitForStage('preview')
    // O agente roda de novo (não só a recompilação da pasta antiga).
    expect(stages()).toEqual(['implementing', 'implementing'])
    expect(mocks.runTurn.mock.calls[1][1].text).toContain('A execução anterior desta etapa não terminou (Erro do modelo)')
  })
})

describe('aprovação, testes do plugin e consolidação', () => {
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    mocks.runTurn.mockClear()
  })

  it('aprovar roda os testes no host e consolida a versão: a mesa conclui sem PR', async () => {
    const wb = await workbench({ stage: 'preview', previewUrl: '/dashboard', worktreePath: WORKDIR, plugin: pluginState({ pluginId: 'relogio', workDir: WORKDIR, draftVersionId: 'v1' }) })
    await approve(wb._id)
    await waitForStage('done')
    expect(mocks.runTests).toHaveBeenCalledWith(WORKDIR)
    expect(mocks.consolidate).toHaveBeenCalledTimes(1)
    expect(model.docs[0]!.pr).toBeNull()
    expect(stages()).toEqual([])
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'APROVAR', depois: expect.objectContaining({ plugin: 'relogio', versao: 1 }) }))
  })

  it('teste que falha volta para correção e, aprovado, republica e testa de novo até passar', async () => {
    mocks.runTests.mockResolvedValueOnce({ exitCode: 1, output: 'FAIL client/index.test.tsx' }).mockResolvedValue({ exitCode: 0, output: 'ok' })
    const wb = await workbench({ stage: 'preview', previewUrl: '/dashboard', worktreePath: WORKDIR, plugin: pluginState({ pluginId: 'relogio', workDir: WORKDIR, draftVersionId: 'v1' }) })
    await approve(wb._id)
    await waitForStage('done')
    expect(stages()).toEqual(['implementing'])
    expect(mocks.runTurn.mock.calls[0][1].text).toContain('FAIL client/index.test.tsx')
    expect(mocks.publishPreview).toHaveBeenCalledTimes(1)
    expect(mocks.runTests).toHaveBeenCalledTimes(2)
    expect(mocks.consolidate).toHaveBeenCalledTimes(1)
  })

  it('consolidação que falha deixa a mesa em Testes do plugin e o Tentar novamente refaz a consolidação (não a limpeza)', async () => {
    mocks.consolidate.mockRejectedValueOnce(new Error('Falha ao ativar a versão do plugin: quebrou. A versão estável anterior continua ativa.')).mockResolvedValue({ number: 1 })
    const wb = await workbench({ stage: 'preview', previewUrl: '/dashboard', worktreePath: WORKDIR, plugin: pluginState({ pluginId: 'relogio', workDir: WORKDIR, draftVersionId: 'v1' }) })
    await approve(wb._id)
    await vi.waitFor(() => expect(model.docs[0]).toMatchObject({ stage: 'fixing_ci', runState: 'failed' }))
    expect(model.docs[0]!.error).toContain('A versão estável anterior continua ativa')

    await retry(wb._id)
    await waitForStage('done')
    expect(mocks.consolidate).toHaveBeenCalledTimes(2)
    expect(mocks.runTests).toHaveBeenCalledTimes(2)
    // Nenhum turno de limpeza do agente: a mesa só conclui depois de consolidar.
    expect(stages()).toEqual([])
  })

  it('pedir correção na prévia desfaz a aprovação e volta ao planejamento', async () => {
    const wb = await workbench({ stage: 'preview', previewUrl: '/dashboard', worktreePath: WORKDIR, plugin: pluginState({ pluginId: 'relogio', workDir: WORKDIR, draftVersionId: 'v1', approved: true }) })
    await requestCorrection(wb._id, 'Trocar a cor do widget')
    // A correção volta ao planejador (o dublê do hub não marca a mesa como viva; só a etapa importa aqui).
    await vi.waitFor(() => expect(stages()).toEqual(['planning']))
    expect((model.docs[0]!.plugin as { approved: boolean }).approved).toBe(false)
  })
})
