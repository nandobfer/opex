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

import { deleteTimeLog, listActiveTimers, listTimeLogs, startTimer, stopTimer, updateTimeLog } from '@/features/time/server/service'

const reset = () => {
  for (const model of Object.values(mocks.models)) model.docs.length = 0
}
const seedTask = async () => (await mocks.models.devTask.create({ code: 'OPX-7', title: 'Ajustar login', columnId: 'todo', order: 0, priority: 'high', archived: false }))._id as string

beforeEach(() => {
  vi.clearAllMocks()
  reset()
})

describe('timers locais', () => {
  it('iniciar cria o apontamento ativo, audita e avisa a tela', async () => {
    const taskId = await seedTask()
    const log = await startTimer({ taskId }, 'local')
    expect(log).toMatchObject({ taskId, taskCode: 'OPX-7', taskTitle: 'Ajustar login', active: true, duration: null })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'Apontamento', acao: 'CRIAR' }))
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'time-updated', { taskIds: [taskId] })
  })

  it('tarefa inexistente → 404; já com timer → 409', async () => {
    await expect(startTimer({ taskId: 'a'.repeat(24) }, 'local')).rejects.toMatchObject({ status: 404, code: 'TASK_NOT_FOUND' })
    const taskId = await seedTask()
    await startTimer({ taskId }, 'local')
    await expect(startTimer({ taskId }, 'local')).rejects.toMatchObject({ status: 409, code: 'TIMER_RUNNING' })
  })

  it('parar calcula a duração e grava descrição', async () => {
    const taskId = await seedTask()
    const started = await startTimer({ taskId }, 'local')
    const log = await stopTimer(started.id, { description: 'Revisão', startTime: '2026-10-08T12:00:00.000Z', endTime: '2026-10-08T13:30:00.000Z' }, 'local')
    expect(log).toMatchObject({ duration: 90, description: 'Revisão', active: false })
    await expect(stopTimer(started.id, { startTime: '2026-10-08T13:00:00.000Z', endTime: '2026-10-08T12:00:00.000Z' }, 'local')).rejects.toMatchObject({ status: 400 })
  })

  it('ativos lista só os ativos com o código da tarefa', async () => {
    const taskId = await seedTask()
    await startTimer({ taskId }, 'local')
    const active = await listActiveTimers()
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({ taskId, taskCode: 'OPX-7', active: true })
  })

  it('apontamentos: filtra por período, pagina e soma os minutos', async () => {
    const taskId = await seedTask()
    const log = await startTimer({ taskId }, 'local')
    await stopTimer(log.id, { startTime: '2026-10-08T12:00:00.000Z', endTime: '2026-10-08T13:00:00.000Z' }, 'local')
    mocks.models.timeLog.aggregate = async () => [{ total: 60 }]
    const page = await listTimeLogs({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z', page: 1 })
    expect(page).toMatchObject({ page: 1, totalPages: 1, total: 1, totalMinutes: 60 })
    expect(page.logs[0]).toMatchObject({ taskId, taskCode: 'OPX-7', duration: 60 })
  })

  it('editar descrição e período; excluir remove', async () => {
    const taskId = await seedTask()
    const log = await startTimer({ taskId }, 'local')
    await updateTimeLog(log.id, { kind: 'description', description: 'Nova' }, 'local')
    await updateTimeLog(log.id, { kind: 'period', startTime: '2026-10-08T12:00:00.000Z', endTime: '2026-10-08T12:30:00.000Z' }, 'local')
    expect((await listActiveTimers())[0]).toMatchObject({ description: 'Nova', duration: 30 })
    await deleteTimeLog(log.id, 'local')
    expect(await listActiveTimers()).toHaveLength(0)
    expect(mocks.recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ acao: 'EXCLUIR' }))
  })
})
