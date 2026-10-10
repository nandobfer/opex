import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class DomainError extends Error {
    constructor(readonly status: number, message: string, readonly code?: string) {
      super(message)
      this.name = 'DomainError'
    }
  }
  return {
    start: vi.fn(),
    DomainError,
    models: {} as Record<string, { docs: unknown[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }>,
  }
})

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api/route', () => ({ DomainError: mocks.DomainError }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.central = memoryModel()
  mocks.models.workbench = memoryModel()
  return { AgenticCentral: mocks.models.central, AgenticWorkbench: mocks.models.workbench, AgenticEvent: memoryModel() }
})
vi.mock('@/lib/db/models/DevTask', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.task = memoryModel()
  return { DevTask: mocks.models.task, TaskComment: memoryModel() }
})
vi.mock('@/features/agentic/server/workflow', () => ({ startWorkbench: mocks.start }))

import { listCentralQueue, notifyTasksColumnChanged, pumpAllCentralQueues, pumpCentralQueue } from '@/features/agentic/server/queue'

/** Central com a coluna da fila `fila` (limite padrão 2). */
const central = async (overrides: Record<string, unknown> = {}) =>
  (await mocks.models.central.create({ projectId: 'p1', projectName: 'App', config: { maxConcurrent: 2, columns: { queue: 'fila' } }, ...overrides }))._id as string

const task = async (order: number, overrides: Record<string, unknown> = {}) =>
  (await mocks.models.task.create({ code: `APP-${order}`, projectId: 'p1', columnId: 'fila', order, title: `Tarefa ${order}`, archived: false, ...overrides }))._id as string

const openWorkbench = async (centralId: string, taskId: string, stage = 'plan_review') => {
  await mocks.models.workbench.create({ centralId, taskId, stage, runState: 'idle' })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const model of Object.values(mocks.models)) model.docs.length = 0
})

describe('listCentralQueue', () => {
  it('lista os cards da fila na ordem do kanban, com posição, ignorando quem já tem mesa', async () => {
    const cid = await central()
    const third = await task(30)
    const first = await task(10)
    const second = await task(20)
    await openWorkbench(cid, second)

    const queue = await listCentralQueue(cid)
    expect(queue.map((item) => item.taskId)).toEqual([first, third])
    expect(queue.map((item) => item.position)).toEqual([1, 2])
    expect(queue[0]).toMatchObject({ code: 'APP-10', columnId: 'fila' })
  })

  it('vazia sem coluna da fila ou com a central desativada', async () => {
    const noQueue = await central({ config: { maxConcurrent: 2, columns: { queue: null } } })
    const disabled = await central({ projectId: 'p2', config: { enabled: false, maxConcurrent: 2, columns: { queue: 'fila' } } })
    await task(1)
    expect(await listCentralQueue(noQueue)).toEqual([])
    expect(await listCentralQueue(disabled)).toEqual([])
  })
})

describe('pumpCentralQueue', () => {
  it('abre mesas na ordem da fila até o limite de mesas abertas', async () => {
    const cid = await central()
    const first = await task(1)
    const second = await task(2)
    await task(3)
    mocks.start.mockResolvedValue(undefined)

    await pumpCentralQueue(cid)
    expect(mocks.start.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      [cid, first],
      [cid, second],
    ])
  })

  it('não abre nada quando o limite de mesas abertas está ocupado', async () => {
    const cid = await central()
    await openWorkbench(cid, 'x1')
    await openWorkbench(cid, 'x2')
    await task(1)
    mocks.start.mockResolvedValue(undefined)

    await pumpCentralQueue(cid)
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('mesa concluída não ocupa a vaga: a próxima da fila abre', async () => {
    const cid = await central()
    await openWorkbench(cid, 'antiga', 'done')
    const next = await task(1)
    mocks.start.mockResolvedValue(undefined)

    await pumpCentralQueue(cid)
    expect(mocks.start).toHaveBeenCalledWith(cid, next)
  })

  it('tarefa que já tem mesa não é iniciada', async () => {
    const cid = await central()
    const already = await task(1)
    await openWorkbench(cid, already)
    mocks.start.mockResolvedValue(undefined)

    await pumpCentralQueue(cid)
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('erro de disponibilidade interrompe a fila (não tenta a próxima)', async () => {
    const cid = await central()
    await task(1)
    await task(2)
    mocks.start.mockRejectedValue(new mocks.DomainError(409, 'OpenCode fora', 'AGENTIC_UNAVAILABLE'))

    await pumpCentralQueue(cid)
    expect(mocks.start).toHaveBeenCalledTimes(1)
  })
})

describe('notifyTasksColumnChanged', () => {
  it('processa a fila da central do projeto da tarefa', async () => {
    const cid = await central()
    const moved = await task(1)
    mocks.start.mockResolvedValue(undefined)

    await notifyTasksColumnChanged([moved])
    expect(mocks.start).toHaveBeenCalledWith(cid, moved)
  })

  it('projeto sem central não inicia nada', async () => {
    const moved = await task(1)
    mocks.start.mockResolvedValue(undefined)

    await notifyTasksColumnChanged([moved])
    expect(mocks.start).not.toHaveBeenCalled()
  })
})

describe('pumpAllCentralQueues', () => {
  it('processa só as centrais com coluna da fila e resume', async () => {
    const cid = await central()
    await central({ projectId: 'p2', config: { maxConcurrent: 2, columns: { queue: null } } })
    const waiting = await task(1)
    mocks.start.mockResolvedValue(undefined)

    const summary = await pumpAllCentralQueues()
    expect(summary).toContain('1 central')
    expect(mocks.start).toHaveBeenCalledWith(cid, waiting)
  })
})
