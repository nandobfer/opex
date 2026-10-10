import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  publish: vi.fn(),
  models: {} as Record<string, { docs: unknown[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }>; aggregate: (...args: unknown[]) => Promise<unknown[]> }>,
}))

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn(),
  recordAudit: mocks.recordAudit,
  AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' },
}))
vi.mock('@/lib/pusher/channels', () => ({ appChannel: () => 'private-app', publishToChannels: mocks.publish }))
vi.mock('@/lib/db/models/DevTask', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.devTask = memoryModel()
  return { DevTask: mocks.models.devTask, TaskComment: memoryModel() }
})
vi.mock('@/lib/db/models/TimeLog', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.timeLog = memoryModel()
  return { TimeLog: mocks.models.timeLog }
})

import { accumulateWorkPeriodUsage, beginWorkPeriod, endWorkPeriod, endWorkPeriodById, listActiveTimers, listActiveWorkPeriods, listTimeLogs, touchWorkPeriod } from '@/features/time/server/service'

const reset = () => {
  for (const model of Object.values(mocks.models)) model.docs.length = 0
}
const seedTask = async () => (await mocks.models.devTask.create({ code: 'OPX-7', title: 'Ajustar login', columnId: 'todo', order: 0, priority: 'high', archived: false }))._id as string

beforeEach(() => {
  vi.clearAllMocks()
  reset()
})

describe('controle de horas agêntico', () => {
  it('abrir a mesa cria um período ativo com etapa/agente/modelo, audita e avisa a tela', async () => {
    const taskId = await seedTask()
    const log = await beginWorkPeriod({ taskId, workbenchId: 'wb-1', stage: 'implementing', agent: 'build', model: 'openai/gpt', description: 'Desenvolvimento agêntico · Implementando' }, 'local')
    expect(log).toMatchObject({ taskId, workbenchId: 'wb-1', stage: 'implementing', agent: 'build', model: 'openai/gpt', taskCode: 'OPX-7', active: true, duration: null, costUsd: 0 })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'Apontamento', acao: 'CRIAR' }))
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'time-updated', { taskIds: [taskId] })
  })

  it('tarefa inexistente → 404', async () => {
    await expect(beginWorkPeriod({ taskId: 'a'.repeat(24), workbenchId: 'wb-x', stage: null, agent: null, model: null }, 'local')).rejects.toMatchObject({ status: 404, code: 'TASK_NOT_FOUND' })
  })

  it('é idempotente por mesa e permite vários períodos ativos ao mesmo tempo', async () => {
    const taskA = await seedTask()
    const taskB = (await mocks.models.devTask.create({ code: 'OPX-8', title: 'Outra', columnId: 'todo', order: 0, priority: 'low', archived: false }))._id as string
    const first = await beginWorkPeriod({ taskId: taskA, workbenchId: 'wb-a', stage: 'planning', agent: 'plan', model: null }, 'local')
    const again = await beginWorkPeriod({ taskId: taskA, workbenchId: 'wb-a', stage: 'implementing', agent: 'build', model: null }, 'local')
    expect(again.id).toBe(first.id)
    await beginWorkPeriod({ taskId: taskB, workbenchId: 'wb-b', stage: 'planning', agent: 'plan', model: null }, 'local')
    const active = await listActiveTimers()
    expect(active).toHaveLength(2)
    expect(active.map((log) => log.workbenchId).sort()).toEqual(['wb-a', 'wb-b'])
  })

  it('acumula tokens/custo no período e atualiza etapa/agente/modelo', async () => {
    const taskId = await seedTask()
    const log = await beginWorkPeriod({ taskId, workbenchId: 'wb-1', stage: 'implementing', agent: 'build', model: 'openai/gpt' }, 'local')
    await accumulateWorkPeriodUsage('wb-1', { costUsd: 0.25, inputTokens: 100, outputTokens: 40, reasoningTokens: 10 })
    await accumulateWorkPeriodUsage('wb-1', { costUsd: 0.1, inputTokens: 20, outputTokens: 5, reasoningTokens: 0 })
    await touchWorkPeriod('wb-1', { stage: 'building', agent: 'build', model: 'anthropic/haiku' })
    const [active] = await listActiveTimers()
    expect(active).toMatchObject({ id: log.id, costUsd: 0.35, inputTokens: 120, outputTokens: 45, reasoningTokens: 10, stage: 'building', model: 'anthropic/haiku' })
  })

  it('fechar o período calcula a duração e para de listá-lo como ativo', async () => {
    const taskId = await seedTask()
    const log = await beginWorkPeriod({ taskId, workbenchId: 'wb-1', stage: 'planning', agent: 'plan', model: null }, 'local')
    const ended = await endWorkPeriod('wb-1', 'local', { description: 'Desenvolvimento agêntico · Concluída' })
    expect(ended).toMatchObject({ id: log.id, active: false, description: 'Desenvolvimento agêntico · Concluída' })
    expect(ended?.endTime).toBeTruthy()
    expect(mocks.recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ acao: 'ATUALIZAR' }))
    expect(await listActiveTimers()).toHaveLength(0)
    expect(await endWorkPeriod('wb-1', 'local')).toBeNull()
  })

  it('encerra período órfão pelo id e lista as referências ativas', async () => {
    const taskId = await seedTask()
    const log = await beginWorkPeriod({ taskId, workbenchId: 'wb-1', stage: null, agent: null, model: null }, 'local')
    const refs = await listActiveWorkPeriods()
    expect(refs).toEqual([{ id: log.id, taskId, workbenchId: 'wb-1' }])
    await endWorkPeriodById(log.id, 'local', 'Encerrado (execução perdida)')
    expect(await listActiveTimers()).toHaveLength(0)
  })

  it('apontamentos: filtra por período, pagina e soma os minutos e o custo', async () => {
    const taskId = await seedTask()
    const log = await beginWorkPeriod({ taskId, workbenchId: 'wb-1', stage: 'planning', agent: 'plan', model: null }, 'local')
    await accumulateWorkPeriodUsage('wb-1', { costUsd: 0.5, inputTokens: 1, outputTokens: 0, reasoningTokens: 0 })
    await endWorkPeriod('wb-1', 'local')
    mocks.models.timeLog.aggregate = async () => [{ totalMinutes: 60, totalCostUsd: 0.5 }]
    const page = await listTimeLogs({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z', page: 1 })
    expect(page).toMatchObject({ page: 1, totalPages: 1, total: 1, totalMinutes: 60, totalCostUsd: 0.5 })
    expect(page.logs[0]).toMatchObject({ id: log.id, taskId, taskCode: 'OPX-7', costUsd: 0.5 })
  })
})
