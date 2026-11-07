import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guarda de prévia do agendador (OPE-147): a prévia do Opex usa o banco do Opex original, então com
 * `OPEX_PREVIEW=1` o `startCronScheduler` não liga o tick periódico (só o disparo manual roda nela).
 * Sem a marcação (`pnpm dev` ou produção) o agendador liga como sempre.
 */

const logs = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: logs }))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/CronJobState', () => ({ CronJobState: { updateOne: vi.fn(), findOneAndUpdate: vi.fn() } }))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: vi.fn(async () => ({ schedulerEnabled: true, jobs: [] })), getInternalBaseUrl: async () => 'http://127.0.0.1:3100' }))

async function start() {
  vi.resetModules()
  const { startCronScheduler } = await import('@/features/integrations/scheduler/cron-scheduler')
  startCronScheduler()
}

beforeEach(() => {
  vi.useFakeTimers()
  logs.info.mockClear()
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('startCronScheduler', () => {
  it('com a marcação de prévia não cria timer e registra no log o agendador desligado', async () => {
    vi.stubEnv('OPEX_PREVIEW', '1')
    await start()
    expect(vi.getTimerCount()).toBe(0)
    expect(logs.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Agendador automático desligado: instância de prévia'))
  })

  it('sem a marcação liga o tick de minuto e o tick rápido', async () => {
    vi.stubEnv('OPEX_PREVIEW', '')
    await start()
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(2)
    expect(logs.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Agendador interno iniciado'))
  })
})
