import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getIntegrationConfig: vi.fn(),
  updateOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  concludedTags: vi.fn(),
  runDueOpexJobs: vi.fn(async () => [] as string[]),
  opencodeCleanup: vi.fn(async () => ({ scanned: 3, deleted: 2, protected: 1, failed: 0 })),
  agentCleanup: vi.fn(async () => ({ archived: 1, deleted: 0, failed: 0 })),
}))

vi.mock('@/lib/integrations/config', () => ({
  getIntegrationConfig: mocks.getIntegrationConfig,
  getInternalBaseUrl: async () => 'http://127.0.0.1:3868',
  getIntegration: async () => ({ debugMode: false, values: {} }),
}))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/CronJobState', () => ({
  CronJobState: { updateOne: mocks.updateOne, findOneAndUpdate: mocks.findOneAndUpdate },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/ai/server/task-tags', () => ({ runTaskTagsConcludedBackfill: mocks.concludedTags }))
vi.mock('@/features/opex-agent/server/jobs', () => ({ runDueOpexJobs: mocks.runDueOpexJobs }))
vi.mock('@/features/opencode-service/server/session-retention', () => ({ cleanupIdleOpencodeSessions: mocks.opencodeCleanup, describeOpencodeSessionCleanup: () => 'OC ok' }))
vi.mock('@/features/opex-agent/server/session-retention', () => ({ cleanupIdleAgentSessions: mocks.agentCleanup, describeAgentSessionCleanup: () => 'agente ok' }))

import {
  CronJobRunError,
  registerInternalJob,
  rescheduleJobs,
  runJobNow,
  runSchedulerTick,
  tickReference,
} from '@/features/integrations/scheduler/cron-scheduler'
import { DEFAULT_CRON_JOBS, MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID, OPENCODE_SESSIONS_CLEANUP_JOB_ID, OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID, SESSION_CLEANUP_JOB_IDS, TASK_TAGS_CONCLUDED_JOB_ID, type CronJobConfig } from '@/lib/integrations/catalog'

const httpJob: CronJobConfig = {
  id: 'cancel',
  label: 'Cancelar',
  kind: 'http',
  path: '/api/routines/cancel-pending-or-rejected-negotiations',
  schedule: { type: 'daily', time: '17:30' },
  enabled: true,
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  mocks.updateOne.mockResolvedValue({ modifiedCount: 0 })
})

afterEach(() => vi.unstubAllGlobals())

describe('runSchedulerTick (issue #604)', () => {
  it('ignora as tags de concluídas desligadas, mas execução manual usa o escopo salvo', async () => {
    const job = { ...DEFAULT_CRON_JOBS.find((item) => item.id === TASK_TAGS_CONCLUDED_JOB_ID)!, scope: 'all' as const }
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs: [job] })
    expect((await runSchedulerTick()).executed).toEqual([])
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled()
    mocks.findOneAndUpdate.mockResolvedValue({ jobId: job.id })
    mocks.concludedTags.mockResolvedValue('2 tarefa(s) marcada(s)')
    expect(await runJobNow(job.id)).toMatchObject({ ok: true, message: '2 tarefa(s) marcada(s)' })
    expect(mocks.concludedTags).toHaveBeenCalledWith('all')
  })
  it('agendador desligado não reivindica nem executa nada', async () => {
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: false, jobs: [httpJob], cronSecret: 's' })
    const result = await runSchedulerTick()
    expect(result).toEqual({ skipped: 'disabled', executed: [] })
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled()
    expect(mocks.runDueOpexJobs).not.toHaveBeenCalled()
  })

  it('executa a rotina HTTP somente quando vence o lease, com Bearer do cron secret', async () => {
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs: [httpJob], cronSecret: 'segredo' })
    mocks.findOneAndUpdate.mockResolvedValue({ jobId: 'cancel' })
    fetchMock.mockResolvedValue(new Response('{"success":true}', { status: 200 }))

    const now = new Date('2026-09-22T20:30:05.000Z')
    const result = await runSchedulerTick(now)

    expect(result.executed).toEqual(['cancel'])
    expect(mocks.runDueOpexJobs).toHaveBeenCalledWith(now)
    const [claimFilter, claimUpdate] = mocks.findOneAndUpdate.mock.calls[0]
    expect(claimFilter.nextRunAt).toEqual({ $lte: now })
    // Reivindicação já avança o próximo disparo: falha não gera repetição no minuto seguinte.
    expect(claimUpdate.$set.nextRunAt.toISOString()).toBe('2026-09-23T20:30:00.000Z')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:3868/api/routines/cancel-pending-or-rejected-negotiations')
    expect(init.headers.Authorization).toBe('Bearer segredo')
    const finish = mocks.updateOne.mock.calls.at(-1)!
    expect(finish[1].$set.lastStatus).toBe('ok')
  })

  it('outra instância com o lease: não executa', async () => {
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs: [httpJob], cronSecret: 's' })
    mocks.findOneAndUpdate.mockResolvedValue(null)
    const result = await runSchedulerTick()
    expect(result.executed).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rotina desativada é ignorada', async () => {
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs: [{ ...httpJob, enabled: false }], cronSecret: 's' })
    await runSchedulerTick()
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('falha HTTP é registrada como erro, sem derrubar o tick', async () => {
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs: [httpJob], cronSecret: 's' })
    mocks.findOneAndUpdate.mockResolvedValue({ jobId: 'cancel' })
    fetchMock.mockResolvedValue(new Response('erro', { status: 500 }))
    await runSchedulerTick()
    const finish = mocks.updateOne.mock.calls.at(-1)!
    expect(finish[1].$set.lastStatus).toBe('error')
    expect(finish[1].$set.lastError).toMatch(/HTTP 500/)
  })

  it('rotina interna (health check) executa o runner registrado', async () => {
    const runner = vi.fn().mockResolvedValue('Todas as integrações OK')
    registerInternalJob('integrations-health-check', runner)
    mocks.getIntegrationConfig.mockResolvedValue({
      schedulerEnabled: true,
      cronSecret: undefined,
      jobs: [{ id: 'integrations-health-check', label: 'Status', kind: 'internal', schedule: { type: 'interval', minutes: 5 }, enabled: true }],
    })
    mocks.findOneAndUpdate.mockResolvedValue({ jobId: 'integrations-health-check' })
    await runSchedulerTick()
    expect(runner).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('agendamento editado recalcula o nextRunAt pela assinatura, sem upsert', async () => {
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs: [httpJob], cronSecret: 's' })
    mocks.findOneAndUpdate.mockResolvedValue(null)
    await runSchedulerTick(new Date('2026-09-22T12:00:00.000Z'))
    const recalc = mocks.updateOne.mock.calls.find(([filter]) => filter.scheduleSignature)!
    expect(recalc[0]).toEqual({ jobId: 'cancel', scheduleSignature: { $ne: 'daily:17:30' } })
    expect(recalc[1].$set.nextRunAt.toISOString()).toBe('2026-09-22T20:30:00.000Z')
    expect(recalc[2]).toBeUndefined()
  })

  it('regressão: o upsert só cria o estado ($setOnInsert, filtro só por jobId) — nunca um documento por tick', async () => {
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs: [httpJob], cronSecret: 's' })
    mocks.findOneAndUpdate.mockResolvedValue(null)
    await runSchedulerTick(new Date('2026-09-22T12:00:01.000Z'))
    await runSchedulerTick(new Date('2026-09-22T12:01:01.000Z'))

    const upserts = mocks.updateOne.mock.calls.filter(([, , options]) => options?.upsert)
    expect(upserts).toHaveLength(2)
    for (const [filter, update] of upserts) {
      expect(filter).toEqual({ jobId: 'cancel' })
      expect(update.$set).toBeUndefined()
      expect(update.$setOnInsert.scheduleSignature).toBe('daily:17:30')
    }
  })

  it('regressão: edição para 08:51 processada no tick de 08:51:01 executa hoje', async () => {
    const job: CronJobConfig = { ...httpJob, schedule: { type: 'daily', time: '08:51' } }
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs: [job], cronSecret: 's' })
    mocks.findOneAndUpdate.mockResolvedValue(null)
    await runSchedulerTick(new Date('2026-09-23T11:51:01.000Z')) // 08:51:01 em Brasília
    const recalc = mocks.updateOne.mock.calls.find(([filter]) => filter.scheduleSignature)!
    // Vencido já neste tick: a reivindicação (nextRunAt <= agora) o executa.
    expect(recalc[1].$set.nextRunAt.toISOString()).toBe('2026-09-23T11:51:00.000Z')
  })
})

describe('rotinas de limpeza de sessões (OPE-106)', () => {
  it('nascem desligadas, diárias às 05:00 e com 30 dias', () => {
    for (const id of SESSION_CLEANUP_JOB_IDS) {
      expect(DEFAULT_CRON_JOBS.find((job) => job.id === id)).toMatchObject({ kind: 'internal', enabled: false, schedule: { type: 'daily', time: '05:00' }, retentionDays: 30 })
    }
  })

  it('"Executar agora" repassa os dias salvos a cada rotina (padrão 30 quando o campo falta)', async () => {
    const jobs = DEFAULT_CRON_JOBS.filter((job) => SESSION_CLEANUP_JOB_IDS.includes(job.id)).map((job) => (job.id === OPENCODE_SESSIONS_CLEANUP_JOB_ID ? { ...job, retentionDays: 7 } : job.id === MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID ? { ...job, retentionDays: undefined } : { ...job, retentionDays: 12 }))
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs })
    mocks.findOneAndUpdate.mockResolvedValue({ jobId: 'x' })
    expect(await runJobNow(OPENCODE_SESSIONS_CLEANUP_JOB_ID)).toMatchObject({ ok: true, message: 'OC ok' })
    expect(mocks.opencodeCleanup).toHaveBeenCalledWith(7)
    expect(await runJobNow(OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID)).toMatchObject({ ok: true, message: 'agente ok' })
    expect(mocks.agentCleanup).toHaveBeenCalledWith('opex', 12)
    await runJobNow(MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID)
    expect(mocks.agentCleanup).toHaveBeenCalledWith('maddox', 30)
  })
})

describe('runJobNow — "Executar agora" (issue #604)', () => {
  it('executa a rotina salva reivindicando só o lease, sem mexer no nextRunAt', async () => {
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: false, jobs: [{ ...httpJob, enabled: false }], cronSecret: 'segredo' })
    mocks.findOneAndUpdate.mockResolvedValue({ jobId: 'cancel' })
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    const now = new Date('2026-09-23T15:00:00.000Z')
    const result = await runJobNow('cancel', now)

    expect(result.ok).toBe(true)
    expect(result.message).toBe('HTTP 200')
    const [filter, update] = mocks.findOneAndUpdate.mock.calls[0]
    // Sem `nextRunAt` no filtro nem no $set: a próxima execução agendada não muda.
    expect(filter).not.toHaveProperty('nextRunAt')
    expect(update.$set).not.toHaveProperty('nextRunAt')
    expect(update.$set.lockedUntil).toBeInstanceOf(Date)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer segredo')
    const finish = mocks.updateOne.mock.calls.at(-1)!
    expect(finish[1].$set.lastStatus).toBe('ok')
  })

  it('lease ocupado (em execução): 409 e não executa', async () => {
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs: [httpJob], cronSecret: 's' })
    mocks.findOneAndUpdate.mockResolvedValue(null)
    const error = await runJobNow('cancel').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CronJobRunError)
    expect((error as CronJobRunError).status).toBe(409)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rotina não salva: 404', async () => {
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs: [httpJob], cronSecret: 's' })
    const error = await runJobNow('nova-rotina').catch((e: unknown) => e)
    expect((error as CronJobRunError).status).toBe(404)
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('falha da rotina volta ok:false e fica gravada, sem lançar', async () => {
    mocks.getIntegrationConfig.mockResolvedValue({ schedulerEnabled: true, jobs: [httpJob], cronSecret: 's' })
    mocks.findOneAndUpdate.mockResolvedValue({ jobId: 'cancel' })
    fetchMock.mockResolvedValue(new Response('erro', { status: 500 }))
    const result = await runJobNow('cancel')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/HTTP 500/)
    const finish = mocks.updateOne.mock.calls.at(-1)!
    expect(finish[1].$set.lastStatus).toBe('error')
  })
})

describe('tickReference', () => {
  it('volta para 1 ms antes do minuto do tick', () => {
    expect(tickReference(new Date('2026-09-23T11:51:01.500Z')).toISOString()).toBe('2026-09-23T11:50:59.999Z')
  })
})

describe('rescheduleJobs', () => {
  it('recalcula o nextRunAt a partir do instante do salvamento', async () => {
    const job: CronJobConfig = { ...httpJob, schedule: { type: 'daily', time: '08:51' } }
    await rescheduleJobs([job], new Date('2026-09-23T11:50:40.000Z')) // 08:50:40 BRT
    const [filter, update, options] = mocks.updateOne.mock.calls[0]
    expect(filter).toEqual({ jobId: 'cancel' })
    expect(update.$set).toEqual({ scheduleSignature: 'daily:08:51', nextRunAt: new Date('2026-09-23T11:51:00.000Z') })
    expect(options).toEqual({ upsert: true })
    // Não toca no lease: uma execução em andamento termina normalmente.
    expect(update.$set).not.toHaveProperty('lockedUntil')
  })

  it('ignora agendamento inválido', async () => {
    await rescheduleJobs([{ ...httpJob, schedule: { type: 'daily', time: '25:00' } }])
    expect(mocks.updateOne).not.toHaveBeenCalled()
  })
})
