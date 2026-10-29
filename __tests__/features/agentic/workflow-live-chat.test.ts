import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Chat durante a execução na mesa: a mensagem entra no turno em andamento (sem turno novo), aparece na
 * saída e é auditada; recusa com a opção desligada, a mesa parada ou em exclusão. OpenCode falso.
 */

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  loadCentral: vi.fn(),
  recordAudit: vi.fn(async () => undefined),
  runTurn: vi.fn(),
  settings: vi.fn(),
  steer: vi.fn(async () => true),
  active: new Set<string>(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
// Builder Machine desativada: o build e a limpeza seguem no servidor.
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: async () => false }))
vi.mock('@/lib/logger', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { logger: log, loggerFor: () => log }
})
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({ runOpencodeShell: vi.fn(), getOpencodeClient: vi.fn(async () => ({ session: {} })) }))
vi.mock('@/lib/ai/opencode-run', () => ({ steerAgentTurn: mocks.steer }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticWorkbench: memoryModel(), AgenticCentral: memoryModel(), AgenticEvent: memoryModel() }
})
vi.mock('@/features/agentic/server/centrals', () => ({ loadCentral: mocks.loadCentral, repoForProject: vi.fn(async () => null), publishAgentic: vi.fn(async () => undefined), entryColumnForProject: vi.fn(async () => null) }))
vi.mock('@/features/agentic/server/hub', () => ({
  prepareHub: vi.fn(),
  publishWorkbenchEvent: mocks.publish,
  isWorkbenchActive: (id: string) => mocks.active.has(id),
  markWorkbenchActive: vi.fn(),
  clearWorkbenchActive: vi.fn(),
  abortWorkbenchRun: vi.fn(),
  dropWorkbenchEvents: vi.fn(),
  flushWorkbenchEvents: vi.fn(async () => undefined),
}))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/build-queue', () => ({ buildQueuePosition: vi.fn(async () => null), buildQueuePositions: vi.fn(async () => new Map()), pumpBuildQueue: vi.fn() }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: vi.fn(async () => ({ available: true, reason: null })), assertAgentConfigs: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { DEFAULT_AGENTIC_SETTINGS, defaultCentralConfig } from '@/features/agentic/schemas'
import { getWorkbench, sendLiveMessage } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }

const workbench = async (overrides: Record<string, unknown> = {}) =>
  String(
    (
      await model.create({
        centralId: 'c1',
        taskId: 't1',
        taskCode: 'OPE-90',
        taskTitle: 'Chat',
        stage: 'implementing',
        runState: 'running',
        sessionId: 'sess-1',
        plans: [],
        pr: null,
        pendingSessionDeletions: [],
        startedAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      })
    )._id,
  )

const useSettings = (liveChat: boolean) => mocks.settings.mockResolvedValue({ settings: { ...DEFAULT_AGENTIC_SETTINGS, liveChat }, isDefault: false, updatedAt: null })
const useCentral = (liveChat: 'inherit' | 'on' | 'off') => mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: { ...defaultCentralConfig('/home/u/app'), liveChat } })

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.active.clear()
  mocks.steer.mockResolvedValue(true)
  useSettings(true)
  useCentral('inherit')
})

describe('chat durante a execução na mesa', () => {
  it('com o agente trabalhando, entrega ao turno atual, mostra na saída e audita (sem turno novo)', async () => {
    const id = await workbench()
    mocks.active.add(id)
    const dto = await sendLiveMessage(id, 'use o componente X')
    expect(mocks.steer).toHaveBeenCalledWith(id, 'use o componente X', [])
    expect(mocks.runTurn).not.toHaveBeenCalled()
    expect(mocks.publish).toHaveBeenCalledWith(id, { type: 'user', text: 'use o componente X' })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'MesaDeTrabalho', entidadeId: id, depois: { tarefa: 'OPE-90', etapa: 'implementing', mensagemDuranteExecucao: 'use o componente X' } }))
    expect(dto.liveChat).toBe(true)
  })

  it('desligado: recusa; a central com "Desligado" vence o global ligado', async () => {
    const id = await workbench()
    mocks.active.add(id)
    useCentral('off')
    await expect(sendLiveMessage(id, 'x')).rejects.toMatchObject({ status: 409, code: 'LIVE_CHAT_DISABLED' })
    expect((await getWorkbench(id)).liveChat).toBe(false)
    expect(mocks.steer).not.toHaveBeenCalled()
  })

  it('mesa parada ou em exclusão: recusa sem tentar entregar', async () => {
    const idle = await workbench({ runState: 'idle', stage: 'plan_review' })
    await expect(sendLiveMessage(idle, 'x')).rejects.toMatchObject({ status: 409, code: 'WORKBENCH_NOT_RUNNING' })
    const deleting = await workbench({ deletionRequestedAt: new Date() })
    mocks.active.add(deleting)
    await expect(sendLiveMessage(deleting, 'x')).rejects.toMatchObject({ status: 409, code: 'WORKBENCH_DELETING' })
    expect(mocks.steer).not.toHaveBeenCalled()
  })

  it('trocando de etapa (sem turno vivo no runner): 409 e a mensagem não aparece na saída', async () => {
    const id = await workbench()
    mocks.active.add(id)
    mocks.steer.mockResolvedValueOnce(false)
    await expect(sendLiveMessage(id, 'x')).rejects.toMatchObject({ status: 409, code: 'TURN_NOT_RUNNING' })
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })
})
