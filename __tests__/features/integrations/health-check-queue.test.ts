import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Health check periódico: integração ativável (Builder Machine) desativada fica de fora. */

const mocks = vi.hoisted(() => ({
  config: vi.fn(async (id: string): Promise<Record<string, unknown>> => (id === 'builder_machine' ? { active: false } : {})),
  tested: [] as string[],
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("@nandobfer/integracoes/modules/mongoose/core-models", async (importOriginal) => [Object.getOwnPropertyDescriptors((await (() => ({ IntegrationStatus: { updateOne: vi.fn(async () => undefined) } }))(importOriginal)) as object)].reduce((target, descriptors) => Object.defineProperties(target, descriptors), { ...(await importOriginal<Record<string, unknown>>()) }))
vi.mock("@nandobfer/integracoes/modules/server/config", async (importOriginal) => [Object.getOwnPropertyDescriptors((await (() => ({ getIntegrationConfig: mocks.config }))(importOriginal)) as object)].reduce((target, descriptors) => Object.defineProperties(target, descriptors), { ...(await importOriginal<Record<string, unknown>>()) }))
vi.mock("@nandobfer/integracoes/modules/server/debug", async (importOriginal) => [Object.getOwnPropertyDescriptors((await (() => ({ integrationDebug: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }) }))(importOriginal)) as object)].reduce((target, descriptors) => Object.defineProperties(target, descriptors), { ...(await importOriginal<Record<string, unknown>>()) }))
vi.mock('@/lib/pusher/server', () => ({ isPusherServerConfigured: async () => false, getRawPusherServer: vi.fn() }))
vi.mock("@nandobfer/integracoes/modules/integrations/pusher/connection", async (importOriginal) => [Object.getOwnPropertyDescriptors((await (() => ({ isPusherServerConfigured: async () => false, getRawPusherServer: vi.fn() }))(importOriginal)) as object)].reduce((target, descriptors) => Object.defineProperties(target, descriptors), { ...(await importOriginal<Record<string, unknown>>()) }))
/** Testes de conexão simulados (os reais são os dos adaptadores). */
const testers = new Proxy({}, { get: (_target, id: string) => async () => { mocks.tested.push(id); return 'ok' } })

import { runAllIntegrationHealthChecks } from "@nandobfer/integracoes/modules/server/test-runner"

beforeEach(() => {
  mocks.tested.length = 0
})

describe('runAllIntegrationHealthChecks', () => {
  it('pula a Builder Machine desativada e testa as demais', async () => {
    const results = await runAllIntegrationHealthChecks(3, { testers })
    expect(mocks.tested).not.toContain('builder_machine')
    expect(results.builder_machine).toBeUndefined()
    expect(mocks.tested).toContain('pusher')
  })

  it('ativa, entra no teste periódico', async () => {
    mocks.config.mockImplementation(async (id: string) => (id === 'builder_machine' ? { active: true } : {}))
    await runAllIntegrationHealthChecks(3, { testers })
    expect(mocks.tested).toContain('builder_machine')
  })
})
