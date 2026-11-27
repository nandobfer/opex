import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ health: vi.fn(), failure: null as Error | null }))
// Falha de rede por um lançamento comum: o Vitest 5 registra o erro lançado por um `vi.fn` como falha do teste.
vi.mock("@/lib/pdf/gotenberg", () => ({ gotenbergHealth: async () => {
  if (mocks.failure) throw mocks.failure
  return mocks.health()
} }))

import { INTEGRATION_TESTERS } from "@/lib/integrations/server"
import { getIntegrationDef } from "@/features/integrations/registry/definitions"

const context = () => ({ emit: vi.fn(), signal: new AbortController().signal })

beforeEach(() => {
  mocks.health.mockReset()
  mocks.failure = null
})

describe('integração Gotenberg (OPE-210)', () => {
  it('catálogo: URL interna e tempo limite, validade das URLs e nenhum env nem segredo', () => {
    const def = getIntegrationDef('gotenberg')
    expect(def.publicFields.map((field) => field.key)).toEqual(['url', 'timeoutSeconds', 'urlTtlMinutes', 'urlTtlMaxMinutes'])
    expect(def.publicFields.find((field) => field.key === 'urlTtlMinutes')?.defaultValue).toBe(15)
    expect(def.publicFields.every((field) => !field.env)).toBe(true)
    expect(def.secretFields).toEqual([])
    expect(def.streamsDebugOverPusher).toBe(true)
  })

  it('passa com o Gotenberg e o Chromium no ar', async () => {
    mocks.health.mockResolvedValue({ status: 'up', chromium: 'up' })
    await expect(INTEGRATION_TESTERS.gotenberg(context())).resolves.toContain('Gotenberg no ar')
  })

  it('falha com o Chromium fora do ar', async () => {
    mocks.health.mockResolvedValue({ status: 'up', chromium: 'down' })
    await expect(INTEGRATION_TESTERS.gotenberg(context())).rejects.toThrow('Chromium do Gotenberg está "down"')
  })

  it('falha de rede vira mensagem acionável', async () => {
    mocks.failure = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    const error = await INTEGRATION_TESTERS.gotenberg(context()).catch((err: Error) => err)
    expect((error as Error).message).toBe('Não foi possível falar com o Gotenberg: ECONNREFUSED')
  })
})
