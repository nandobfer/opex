import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Integração Gotenberg (OPE-210; adaptador da biblioteca desde a OPE-217): o Opex registra a definição e o teste
 * de conexão da `@nandobfer/integracoes`, que confere o /health e converte um HTML mínimo em PDF.
 */

const mocks = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  health: vi.fn(),
  convert: vi.fn(),
  healthError: null as Error | null,
  convertError: null as Error | null,
}))

vi.mock('@nandobfer/integracoes/modules/server/config', async (original) => ({
  ...(await original<object>()),
  getIntegration: vi.fn(async () => ({ values: mocks.values })),
}))
// Falha por um lançamento comum: o Vitest 5 registra o erro lançado por um `vi.fn` como falha do teste.
vi.mock('@nandobfer/integracoes/modules/integrations/gotenberg/client', () => ({
  GOTENBERG_HEALTH_TIMEOUT_MS: 10_000,
  gotenbergHealth: async () => {
    if (mocks.healthError) throw mocks.healthError
    return mocks.health()
  },
  convertHtml: async (...args: unknown[]) => {
    if (mocks.convertError) throw mocks.convertError
    return mocks.convert(...args)
  },
}))

import { DomainError, integrationSource } from '@nandobfer/integracoes'
import { opexTesters } from '../../helpers/opex-testers'
const INTEGRATION_TESTERS = await opexTesters()
import { getIntegrationDef } from "@/features/integrations/registry/definitions"

const context = () => ({ emit: vi.fn(), signal: new AbortController().signal })

beforeEach(() => {
  mocks.values = { url: 'http://gotenberg:3000', timeoutSeconds: 30, urlTtlMinutes: 15, urlTtlMaxMinutes: 60 }
  mocks.health.mockReset().mockResolvedValue({ status: 'up', chromium: 'up' })
  mocks.convert.mockReset().mockResolvedValue(Buffer.from('%PDF-1.7'))
  mocks.healthError = null
  mocks.convertError = null
})

describe('integração Gotenberg (OPE-210 / OPE-217)', () => {
  it('catálogo: adaptador da biblioteca com URL interna, tempo limite, validade das URLs e nenhum env nem segredo', () => {
    const def = getIntegrationDef('gotenberg')
    expect(integrationSource(def)).toBe('library')
    expect(def.publicFields.map((field) => [field.key, field.defaultValue, field.min, field.max])).toEqual([
      ['url', undefined, undefined, undefined],
      ['timeoutSeconds', 30, 5, 120],
      ['urlTtlMinutes', 15, 1, 1440],
      ['urlTtlMaxMinutes', 60, 1, 10_080],
    ])
    expect(def.publicFields[0]).toMatchObject({ required: true, placeholder: 'http://gotenberg:3000', description: expect.stringContaining('gotenberg-network') })
    expect(def.publicFields.every((field) => !field.env)).toBe(true)
    expect(def.secretFields).toEqual([])
    expect(def.streamsDebugOverPusher).toBe(true)
  })

  it('passa com o Gotenberg e o Chromium no ar e o PDF de teste gerado', async () => {
    await expect(INTEGRATION_TESTERS.gotenberg(context())).resolves.toBe('Gotenberg no ar (Chromium disponível)')
    expect(mocks.convert).toHaveBeenCalledTimes(1)
  })

  it('falha com o Chromium fora do ar', async () => {
    mocks.health.mockResolvedValue({ status: 'down', chromium: 'down' })
    await expect(INTEGRATION_TESTERS.gotenberg(context())).rejects.toThrow('Chromium do Gotenberg está "down"')
  })

  it('falha de rede vira mensagem acionável', async () => {
    mocks.healthError = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    const error = await INTEGRATION_TESTERS.gotenberg(context()).catch((err: Error) => err)
    expect((error as Error).message).toBe('Não foi possível falar com o Gotenberg: ECONNREFUSED')
  })

  it('tempo esgotado na conversão de teste volta como falha legível', async () => {
    mocks.convertError = new DomainError(504, 'O Gotenberg não respondeu em 30 s: tente de novo ou aumente o tempo limite em Integrações › Gotenberg (PDF).', 'GOTENBERG_TIMEOUT')
    await expect(INTEGRATION_TESTERS.gotenberg(context())).rejects.toThrow('O Gotenberg não respondeu em 30 s')
  })

  it('sem URL: falha pedindo a configuração', async () => {
    mocks.values = { timeoutSeconds: 30 }
    await expect(INTEGRATION_TESTERS.gotenberg(context())).rejects.toThrow('Informe a URL interna do Gotenberg')
    expect(mocks.health).not.toHaveBeenCalled()
  })
})
