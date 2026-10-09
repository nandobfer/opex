import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  updateOne: vi.fn(async () => ({})),
  trigger: vi.fn(async () => ({ status: 200 })),
  configured: vi.fn(async () => true),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(async () => undefined) }))
vi.mock('@/lib/db/models/IntegrationStatus', () => ({ IntegrationStatus: { updateOne: mocks.updateOne } }))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => new Proxy({}, { get: () => vi.fn() }),
}))
vi.mock('@/lib/pusher/server', () => ({
  isPusherServerConfigured: mocks.configured,
  getRawPusherServer: vi.fn(async () => ({ trigger: mocks.trigger })),
}))
vi.mock('@/features/integrations/testers/testers', () => ({ INTEGRATION_TESTERS: {} }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { runIntegrationTest } from '@/features/integrations/services/integration-test-runner'
import { RUNNING_STALE_MS, toHealth } from '@/features/integrations/services/integration-service'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.configured.mockResolvedValue(true)
})

describe('runIntegrationTest — status em tempo real (issue #604)', () => {
  it('publica início (checking) e fim com o status gravado, no canal privado da integração', async () => {
    await runIntegrationTest('crons', { source: 'manual', testers: { crons: async () => 'Crons ok' } })

    expect(mocks.trigger).toHaveBeenCalledTimes(2)
    expect(mocks.trigger.mock.calls[0]).toEqual(['private-integration-crons', 'status-updated', { id: 'crons', checking: true }])
    const [channel, event, payload] = mocks.trigger.mock.calls[1] as unknown as [string, string, { checking: boolean; health: Record<string, unknown> }]
    expect(channel).toBe('private-integration-crons')
    expect(event).toBe('status-updated')
    expect(payload.checking).toBe(false)
    expect(payload.health).toMatchObject({ status: 'ok', message: 'Crons ok', source: 'manual', checking: false })

    // Marca e desmarca o "em andamento" no Mongo (visível também para quem usa polling).
    const sets = mocks.updateOne.mock.calls.map((call) => (call as unknown as [unknown, { $set: Record<string, unknown> }])[1].$set)
    expect(sets[0].runningSince).toBeInstanceOf(Date)
    expect(sets[1]).toMatchObject({ status: 'ok', runningSince: null })
  })

  it('teste que passa com restrição (warnResult) grava e publica status amarelo', async () => {
    const result = await runIntegrationTest('crons', { source: 'scheduler', testers: { crons: async () => ({ status: 'warn', message: 'Fonte em manutenção' }) } })

    expect(result).toMatchObject({ ok: true, warn: true, message: 'Fonte em manutenção' })
    const sets = mocks.updateOne.mock.calls.map((call) => (call as unknown as [unknown, { $set: Record<string, unknown> }])[1].$set)
    expect(sets[1]).toMatchObject({ status: 'warn', message: 'Fonte em manutenção' })
    const payload = (mocks.trigger.mock.calls[1] as unknown as [string, string, { health: Record<string, unknown> }])[2]
    expect(payload.health).toMatchObject({ status: 'warn' })
  })

  it('falha do teste publica status de erro', async () => {
    await runIntegrationTest('crons', {
      source: 'scheduler',
      testers: { crons: async () => { throw new Error('ECONNREFUSED') } },
    })
    const payload = mocks.trigger.mock.calls[1][2] as unknown as { health: Record<string, unknown> }
    expect(payload.health).toMatchObject({ status: 'error', message: 'ECONNREFUSED', source: 'scheduler' })
  })

  it('Pusher sem configuração ou com falha não quebra o teste', async () => {
    mocks.configured.mockResolvedValueOnce(false)
    mocks.trigger.mockRejectedValueOnce(new Error('pusher fora'))
    const result = await runIntegrationTest('crons', { source: 'manual', testers: { crons: async () => 'ok' } })
    expect(result.ok).toBe(true)
  })
})

describe('toHealth', () => {
  const base = { status: 'ok' as const, checkedAt: new Date('2026-09-22T12:00:00Z'), source: 'manual' as const }

  it('marca checking enquanto o teste está dentro do limite', () => {
    const now = Date.now()
    expect(toHealth({ ...base, runningSince: new Date(now - 5_000) }, now).checking).toBe(true)
  })

  it('ignora marcação velha (instância caiu no meio do teste)', () => {
    const now = Date.now()
    expect(toHealth({ ...base, runningSince: new Date(now - RUNNING_STALE_MS - 1) }, now).checking).toBe(false)
  })

  it('documento criado só pela marcação de início fica "unknown" girando', () => {
    const now = Date.now()
    const health = toHealth({ source: 'manual', runningSince: new Date(now) } as never, now)
    expect(health).toMatchObject({ status: 'unknown', checking: true })
  })
})
