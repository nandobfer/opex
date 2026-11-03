import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-115: quando o agente de implementação cria o worktree e move a sessão para lá (hook `onMoved`),
 * o MCP "Memória própria" é registrado no diretório novo; uma falha nesse registro (inclusive ao obter
 * o cliente do OpenCode) só vai para o log e nunca derruba o turno.
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
  ensureMcp: vi.fn(async () => ({ ok: true, error: null, skipped: [] as string[] })),
  warn: vi.fn(),
  getClient: vi.fn(),
}))

// Métricas dos agentes (OPE-122): o registro dos fatos é mockado (sem banco nem consulta real).
vi.mock('@/features/agent-metrics/server/record', () => ({ recordWorkbenchEvent: vi.fn(async () => undefined), recordPrReviewReplanned: vi.fn(async () => undefined), recordAgentEvent: vi.fn(), recordAgentRun: vi.fn() }))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
// Builder Machine desativada: o build e a limpeza seguem no servidor.
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: async () => false }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({ runOpencodeShell: mocks.shell, getOpencodeClient: mocks.getClient }))
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

vi.mock('@/features/ai/server/self-memory/settings', () => ({ selfMemoryEnabled: vi.fn(async () => true) }))
vi.mock('@/features/ai/server/self-memory/mcp', () => ({ ensureAgentMemoryMcp: mocks.ensureMcp }))
vi.mock('@/features/ai/server/agent-memory-context', () => ({ developerMemoryContext: async () => ({ block: '', source: 'live', cachedAt: null, counts: { full: 0, titles: 0, overflow: 0 }, reason: null }) }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'
import { implement } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

const WORKTREE = '/home/u/app/worktrees/ope-115'
const client = {
  session: {
    get: async () => ({ id: 'sess-1', location: { directory: WORKTREE } }),
    create: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
    instructions: { entry: { put: async () => undefined, remove: async () => undefined } },
  },
}

const workbench = () =>
  model.create({
    centralId: 'c1',
    taskId: 't1',
    taskCode: 'OPE-115',
    taskTitle: 'Aprendizado autônomo',
    stage: 'plan_review',
    runState: 'idle',
    sessionId: 'sess-1',
    sessionDirectory: '/home/u/app',
    branch: 'feat/ope-115',
    worktreePath: WORKTREE,
    composeProject: 'app-ope-115',
    agenticFlow: 'preview',
    pr: null,
    plans: [{ version: 1, text: '# Plano', feedback: null, createdAt: new Date() }],
    pendingSessionDeletions: [],
    startedAt: new Date(),
  })

const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0, durationMs: 1 })
type Hooks = { onMoved?: (directory: string) => Promise<void> }

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.getClient.mockResolvedValue(client)
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
  mocks.repoForProject.mockResolvedValue(null)
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
})

describe('memória própria segue a sessão para o worktree (OPE-115)', () => {
  it('onMoved registra o MCP de memórias no diretório novo', async () => {
    mocks.runTurn.mockImplementation(async (_client: unknown, _request: unknown, hooks: Hooks) => {
      await hooks.onMoved?.(WORKTREE)
      return succeeded('ok')
    })
    const wb = await workbench()
    await implement(wb._id)
    await vi.waitFor(() => expect(mocks.ensureMcp).toHaveBeenCalledWith(client, [WORKTREE]))
    await vi.waitFor(() => expect(model.docs[0]!.stage).toBe('build_queued'))
    expect(model.docs[0]!.sessionDirectory).toBe(WORKTREE)
  })

  it('falha ao obter o cliente do OpenCode no onMoved vai para o log e não derruba o turno', async () => {
    mocks.runTurn.mockImplementation(async (_client: unknown, _request: unknown, hooks: Hooks) => {
      mocks.getClient.mockRejectedValueOnce(new Error('OpenCode fora'))
      await hooks.onMoved?.(WORKTREE)
      return succeeded('ok')
    })
    const wb = await workbench()
    await implement(wb._id)
    await vi.waitFor(() => expect(mocks.warn).toHaveBeenCalledWith(expect.objectContaining({ directory: WORKTREE }), expect.stringContaining('MCP de memórias')))
    await vi.waitFor(() => expect(model.docs[0]!.stage).toBe('build_queued'))
    expect(model.docs[0]!.runState).not.toBe('failed')
    expect(mocks.ensureMcp).not.toHaveBeenCalledWith(client, [WORKTREE])
  })
})
