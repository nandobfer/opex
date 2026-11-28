import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  allocatePort: vi.fn(async () => 4010),
  moveTask: vi.fn(async () => undefined),
  getTask: vi.fn(),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  settings: vi.fn(),
  assertAgentConfigs: vi.fn(async () => undefined),
}))

// Métricas dos agentes (OPE-122): o registro dos fatos é mockado (sem banco nem consulta real).
vi.mock('@/features/agent-metrics/server/record', () => ({ recordWorkbenchEvent: vi.fn(async () => undefined), recordPrReviewReplanned: vi.fn(async () => undefined), recordAgentEvent: vi.fn(), recordAgentRun: vi.fn() }))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
// Builder Machine desativada: o build e a limpeza seguem no servidor.
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: async () => false }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client', () => ({
  runOpencodeShell: mocks.shell,
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: '/home/u/app/worktrees/ope-53' } }),
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
  return { AgenticWorkbench: workbench, AgenticCentral: memoryModel(), AgenticEvent: memoryModel() }
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
vi.mock('@/features/agentic/server/build-queue', () => ({ buildQueuePosition: vi.fn(async () => null), buildQueuePositions: vi.fn(async () => new Map()), pumpBuildQueue: vi.fn() }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability, assertAgentConfigs: mocks.assertAgentConfigs }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask, moveTask: mocks.moveTask }))
vi.mock('@/features/ai/task-context-prompt', () => ({ buildTaskContextPrompt: vi.fn(() => 'tarefa') }))


import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'
import { startWorkbench } from '@/features/agentic/server/workflow'
import { NOT_A_PLAN_MESSAGE } from '@/features/agentic/plan-text'
import * as adversaryHook from '@/features/adversarial-agent/server/workflow-hook'

/**
 * Trava do planejamento (OPE-216): o texto final que só anuncia o que ainda vai ser feito ("fecho o plano
 * assim que os resultados chegarem") não vira versão do plano nem leva à revisão: a mesa fica em erro,
 * com "Tentar de novo".
 */

const adversary = adversaryHook as unknown as { adversaryApplies: ReturnType<typeof vi.fn>; adversaryAgent: ReturnType<typeof vi.fn> }
const model = AgenticWorkbench as unknown as { docs: Record<string, unknown>[] }
const task = { id: 't1', code: 'OPE-216', title: 'Esperar subagentes', columnId: 'col', project: { id: 'p1' }, agenticFlow: 'preview' }
const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0, durationMs: 1 })
const ANNOUNCE = 'Disparei duas explorações em paralelo (sessões OpenCode/skills/permissões e GitHub/central/ambientes). Fecho o plano assim que os resultados chegarem.'

beforeEach(() => {
  vi.clearAllMocks()
  adversary.adversaryApplies.mockResolvedValue(false)
  adversary.adversaryAgent.mockResolvedValue(null)
  model.docs.length = 0
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
  mocks.repoForProject.mockResolvedValue(null)
  mocks.settings.mockResolvedValue({ settings: DEFAULT_AGENTIC_SETTINGS })
  mocks.getTask.mockResolvedValue(task)
})

describe('trava do planejamento', () => {
  it('texto que só anuncia o trabalho não vai para a revisão do plano: a mesa fica em erro', async () => {
    mocks.runTurn.mockResolvedValue(succeeded(ANNOUNCE))
    await startWorkbench('c1', 't1')
    await vi.waitFor(() => expect(model.docs[0]!.runState).toBe('failed'))
    expect(model.docs[0]!.stage).toBe('planning')
    expect(model.docs[0]!.error).toBe(NOT_A_PLAN_MESSAGE)
    expect(model.docs[0]!.plans ?? []).toEqual([])
    expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'notice', level: 'error', message: NOT_A_PLAN_MESSAGE }))
  })

  it('um plano de verdade segue para a revisão do plano', async () => {
    mocks.runTurn.mockResolvedValue(succeeded('# Plano\n\n1. Ler\n2. Alterar\n3. Testar'))
    await startWorkbench('c1', 't1')
    await vi.waitFor(() => expect(model.docs[0]!.stage).toBe('plan_review'))
    expect((model.docs[0]!.plans as { text: string }[]).map((plan) => plan.text)).toEqual(['# Plano\n\n1. Ler\n2. Alterar\n3. Testar'])
  })
})
