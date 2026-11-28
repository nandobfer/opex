import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection, type FakeCollection } from '../../helpers/fake-collection'

/** Crons de plugin (OPE-172): rodam pelo tick do agendador com lease por cron; os da prévia não agendam. */

const holder = vi.hoisted(() => ({ jobs: null as unknown as FakeCollection }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/instance', () => ({ INSTANCE_ID: 'inst-1' }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock("@nandobfer/integracoes/modules/mongoose/core-models", async (importOriginal) => [Object.getOwnPropertyDescriptors((await (() => ({
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
}))(importOriginal)) as object)].reduce((target, descriptors) => Object.defineProperties(target, descriptors), { ...(await importOriginal<Record<string, unknown>>()) }))

import { PLUGIN_CRON_TIMEOUT_MS, runPluginCrons } from '@/features/plugins/server/crons'
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

  it('cron que nunca resolve é encerrado por tempo como erro, libera o lease e não trava o seguinte', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const next = vi.fn()
      pluginRegistries().crons.add(cronKey('stable', 'relogio', 'pendurado'), owner('stable'), { name: 'pendurado', schedule: { type: 'interval', minutes: 5 }, run: () => new Promise<void>(() => undefined), scheduled: true })
      pluginRegistries().crons.add(cronKey('stable', 'relogio', 'seguinte'), owner('stable'), { name: 'seguinte', schedule: { type: 'interval', minutes: 5 }, run: next, scheduled: true })
      const start = new Date('2026-11-19T12:00:00Z')
      await runPluginCrons(start)
      const tick = runPluginCrons(new Date(start.getTime() + 6 * 60_000))
      await vi.advanceTimersByTimeAsync(PLUGIN_CRON_TIMEOUT_MS + 1)
      expect(await tick).toEqual(['plugin:relogio:seguinte'])
      expect(next).toHaveBeenCalledTimes(1)
      expect(holder.jobs.docs.find((doc) => doc.jobId === 'plugin:relogio:pendurado')).toMatchObject({ lastStatus: 'error', lastError: expect.stringContaining('Tempo esgotado'), lockedUntil: null, lockedBy: null })
    } finally {
      vi.useRealTimers()
    }
  })

  it('o fim de uma execução não libera o lease de uma reivindicação posterior', async () => {
    let finish: () => void = () => undefined
    pluginRegistries().crons.add(cronKey('stable', 'relogio', 'lento'), owner('stable'), { name: 'lento', schedule: { type: 'interval', minutes: 5 }, run: () => new Promise<void>((resolve) => (finish = resolve)), scheduled: true })
    const start = new Date('2026-11-19T12:00:00Z')
    await runPluginCrons(start)
    const first = runPluginCrons(new Date(start.getTime() + 6 * 60_000))
    await vi.waitFor(() => expect(holder.jobs.docs[0]!.lockedBy).toBe('inst-1'))
    // Outra reivindicação (lease vencido) troca o lockedUntil enquanto a primeira ainda roda.
    const otherLease = new Date(start.getTime() + 60 * 60_000)
    await holder.jobs.updateOne({ jobId: 'plugin:relogio:lento' }, { $set: { lockedUntil: otherLease } })
    finish()
    await first
    expect(holder.jobs.docs[0]).toMatchObject({ lockedBy: 'inst-1', lockedUntil: otherLease })
  })
})
