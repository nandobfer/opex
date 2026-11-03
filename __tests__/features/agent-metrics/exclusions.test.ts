import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runs: [] as { workbenchId: string | null; taskId: string | null; finishedAt: Date; excluded?: boolean }[],
  workbenches: [] as string[],
  tasks: [] as { _id: string; archived?: boolean }[],
}))

const matches = (run: (typeof mocks.runs)[number], filter: Record<string, unknown>): boolean =>
  Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return (cond as Record<string, unknown>[]).some((item) => matches(run, item))
    const value = (run as Record<string, unknown>)[key] ?? (key === 'excluded' ? false : null)
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const op = cond as Record<string, unknown>
      if ('$ne' in op) return value !== op.$ne
      if ('$in' in op) return (op.$in as unknown[]).includes(value)
      if ('$nin' in op) return !(op.$nin as unknown[]).includes(value)
      if ('$gte' in op) return value instanceof Date && value >= (op.$gte as Date)
    }
    return value === cond
  })

const query = <T,>(rows: () => T) => ({ sort: () => query(rows), select: () => query(rows), lean: async () => rows() })

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(async () => {}) }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: { find: () => query(() => mocks.workbenches.map((_id) => ({ _id }))) } }))
vi.mock('@/lib/db/models/DevTask', () => ({ DevTask: { find: () => query(() => mocks.tasks) } }))
vi.mock('@/lib/db/models/AgentMetrics', () => ({
  AgentRun: {
    distinct: async (field: 'workbenchId' | 'taskId') => [...new Set(mocks.runs.map((run) => run[field]).filter(Boolean))],
    findOne: (filter: Record<string, unknown>) => query(() => [...mocks.runs].filter((run) => matches(run, filter)).sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime())[0] ?? null),
    updateMany: async (filter: Record<string, unknown>, update: { $set: { excluded: boolean } }) => {
      for (const run of mocks.runs) if (matches(run, filter)) run.excluded = update.$set.excluded
    },
  },
}))

import { hiddenReferences, reconcileExcludedRuns } from '@/features/agent-metrics/server/exclusions'

const WB = 'a'.repeat(24)
const TASK = 'b'.repeat(24)
const OTHER_TASK = 'c'.repeat(24)

beforeEach(() => {
  mocks.runs = [
    { workbenchId: WB, taskId: TASK, finishedAt: new Date('2026-10-20T12:00:00Z') },
    { workbenchId: WB, taskId: TASK, finishedAt: new Date('2026-10-21T12:00:00Z') },
    { workbenchId: null, taskId: OTHER_TASK, finishedAt: new Date('2026-10-25T12:00:00Z') },
    { workbenchId: null, taskId: null, finishedAt: new Date('2026-10-26T12:00:00Z') },
  ]
  mocks.workbenches = [WB]
  mocks.tasks = [{ _id: TASK }, { _id: OTHER_TASK }]
})

describe('mesa excluída e tarefa arquivada saem do Último uso e do Uso por data', () => {
  it('regra pura: mesa que não existe mais, tarefa arquivada ou excluída', () => {
    expect(hiddenReferences({ workbenchIds: ['w1', 'w2'], taskIds: ['t1', 't2', 't3'] }, { workbenchIds: new Set(['w1']), tasks: new Map([['t1', { archived: false }], ['t2', { archived: true }]]) })).toEqual({ workbenchIds: ['w2'], taskIds: ['t2', 't3'] })
  })

  it('mesa excluída: as execuções dela saem e o dia mais antigo afetado volta para recalcular o resumo', async () => {
    mocks.workbenches = []
    const since = await reconcileExcludedRuns()
    expect(since?.toISOString()).toBe('2026-10-20T12:00:00.000Z')
    expect(mocks.runs.map((run) => Boolean(run.excluded))).toEqual([true, true, false, false])
    // Nada mudou na segunda passada: não recalcula de novo.
    expect(await reconcileExcludedRuns()).toBeNull()
  })

  it('tarefa arquivada sai; desarquivada volta a contar', async () => {
    mocks.tasks = [{ _id: TASK }, { _id: OTHER_TASK, archived: true }]
    expect((await reconcileExcludedRuns())?.toISOString()).toBe('2026-10-25T12:00:00.000Z')
    expect(mocks.runs[2]!.excluded).toBe(true)
    mocks.tasks = [{ _id: TASK }, { _id: OTHER_TASK, archived: false }]
    expect((await reconcileExcludedRuns())?.toISOString()).toBe('2026-10-25T12:00:00.000Z')
    expect(mocks.runs[2]!.excluded).toBe(false)
  })
})
