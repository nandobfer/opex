import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Health check periódico: integração ativável (Builder Machine) desativada fica de fora. */

const mocks = vi.hoisted(() => ({
  config: vi.fn(async (id: string): Promise<Record<string, unknown>> => (id === 'builder_machine' ? { active: false } : {})),
  tested: [] as string[],
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/db/models/IntegrationStatus', () => ({ IntegrationStatus: { updateOne: vi.fn(async () => undefined) } }))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: mocks.config }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }) }))
vi.mock('@/lib/pusher/server', () => ({ isPusherServerConfigured: async () => false, getRawPusherServer: vi.fn() }))
vi.mock('@/features/integrations/testers/testers', () => ({
  INTEGRATION_TESTERS: new Proxy({}, { get: (_target, id: string) => async () => { mocks.tested.push(id); return 'ok' } }),
}))

import { runAllIntegrationHealthChecks } from '@/features/integrations/services/integration-test-runner'

beforeEach(() => {
  mocks.tested.length = 0
})

describe('runAllIntegrationHealthChecks', () => {
  it('pula a Builder Machine desativada e testa as demais', async () => {
    const results = await runAllIntegrationHealthChecks()
    expect(mocks.tested).not.toContain('builder_machine')
    expect(results.builder_machine).toBeUndefined()
    expect(mocks.tested).toContain('pusher')
  })

  it('ativa, entra no teste periódico', async () => {
    mocks.config.mockImplementation(async (id: string) => (id === 'builder_machine' ? { active: true } : {}))
    await runAllIntegrationHealthChecks()
    expect(mocks.tested).toContain('builder_machine')
  })
})
