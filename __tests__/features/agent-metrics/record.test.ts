import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  eventUpdate: vi.fn(),
  runUpdate: vi.fn(),
  taskFind: vi.fn(),
  warn: vi.fn(),
  trackingBulk: vi.fn(async () => ({})),
  trackingFind: vi.fn(),
  trackingUpdate: vi.fn(async () => ({})),
  syncRuns: vi.fn(async () => 5),
  syncConversations: vi.fn(async () => 2),
  runFind: vi.fn(),
  dayDelete: vi.fn(async () => ({})),
  dayInsert: vi.fn(async () => []),
  publish: vi.fn(async () => {}),
  reconcile: vi.fn(async (): Promise<Date | null> => null),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(async () => {}) }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ warn: mocks.warn, info: vi.fn() }), logger: { warn: mocks.warn } }))
vi.mock('@/lib/db/models/DevTask', () => ({ DevTask: { findById: () => ({ select: () => ({ lean: mocks.taskFind }) }) } }))
vi.mock('@/lib/db/models/AgentMetrics', () => ({
  AgentMetricEvent: { updateOne: mocks.eventUpdate },
  AgentRun: { updateOne: mocks.runUpdate, find: () => ({ select: () => ({ lean: mocks.runFind }) }) },
  AgentMetricTracking: { bulkWrite: mocks.trackingBulk, findOne: () => ({ lean: mocks.trackingFind }), updateOne: mocks.trackingUpdate },
  AgentUsageDay: { deleteMany: mocks.dayDelete, insertMany: mocks.dayInsert },
}))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/features/agent-metrics/server/exclusions', () => ({ COUNTED_RUN: { excluded: { $ne: true } }, reconcileExcludedRuns: mocks.reconcile }))
vi.mock('@/features/agent-metrics/server/sync', () => ({ syncAgentRuns: mocks.syncRuns }))
vi.mock('@/features/agent-metrics/server/conversations', () => ({ syncConversations: mocks.syncConversations }))

import { recordAgentEvent, recordAgentEventNow, recordAgentRun } from '@/features/agent-metrics/server/record'
import { ensureFreshRuns, resetFreshRunsForTests, runAgentMetricsRoutine } from '@/features/agent-metrics/server/usage-daily'
import { startAgentMetricsTracking } from '@/lib/db/migrations/agent-metrics-tracking-start'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.taskFind.mockResolvedValue({ clientId: 'c1', projectId: 'p1' })
  mocks.eventUpdate.mockResolvedValue({})
  mocks.runUpdate.mockResolvedValue({})
  mocks.runFind.mockResolvedValue([])
})

describe('gravação dos fatos das métricas', () => {
  it('grava uma vez por dedupKey ($setOnInsert), com cliente e repositório da tarefa', async () => {
    const at = new Date('2026-11-03T12:00:00Z')
    await recordAgentEventNow({ agent: 'desenvolvedor', type: 'reopened', at, workbenchId: 'w1', taskId: 't1', centralId: 'c' })
    expect(mocks.eventUpdate).toHaveBeenCalledWith(
      { dedupKey: `reopened:w1:${at.getTime()}` },
      { $setOnInsert: expect.objectContaining({ agent: 'desenvolvedor', type: 'reopened', workbenchId: 'w1', clientId: 'c1', projectId: 'p1' }) },
      { upsert: true },
    )
  })

  it('fire-and-forget: banco recusando a gravação não rejeita nem derruba o fluxo (vira aviso)', async () => {
    mocks.eventUpdate.mockRejectedValue(new Error('mongo fora'))
    mocks.runUpdate.mockRejectedValue(new Error('mongo fora'))
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    expect(() => recordAgentEvent({ agent: 'desenvolvedor', type: 'retried', workbenchId: 'w1' })).not.toThrow()
    expect(() => recordAgentRun({ dedupKey: 'x', agent: 'refinador', kind: 'refinement-turn', finishedAt: new Date() })).not.toThrow()
    await flush()
    await flush()
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledTimes(2)
  })
})

describe('rotina agent-usage-daily', () => {
  it('primeira execução: backfill desde o início e marca o backfill; depois, só os últimos dias', async () => {
    const now = new Date('2026-11-03T12:00:00Z')
    mocks.trackingFind.mockResolvedValueOnce(null)
    await runAgentMetricsRoutine(now)
    expect(mocks.syncRuns).toHaveBeenLastCalledWith(expect.any(Array), new Date(0))
    expect(mocks.trackingUpdate).toHaveBeenCalledWith({ type: 'backfill' }, { $setOnInsert: { type: 'backfill', since: now } }, { upsert: true })
    expect(mocks.publish).toHaveBeenCalledWith('agent-metrics-updated', expect.any(Object))

    mocks.trackingFind.mockResolvedValueOnce({ type: 'backfill', since: now })
    await runAgentMetricsRoutine(now)
    expect(mocks.syncRuns).toHaveBeenLastCalledWith(expect.any(Array), new Date(now.getTime() - 3 * 86_400_000))
    expect(mocks.trackingUpdate).toHaveBeenCalledTimes(1)
  })

  it('mesa excluída antes da janela: o resumo diário é recalculado desde o dia afetado', async () => {
    const now = new Date('2026-11-03T12:00:00Z')
    mocks.trackingFind.mockResolvedValueOnce({ type: 'backfill', since: now })
    mocks.reconcile.mockResolvedValueOnce(new Date('2026-10-20T12:00:00Z'))
    await runAgentMetricsRoutine(now)
    expect(mocks.dayDelete).toHaveBeenLastCalledWith({ day: { $gte: '2026-10-20' } })
  })

  it('Visão geral antes da primeira execução da rotina: faz o backfill completo na hora (uma vez)', async () => {
    resetFreshRunsForTests()
    const now = new Date('2026-11-03T12:00:00Z').getTime()
    mocks.trackingFind.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    await ensureFreshRuns('revisor', now)
    expect(mocks.syncRuns).toHaveBeenCalledWith(expect.any(Array), new Date(0))
    expect(mocks.trackingUpdate).toHaveBeenCalledWith({ type: 'backfill' }, expect.anything(), { upsert: true })
  })

  it('com o backfill feito: só os últimos dias do agente e a reconciliação das exclusões', async () => {
    resetFreshRunsForTests()
    const now = new Date('2026-11-03T12:00:00Z').getTime()
    mocks.trackingFind.mockResolvedValueOnce({ type: 'backfill', since: new Date(now) })
    mocks.reconcile.mockResolvedValueOnce(new Date('2026-10-30T12:00:00Z'))
    await ensureFreshRuns('desenvolvedor', now)
    expect(mocks.syncRuns).toHaveBeenCalledWith(['desenvolvedor'], new Date(now - 2 * 86_400_000))
    expect(mocks.dayDelete).toHaveBeenLastCalledWith({ day: { $gte: '2026-10-30' } })
    expect(mocks.trackingUpdate).not.toHaveBeenCalled()
  })

  it('migração dos marcadores "Dados desde" é idempotente ($setOnInsert por fato)', async () => {
    await startAgentMetricsTracking(new Date('2026-11-03T00:00:00Z'))
    const ops = (mocks.trackingBulk.mock.calls[0] as unknown as [{ updateOne: { filter: { type: string }; update: unknown; upsert: boolean } }[]])[0]
    expect(ops.map((op) => op.updateOne.filter.type)).toEqual(expect.arrayContaining(['stage-entered', 'interrupted', 'ci-fixed', 'pr-review-replanned', 'refinement-started', 'conversations']))
    expect(ops.every((op) => op.updateOne.upsert && 'type' in ((op.updateOne.update as { $setOnInsert: object }).$setOnInsert ?? {}))).toBe(true)
  })
})
