import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  startBuildTurn: vi.fn(),
  isActive: vi.fn(),
  models: {} as Record<string, { docs: unknown[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }>,
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.workbench = memoryModel()
  return { AgenticWorkbench: mocks.models.workbench, AgenticCentral: memoryModel(), AgenticEvent: memoryModel() }
})
vi.mock('@/features/agentic/server/hub', () => ({ isWorkbenchActive: mocks.isActive }))
vi.mock('@/features/agentic/server/workflow', () => ({ startBuildTurn: mocks.startBuildTurn }))

import { buildQueuePosition, buildQueuePositions, pumpBuildQueue, runExclusiveBuild, waitingBuilds } from '@/features/agentic/server/build-queue'

/** Mesa na fila global do build, com a hora de chegada (define a ordem FIFO). */
const queued = async (at: Date, overrides: Record<string, unknown> = {}) =>
  (await mocks.models.workbench.create({ centralId: 'c1', taskId: `t-${at.getTime()}`, stage: 'build_queued', runState: 'idle', buildQueuedAt: at, ...overrides }))._id as string

beforeEach(() => {
  vi.clearAllMocks()
  for (const model of Object.values(mocks.models)) model.docs.length = 0
})

describe('fila do build — posições', () => {
  it('posição 1-based pela ordem de chegada; null fora da fila', async () => {
    const first = await queued(new Date('2026-01-01T10:00:00Z'))
    const second = await queued(new Date('2026-01-01T10:01:00Z'))
    const other = await queued(new Date('2026-01-01T09:00:00Z'), { stage: 'preview' })

    expect((await waitingBuilds()).map((item) => String(item._id))).toEqual([first, second])
    expect(await buildQueuePositions()).toEqual(new Map([[first, 1], [second, 2]]))
    expect(await buildQueuePosition(first)).toBe(1)
    expect(await buildQueuePosition(second)).toBe(2)
    expect(await buildQueuePosition(other)).toBeNull()
  })
})

describe('pumpBuildQueue — um build por vez', () => {
  it('build remoto vivo não ocupa a fila local', async () => {
    await mocks.models.workbench.create({ stage: 'building', runState: 'running', previewBuild: { method: 'github' } })
    const next = await queued(new Date('2026-01-01T10:00:00Z'))
    mocks.isActive.mockReturnValue(true)
    mocks.startBuildTurn.mockResolvedValue(true)
    await pumpBuildQueue()
    expect(mocks.startBuildTurn).toHaveBeenCalledWith(next)
  })
  it('inicia só o mais antigo da fila (FIFO) e não dispara os demais', async () => {
    const first = await queued(new Date('2026-01-01T10:00:00Z'))
    await queued(new Date('2026-01-01T10:01:00Z'))
    mocks.startBuildTurn.mockResolvedValue(true)

    await pumpBuildQueue()
    expect(mocks.startBuildTurn.mock.calls.map((call) => call[0])).toEqual([first])
  })

  it('não inicia nada quando já há um build vivo neste processo', async () => {
    await mocks.models.workbench.create({ centralId: 'c1', taskId: 'w-building', stage: 'building', runState: 'running' })
    await queued(new Date('2026-01-01T10:00:00Z'))
    mocks.isActive.mockReturnValue(true)
    mocks.startBuildTurn.mockResolvedValue(true)

    await pumpBuildQueue()
    expect(mocks.startBuildTurn).not.toHaveBeenCalled()
  })

  it('build órfão (não vivo no processo) não bloqueia a fila', async () => {
    await mocks.models.workbench.create({ centralId: 'c1', taskId: 'w-stale', stage: 'building', runState: 'running' })
    const next = await queued(new Date('2026-01-01T10:00:00Z'))
    mocks.isActive.mockReturnValue(false)
    mocks.startBuildTurn.mockResolvedValue(true)

    await pumpBuildQueue()
    expect(mocks.startBuildTurn).toHaveBeenCalledTimes(1)
    expect(mocks.startBuildTurn).toHaveBeenCalledWith(next)
  })

  it('mesa que saiu da fila (false) cede a vez para a próxima', async () => {
    const first = await queued(new Date('2026-01-01T10:00:00Z'))
    const second = await queued(new Date('2026-01-01T10:01:00Z'))
    mocks.startBuildTurn.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await pumpBuildQueue()
    expect(mocks.startBuildTurn.mock.calls.map((call) => call[0])).toEqual([first, second])
  })

  it('nada na fila não inicia build', async () => {
    mocks.startBuildTurn.mockResolvedValue(true)
    await pumpBuildQueue()
    expect(mocks.startBuildTurn).not.toHaveBeenCalled()
  })
})

describe('runExclusiveBuild — build de fora das mesas (Ambientes) na vez da fila global', () => {
  it('espera o build vivo da mesa terminar, ocupa a vez (a fila das mesas não inicia) e aciona a fila no fim', async () => {
    const building = (await mocks.models.workbench.create({ stage: 'building', runState: 'running' }))._id as string
    const next = await queued(new Date('2026-01-01T10:00:00Z'))
    mocks.isActive.mockImplementation((id: string) => id === building)
    mocks.startBuildTurn.mockResolvedValue(true)
    const order: string[] = []
    let release!: () => void
    const job = runExclusiveBuild(
      async () => {
        order.push('externo')
        await pumpBuildQueue()
        expect(mocks.startBuildTurn).not.toHaveBeenCalled()
        await new Promise<void>((resolve) => (release = resolve))
        return 'ok'
      },
      { pollMs: 5 },
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(order).toEqual([])
    mocks.isActive.mockReturnValue(false)
    await vi.waitFor(() => expect(order).toEqual(['externo']))
    release()
    expect(await job).toBe('ok')
    await vi.waitFor(() => expect(mocks.startBuildTurn).toHaveBeenCalledWith(next))
  })

  it('dois builds externos rodam um de cada vez', async () => {
    const order: string[] = []
    const slow = (name: string) => async () => {
      order.push(`${name}:início`)
      await new Promise((resolve) => setTimeout(resolve, 10))
      order.push(`${name}:fim`)
    }
    await Promise.all([runExclusiveBuild(slow('a'), { pollMs: 5 }), runExclusiveBuild(slow('b'), { pollMs: 5 })])
    expect(order).toEqual(['a:início', 'a:fim', 'b:início', 'b:fim'])
  })
})
