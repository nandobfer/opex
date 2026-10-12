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

const PROJ_A = 'a'.repeat(24)
const PROJ_B = 'b'.repeat(24)

const seedTypedTask = async (code: string, projectId: string, taskType: string | null) =>
  (await mocks.models.devTask.create({ code, title: code, projectId, columnId: 'todo', order: 0, priority: 'high', taskType, archived: false }))._id as string

const seedLog = async (taskId: string, startTime: string, duration = 30, costUsd = 0) => {
  await mocks.models.timeLog.create({
    taskId,
    workbenchId: `wb-${taskId.slice(0, 4)}`,
    stage: 'implementing',
    agent: 'build',
    model: null,
    startTime: new Date(startTime),
    endTime: new Date(startTime),
    duration,
    costUsd,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    description: null,
    active: false,
  })
}

describe('filtros de repositório e tipo', () => {
  const PERIOD = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z' }

  beforeEach(() => {
    // O teste anterior deixa a agregação fixa; aqui os totais voltam ao comportamento neutro.
    mocks.models.timeLog.aggregate = async () => []
  })

  it('filtra por repositório, com OU entre os escolhidos', async () => {
    const taskA = await seedTypedTask('OPX-1', PROJ_A, 'feature')
    const taskB = await seedTypedTask('OPX-2', PROJ_B, 'bugfix')
    await seedLog(taskA, '2026-10-05T10:00:00.000Z')
    await seedLog(taskB, '2026-10-06T10:00:00.000Z')

    const onlyA = await listTimeLogs({ ...PERIOD, page: 1, projects: [PROJ_A] })
    expect(onlyA.total).toBe(1)
    expect(onlyA.logs.map((log) => log.taskId)).toEqual([taskA])

    const both = await listTimeLogs({ ...PERIOD, page: 1, projects: [PROJ_A, PROJ_B] })
    expect(both.total).toBe(2)
    expect(both.logs.map((log) => log.taskId).sort()).toEqual([taskA, taskB].sort())
  })

  it('filtra por tipo e deixa de fora a tarefa sem tipo — só quando o filtro está ativo', async () => {
    const feature = await seedTypedTask('OPX-1', PROJ_A, 'feature')
    const bugfix = await seedTypedTask('OPX-2', PROJ_A, 'bugfix')
    const untagged = await seedTypedTask('OPX-3', PROJ_A, null)
    await seedLog(feature, '2026-10-01T10:00:00.000Z')
    await seedLog(bugfix, '2026-10-02T10:00:00.000Z')
    await seedLog(untagged, '2026-10-03T10:00:00.000Z')

    expect((await listTimeLogs({ ...PERIOD, page: 1 })).total).toBe(3)
    expect((await listTimeLogs({ ...PERIOD, page: 1, types: ['feature'] })).logs.map((log) => log.taskId)).toEqual([feature])
    expect((await listTimeLogs({ ...PERIOD, page: 1, types: ['feature', 'bugfix'] })).total).toBe(2)
  })

  it('combina período, repositório e tipo (E entre os recortes)', async () => {
    const taskA = await seedTypedTask('OPX-1', PROJ_A, 'feature')
    const taskB = await seedTypedTask('OPX-2', PROJ_A, 'bugfix')
    await seedLog(taskA, '2026-10-05T10:00:00.000Z')
    await seedLog(taskB, '2026-10-06T10:00:00.000Z')
    await seedLog(taskB, '2026-09-01T10:00:00.000Z')

    const page = await listTimeLogs({ ...PERIOD, page: 1, projects: [PROJ_A], types: ['feature'] })
    expect(page.total).toBe(1)
    expect(page.logs[0]?.taskId).toBe(taskA)
  })

  it('sem tarefa correspondente devolve lista vazia e totais zerados', async () => {
    const taskA = await seedTypedTask('OPX-1', PROJ_A, 'feature')
    await seedLog(taskA, '2026-10-05T10:00:00.000Z')

    const page = await listTimeLogs({ ...PERIOD, page: 1, projects: ['c'.repeat(24)] })
    expect(page).toMatchObject({ page: 1, totalPages: 1, total: 0, totalMinutes: 0, totalCostUsd: 0, logs: [] })
  })

  it('a agregação dos totais recebe o mesmo recorte dos apontamentos', async () => {
    const taskB = await seedTypedTask('OPX-2', PROJ_B, 'bugfix')
    let pipeline: Array<{ $match: Record<string, unknown> }> = []
    mocks.models.timeLog.aggregate = async (next) => {
      pipeline = next as typeof pipeline
      return []
    }

    await listTimeLogs({ ...PERIOD, page: 1, projects: [PROJ_B], types: ['bugfix'] })

    expect(pipeline[0]?.$match).toMatchObject({ taskId: { $in: [taskB] }, startTime: { $gte: new Date(PERIOD.from), $lte: new Date(PERIOD.to) } })
  })
})
