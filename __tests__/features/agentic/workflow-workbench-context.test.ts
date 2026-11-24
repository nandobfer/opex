import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contexto da mesa para o agente (OPE-178): a sessão só é trocada quando o OpenCode diz que ela não
 * existe (erro de rede falha a etapa e preserva a sessão, regressão da ZC-17) e todo turno leva o
 * cabeçalho "Mesa do Opex" com o MCP da mesa — ou o plano no prompt quando o MCP não registra.
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
  sessionGet: vi.fn(),
  sessionCreate: vi.fn(),
  ensureMcp: vi.fn(),
  registerAt: vi.fn(async () => undefined),
  markActive: vi.fn(),
}))

// Métricas dos agentes (OPE-122): o registro dos fatos é mockado (sem banco nem consulta real).
vi.mock('@/features/agent-metrics/server/record', () => ({ recordWorkbenchEvent: vi.fn(async () => undefined), recordPrReviewReplanned: vi.fn(async () => undefined), recordAgentEvent: vi.fn(), recordAgentRun: vi.fn() }))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
// Builder Machine desativada: o build e a limpeza seguem no servidor.
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: async () => false }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  runOpencodeShell: mocks.shell,
  getOpencodeClient: vi.fn(async () => ({ session: { get: mocks.sessionGet, create: mocks.sessionCreate } })),
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
  markWorkbenchActive: mocks.markActive,
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
// OPE-178: o registro do MCP da mesa no OpenCode é controlado pelo teste (ok = cabeçalho com as ferramentas).
vi.mock('@/features/agentic/server/workbench-mcp/register', () => ({ ensureWorkbenchMcp: mocks.ensureMcp, registerWorkbenchMcpAt: mocks.registerAt }))
vi.mock('@/features/ai/server/self-memory/mcp', async () => (await import('../../helpers/memory-context')).selfMemoryMcpModule())

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'
import { implement, retry, revisePlan } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

const PLAN_TEXT = '# Plano aprovado\nAbas completas da empresa'

const workbench = async (overrides: Record<string, unknown> = {}) =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'ZC-17',
    taskTitle: 'Cadastros na empresa',
    stage: 'plan_review',
    runState: 'idle',
    sessionId: 'sess-viva',
    sessionDirectory: '/home/u/app',
    branch: 'feat/zc-17',
    worktreePath: '/home/u/app/worktrees/zc-17',
    composeProject: 'app-zc-17',
    agenticFlow: 'auto_pr',
    pr: null,
    forkNotes: [],
    plans: [{ version: 1, text: PLAN_TEXT, feedback: null, createdAt: new Date() }],
    pendingSessionDeletions: [],
    startedAt: new Date(),
    ...overrides,
  })

const firstPrompt = () => (mocks.runTurn.mock.calls[0]![1] as { text: string; sessionId: string })
const notices = () => mocks.publish.mock.calls.map(([, event]) => event as { type: string; level?: string; message?: string }).filter((event) => event.type === 'notice')

/** Erro de transporte do cliente do OpenCode (DNS fora do ar, como na ZC-17). */
const transportError = () => Object.assign(new Error('Transport: fetch failed'), { cause: new Error('getaddrinfo EAI_AGAIN opencode.local') })

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
  mocks.repoForProject.mockResolvedValue(null)
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.sessionGet.mockImplementation(async ({ sessionID }: { sessionID: string }) => ({ id: sessionID, location: { directory: '/home/u/app' } }))
  mocks.sessionCreate.mockResolvedValue({ id: 'sess-nova', location: { directory: '/home/u/app' } })
  mocks.ensureMcp.mockResolvedValue({ ok: true, error: null, skipped: [] })
  // O turno de implementação fica pendente: as asserções olham o prompt que ele recebeu.
  mocks.runTurn.mockReturnValue(new Promise(() => undefined))
})

describe('sessão do OpenCode inacessível (regressão da ZC-17)', () => {
  it('erro de rede ao ler a sessão NÃO cria outra sessão: repete, falha a etapa e mantém a sessão gravada', async () => {
    mocks.sessionGet.mockRejectedValue(transportError())
    const wb = await workbench()
    await implement(wb._id)
    await vi.waitFor(() => expect(model.docs[0]!.runState).toBe('failed'), { timeout: 8_000 })
    expect(mocks.sessionGet).toHaveBeenCalledTimes(3)
    expect(mocks.sessionCreate).not.toHaveBeenCalled()
    expect(mocks.runTurn).not.toHaveBeenCalled()
    expect(model.docs[0]!.sessionId).toBe('sess-viva')
    expect(model.docs[0]!.error).toContain('OpenCode inacessível')
    expect(notices().some((event) => event.message?.includes('não existe mais'))).toBe(false)
  }, 12_000)

  it('sessão realmente inexistente (SessionNotFoundError): sessão nova e o turno manda ler o plano aprovado pelo MCP', async () => {
    mocks.sessionGet.mockRejectedValue({ _tag: 'SessionNotFoundError', message: 'Session not found' })
    const wb = await workbench()
    await implement(wb._id)
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalled())
    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1)
    expect(model.docs[0]!.sessionId).toBe('sess-nova')
    const { text, sessionId } = firstPrompt()
    expect(sessionId).toBe('sess-nova')
    expect(text).toContain('Implemente o plano aprovado (versão 1)')
    expect(text).toContain('## Mesa do Opex')
    expect(text).toContain('sessão NOVA do OpenCode')
    expect(text).toContain('ANTES de agir, leia o plano com `opex_mesa_get_plan` (versão 1)')
    expect(notices().some((event) => event.level === 'warn' && event.message?.includes('continuam disponíveis'))).toBe(true)
  })
})

describe('contexto da mesa em todo turno', () => {
  it('sessão viva com o MCP conectado: o pedido da etapa vem primeiro, depois o cabeçalho e, na implementação, o texto do plano aprovado', async () => {
    const wb = await workbench()
    await implement(wb._id)
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalled())
    expect(mocks.sessionCreate).not.toHaveBeenCalled()
    const { text } = firstPrompt()
    expect(text.startsWith('Você agora é o agente de IMPLEMENTAÇÃO')).toBe(true)
    expect(text).not.toContain('a última que você escreveu nesta sessão')
    expect(text).toContain('## Mesa do Opex')
    expect(text).toContain('opex_mesa_list_attachments')
    expect(text).not.toContain('sessão NOVA')
    // F1 (rodada 1): a implementação nunca começa sem o plano, mesmo com o MCP conectado.
    expect(text).toContain('## Plano da mesa: versão 1 (aprovada)')
    expect(text).toContain('Abas completas da empresa')
    expect(text).not.toContain('Dados da mesa (as ferramentas da mesa não estão disponíveis')
    expect(mocks.ensureMcp).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining(['/home/u/app', '/home/u/app/worktrees/zc-17']))
  })

  it('MCP não registrado: o turno segue com o texto do plano aprovado no prompt e um aviso', async () => {
    mocks.ensureMcp.mockResolvedValue({ ok: false, error: 'configure a URL pública do Opex', skipped: [] })
    const wb = await workbench()
    await implement(wb._id)
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalled())
    const { text } = firstPrompt()
    expect(text).toContain('Plano da mesa: versão 1 (aprovada)')
    expect(text).toContain('Abas completas da empresa')
    expect(text).not.toContain('opex_mesa_get_plan`:')
    expect(notices().some((event) => event.level === 'warn' && event.message?.includes('Ferramentas da mesa indisponíveis'))).toBe(true)
  })

  it('falha inesperada no registro do MCP nunca derruba a etapa', async () => {
    mocks.ensureMcp.mockRejectedValue(new Error('boom'))
    const wb = await workbench()
    await implement(wb._id)
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalled())
    expect(firstPrompt().text).toContain('Abas completas da empresa')
  })

  it('Tentar novamente (turno sem mensagem nova) também leva o contexto da mesa', async () => {
    const wb = await workbench({ stage: 'implementing', runState: 'failed', approvedPlanVersion: 1, lastPrompt: { stage: 'implementing', text: 'Implemente o plano aprovado (versão 1).' } })
    await retry(wb._id)
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalled())
    const { text } = firstPrompt()
    expect(text).toContain('Retome de onde parou')
    expect(text).toContain('## Mesa do Opex')
    expect(text).toContain('ANTES de agir, leia o plano')
  })

  it('a sessão mudou para o worktree (onMoved): o MCP da mesa é registrado no diretório novo', async () => {
    mocks.runTurn.mockImplementation(async (_client: unknown, _request: unknown, hooks: { onMoved?: (directory: string) => Promise<void> }) => {
      await hooks.onMoved?.('/home/u/app/worktrees/zc-17')
      return new Promise(() => undefined)
    })
    const wb = await workbench()
    await implement(wb._id)
    await vi.waitFor(() => expect(mocks.registerAt).toHaveBeenCalledWith(expect.any(Function), '/home/u/app/worktrees/zc-17'))
  })

  it('etapa que não depende do plano (revisão no planejamento) com o MCP conectado: só o cabeçalho, sem o texto do plano', async () => {
    const wb = await workbench()
    await revisePlan(wb._id, 'Inclua o Y')
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalled())
    const { text } = firstPrompt()
    expect(text).toContain('## Mesa do Opex')
    expect(text).toContain('opex_mesa_get_plan')
    expect(text).not.toContain('Abas completas da empresa')
  })

  it('F2 (rodada 1): interromper durante as tentativas de ler a sessão deixa a mesa interrompida, não com falha do OpenCode', async () => {
    mocks.sessionGet.mockImplementation(async () => {
      const controller = mocks.markActive.mock.calls.at(-1)?.[1] as AbortController
      controller.abort()
      throw transportError()
    })
    const wb = await workbench()
    await implement(wb._id)
    await vi.waitFor(() => expect(model.docs[0]!.runState).toBe('interrupted'))
    expect(model.docs[0]!.error).not.toContain('OpenCode inacessível')
    expect(mocks.sessionGet).toHaveBeenCalledTimes(1)
    expect(mocks.sessionCreate).not.toHaveBeenCalled()
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })
})
