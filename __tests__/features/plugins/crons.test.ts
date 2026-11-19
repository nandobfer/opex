import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection, type FakeCollection } from '../../helpers/fake-collection'

/** Crons de plugin (OPE-172): rodam pelo tick do agendador com lease por cron; os da prévia não agendam. */

const holder = vi.hoisted(() => ({ jobs: null as unknown as FakeCollection }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/instance', () => ({ INSTANCE_ID: 'inst-1' }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/db/models/CronJobState', () => ({
  get CronJobState() {
    return {
      ...holder.jobs,
      updateOne: async (filter: Record<string, unknown>, update: Record<string, unknown>, options: { upsert?: boolean } = {}) => {
        const found = await holder.jobs.findOne(filter)
        if (!found && options.upsert) {
          holder.jobs.insert({ ...filter, ...((update.$setOnInsert as object) ?? {}), lockedUntil: null })
          return { matchedCount: 0 }
        }
        if (!found || !('$set' in update)) return { matchedCount: found ? 1 : 0 }
        return holder.jobs.updateOne(filter, { $set: update.$set })
      },
    }
  },
}))

import { runPluginCrons } from '@/features/plugins/server/crons'
import { cronKey, pluginRegistries } from '@/features/plugins/server/kernel/registries'

const owner = (channel: 'stable' | 'preview') => ({ pluginId: 'relogio', channel, versionId: 'v1', fiberId: channel })

beforeEach(() => {
  holder.jobs = createFakeCollection()
  pluginRegistries().crons.clear()
})

describe('runPluginCrons', () => {
  it('roda o cron da stable uma vez por janela e ignora o da prévia', async () => {
    const stableRun = vi.fn()
    const previewRun = vi.fn()
    pluginRegistries().crons.add(cronKey('stable', 'relogio', 'tique'), owner('stable'), { name: 'tique', schedule: { type: 'interval', minutes: 5 }, run: stableRun, scheduled: true })
    pluginRegistries().crons.add(cronKey('preview', 'relogio', 'tique'), owner('preview'), { name: 'tique', schedule: { type: 'interval', minutes: 5 }, run: previewRun, scheduled: false })

    const start = new Date('2026-11-19T12:00:00Z')
    // A primeira passagem só agenda (próxima execução no futuro); a de 6 minutos depois roda.
    await runPluginCrons(start)
    const later = new Date(start.getTime() + 6 * 60_000)
    expect(await runPluginCrons(later)).toEqual(['plugin:relogio:tique'])
    expect(await runPluginCrons(later)).toEqual([])
    expect(stableRun).toHaveBeenCalledTimes(1)
    expect(previewRun).not.toHaveBeenCalled()
    expect(holder.jobs.docs[0]).toMatchObject({ jobId: 'plugin:relogio:tique', lastStatus: 'ok', lockedBy: null })
  })

  it('falha do cron fica registrada e libera o lease', async () => {
    pluginRegistries().crons.add(cronKey('stable', 'relogio', 'tique'), owner('stable'), { name: 'tique', schedule: { type: 'interval', minutes: 5 }, run: () => Promise.reject(new Error('sem rede')), scheduled: true })
    const start = new Date('2026-11-19T12:00:00Z')
    await runPluginCrons(start)
    await runPluginCrons(new Date(start.getTime() + 6 * 60_000))
    expect(holder.jobs.docs[0]).toMatchObject({ lastStatus: 'error', lastError: 'sem rede', lockedUntil: null })
  })
})
