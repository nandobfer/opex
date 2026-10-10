import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  active: new Set<string>(),
  models: {} as Record<string, { docs: unknown[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }>,
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.workbench = memoryModel()
  return { AgenticWorkbench: mocks.models.workbench, AgenticCentral: memoryModel(), AgenticEvent: memoryModel() }
})
vi.mock('@/features/agentic/server/hub', () => ({ isWorkbenchActive: (id: string) => mocks.active.has(id) }))

import { listWorkbenchesInProgress } from '@/features/agentic/server/in-progress'

/** Cria uma mesa e devolve o id (para marcar como "com turno vivo" em `mocks.active`). */
const workbench = async (overrides: Record<string, unknown> = {}) =>
  String(
    (
      await mocks.models.workbench.create({
        centralId: 'c1',
        taskId: 't1',
        taskCode: 'OPX-1',
        taskTitle: 'Primeira',
        stage: 'plan_review',
        runState: 'idle',
        pendingPermissions: [],
        pendingForms: [],
        ...overrides,
      })
    )._id,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.active.clear()
  mocks.models.workbench.docs.length = 0
})

describe('listWorkbenchesInProgress', () => {
  it('não lista mesa concluída', async () => {
    await workbench({ stage: 'done', runState: 'idle', taskCode: 'OPX-9' })
    await workbench({ taskCode: 'OPX-1' })
    const items = await listWorkbenchesInProgress()
    expect(items.map((item) => item.taskCode)).toEqual(['OPX-1'])
  })

  it('mesa aguardando o plano sai com o motivo e sem execução', async () => {
    await workbench({ stage: 'plan_review', runState: 'idle' })
    const [item] = await listWorkbenchesInProgress()
    expect(item).toMatchObject({ taskCode: 'OPX-1', stage: 'plan_review', runState: 'idle', running: false, waitingFor: 'Aguardando revisão do plano' })
  })

  it('mesa executando com turno vivo sai como trabalho em andamento (sem motivo)', async () => {
    const id = await workbench({ stage: 'implementing', runState: 'running' })
    mocks.active.add(id)
    const [item] = await listWorkbenchesInProgress()
    expect(item).toMatchObject({ workbenchId: id, stage: 'implementing', runState: 'running', running: true, waitingFor: null })
  })

  it('"running" sem turno vivo no processo vira interrupção (precisa de ação)', async () => {
    await workbench({ stage: 'implementing', runState: 'running' })
    const [item] = await listWorkbenchesInProgress()
    expect(item).toMatchObject({ runState: 'interrupted', running: false, waitingFor: 'Execução interrompida — use Tentar novamente' })
  })

  it('executando vem antes das mesas em espera', async () => {
    await workbench({ taskCode: 'OPX-1' })
    const running = await workbench({ taskCode: 'OPX-2', stage: 'implementing', runState: 'running' })
    mocks.active.add(running)
    const items = await listWorkbenchesInProgress()
    expect(items.map((item) => item.taskCode)).toEqual(['OPX-2', 'OPX-1'])
  })
})
