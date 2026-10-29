import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ counter: vi.fn(), findOne: vi.fn(), updateOne: vi.fn(), warn: vi.fn() }))

vi.mock('@/lib/db/models/Counter', () => ({ Counter: { updateOne: mocks.counter } }))
vi.mock('@/lib/db/models/Integration', () => ({ Integration: { findOne: () => ({ lean: mocks.findOne }), updateOne: mocks.updateOne } }))
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }))

import { migrateOpencodeQuotaCronInterval, quotaJobsToOneMinute } from '@/lib/db/migrations/opencode-quota-cron-interval'
import { HEALTH_CHECK_JOB_ID, OPENCODE_QUOTA_JOB_ID, type CronJobConfig } from '@/lib/integrations/catalog'

const job = (id: string, minutes: number): CronJobConfig => ({ id, label: id, kind: 'internal', schedule: { type: 'interval', minutes }, enabled: true })

beforeEach(() => vi.clearAllMocks())

describe('migração do intervalo da rotina da quota do OpenCode (OPE-93)', () => {
  it('troca só a rotina da quota que ainda está no padrão antigo de 5 min', () => {
    const next = quotaJobsToOneMinute([job(HEALTH_CHECK_JOB_ID, 5), job(OPENCODE_QUOTA_JOB_ID, 5)])
    expect(next?.map((item) => [item.id, item.schedule])).toEqual([
      [HEALTH_CHECK_JOB_ID, { type: 'interval', minutes: 5 }],
      [OPENCODE_QUOTA_JOB_ID, { type: 'interval', minutes: 1 }],
    ])
  })

  it('valor escolhido pelo usuário ou rotina ausente não muda', () => {
    expect(quotaJobsToOneMinute([job(OPENCODE_QUOTA_JOB_ID, 10)])).toBeNull()
    expect(quotaJobsToOneMinute([job(HEALTH_CHECK_JOB_ID, 5)])).toBeNull()
  })

  it('grava na primeira execução e não roda de novo depois do marcador', async () => {
    mocks.counter.mockResolvedValueOnce({ upsertedCount: 1 })
    mocks.findOne.mockResolvedValue({ publicValues: { jobs: [job(OPENCODE_QUOTA_JOB_ID, 5)] } })
    await migrateOpencodeQuotaCronInterval()
    expect(mocks.updateOne).toHaveBeenCalledWith({ integrationId: 'crons' }, { $set: { 'publicValues.jobs': [{ ...job(OPENCODE_QUOTA_JOB_ID, 1) }] } })

    mocks.counter.mockResolvedValueOnce({ upsertedCount: 0 })
    await migrateOpencodeQuotaCronInterval()
    expect(mocks.findOne).toHaveBeenCalledTimes(1)
    expect(mocks.updateOne).toHaveBeenCalledTimes(1)
  })

  it('sem rotinas salvas não grava nada', async () => {
    mocks.counter.mockResolvedValue({ upsertedCount: 1 })
    mocks.findOne.mockResolvedValue(null)
    await migrateOpencodeQuotaCronInterval()
    expect(mocks.updateOne).not.toHaveBeenCalled()
  })
})
