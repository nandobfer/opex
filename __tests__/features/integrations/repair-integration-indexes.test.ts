import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  jobAggregate: vi.fn(),
  jobDeleteMany: vi.fn(),
  jobUpdateOne: vi.fn(),
  jobCreateIndexes: vi.fn(),
  statusAggregate: vi.fn(),
  statusDeleteMany: vi.fn(),
  statusCreateIndexes: vi.fn(),
  logCreateIndexes: vi.fn(),
  configFindOne: vi.fn(),
  configCreateIndexes: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/lib/db/models/CronJobState', () => ({
  CronJobState: {
    aggregate: mocks.jobAggregate,
    deleteMany: mocks.jobDeleteMany,
    updateOne: mocks.jobUpdateOne,
    createIndexes: mocks.jobCreateIndexes,
  },
}))
vi.mock('@/lib/db/models/IntegrationStatus', () => ({
  IntegrationStatus: {
    aggregate: mocks.statusAggregate,
    deleteMany: mocks.statusDeleteMany,
    createIndexes: mocks.statusCreateIndexes,
  },
}))
vi.mock('@/lib/db/models/IntegrationLog', () => ({ IntegrationLog: { createIndexes: mocks.logCreateIndexes } }))
vi.mock('@/lib/db/models/Integration', () => ({
  Integration: { findOne: () => ({ lean: mocks.configFindOne }), createIndexes: mocks.configCreateIndexes },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: mocks.loggerError, info: vi.fn() } }))

import { repairIntegrationIndexes } from '@/lib/db/migrations/repair-integration-indexes'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.jobAggregate.mockResolvedValue([])
  mocks.statusAggregate.mockResolvedValue([])
  mocks.jobDeleteMany.mockResolvedValue({ deletedCount: 0 })
  mocks.statusDeleteMany.mockResolvedValue({ deletedCount: 0 })
  mocks.configFindOne.mockResolvedValue(null)
})

describe('repairIntegrationIndexes (issue #604)', () => {
  it('remove duplicados mantendo um por rotina e recalcula o nextRunAt pela configuração atual', async () => {
    mocks.jobAggregate.mockResolvedValue([{ _id: 'cancel', keep: 'keep-id', count: 861 }])
    mocks.jobDeleteMany.mockResolvedValue({ deletedCount: 860 })
    mocks.configFindOne.mockResolvedValue({
      publicValues: {
        jobs: [
          { id: 'cancel', label: 'Cancelar', kind: 'http', schedule: { type: 'daily', time: '08:51' }, enabled: true },
          { id: 'health', label: 'Status', kind: 'internal', schedule: { type: 'interval', minutes: 5 }, enabled: true },
        ],
      },
    })

    await repairIntegrationIndexes(new Date('2026-09-23T11:00:00.000Z'))

    // Mantém a última execução real; sem nenhuma, o mais antigo.
    expect(mocks.jobAggregate.mock.calls[0][0][0]).toEqual({ $sort: { lastRunAt: -1, _id: 1 } })
    expect(mocks.jobDeleteMany).toHaveBeenCalledWith({ jobId: 'cancel', _id: { $ne: 'keep-id' } })
    // Só a rotina que tinha duplicados é recalculada.
    expect(mocks.jobUpdateOne).toHaveBeenCalledTimes(1)
    expect(mocks.jobUpdateOne).toHaveBeenCalledWith(
      { jobId: 'cancel' },
      { $set: { scheduleSignature: 'daily:08:51', nextRunAt: new Date('2026-09-23T11:51:00.000Z') } },
    )
  })

  it('cria os índices de todas as coleções mesmo sem duplicados (idempotente)', async () => {
    await repairIntegrationIndexes()
    expect(mocks.jobDeleteMany).not.toHaveBeenCalled()
    expect(mocks.jobCreateIndexes).toHaveBeenCalled()
    expect(mocks.statusCreateIndexes).toHaveBeenCalled()
    expect(mocks.logCreateIndexes).toHaveBeenCalled()
    expect(mocks.configCreateIndexes).toHaveBeenCalled()
  })

  it('falha ao criar índice de uma coleção não impede as demais', async () => {
    mocks.jobCreateIndexes.mockRejectedValue(new Error('E11000'))
    await repairIntegrationIndexes()
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expect(mocks.logCreateIndexes).toHaveBeenCalled()
  })

  it('remove status duplicados mantendo o mais recente', async () => {
    mocks.statusAggregate.mockResolvedValue([{ _id: 'pusher', keep: 's1', count: 2 }])
    await repairIntegrationIndexes()
    expect(mocks.statusAggregate.mock.calls[0][0][0]).toEqual({ $sort: { checkedAt: -1, _id: 1 } })
    expect(mocks.statusDeleteMany).toHaveBeenCalledWith({ integrationId: 'pusher', _id: { $ne: 's1' } })
  })
})
