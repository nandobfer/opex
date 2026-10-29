import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-91: falha passageira no teste periódico é repetida antes de gravar o status vermelho. */

const mocks = vi.hoisted(() => ({ updateOne: vi.fn(async () => undefined) }))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/db/models/IntegrationStatus', () => ({ IntegrationStatus: { updateOne: mocks.updateOne } }))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: vi.fn(async () => ({})) }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn(), step: vi.fn() }) }))
vi.mock('@/lib/pusher/server', () => ({ isPusherServerConfigured: async () => false, getRawPusherServer: vi.fn() }))
vi.mock('@/features/integrations/testers/testers', () => ({ INTEGRATION_TESTERS: {} }))

import { runIntegrationTest } from '@/features/integrations/services/integration-test-runner'

const savedStatuses = () =>
  (mocks.updateOne.mock.calls as unknown as [unknown, { $set: { status?: string } }][]).map(([, update]) => update.$set.status).filter(Boolean)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runIntegrationTest com retries', () => {
  it('falha e depois passa: grava ok, nunca error', async () => {
    const tester = vi.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce('OpenCode 2.1')
    const result = await runIntegrationTest('ai_opencode', { source: 'scheduler', retries: 1, retryDelayMs: 1, testers: { ai_opencode: tester } })
    expect(result.ok).toBe(true)
    expect(tester).toHaveBeenCalledTimes(2)
    expect(savedStatuses()).toEqual(['ok'])
  })

  it('falha nas duas tentativas: grava error com a última mensagem', async () => {
    const tester = vi.fn().mockRejectedValueOnce(new Error('primeira')).mockRejectedValueOnce(new Error('segunda'))
    const result = await runIntegrationTest('ai_opencode', { source: 'scheduler', retries: 1, retryDelayMs: 1, testers: { ai_opencode: tester } })
    expect(result).toMatchObject({ ok: false, message: 'segunda' })
    expect(savedStatuses()).toEqual(['error'])
  })

  it('sem retries (teste manual): uma tentativa só', async () => {
    const tester = vi.fn().mockRejectedValue(new Error('fora'))
    const emit = vi.fn()
    const result = await runIntegrationTest('ai_opencode', { source: 'manual', emit, testers: { ai_opencode: tester } })
    expect(result.ok).toBe(false)
    expect(tester).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith('error', 'fora')
  })
})
