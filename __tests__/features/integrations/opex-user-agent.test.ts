import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O registro do Opex (`registry/definitions.ts`) configura a identidade do app na camada de IA da
 * biblioteca: as chamadas ao OpenCode Go e ao Command Code saem com o `User-Agent` do Opex (o mesmo de
 * antes da biblioteca), nunca com o neutro `integracoes (...)`.
 */

vi.mock('@nandobfer/integracoes/modules/server/debug', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  integrationDebug: () => new Proxy({}, { get: () => vi.fn() }),
  debugFetch: (_debug: unknown, _label: string, url: string, init: RequestInit) => fetch(url, init),
}))

const OPEX_GO = 'Opex (opencode-go; +https://github.com/nandobfer/opex)'
const OPEX_CC = 'Opex (command-code; +https://github.com/nandobfer/opex)'

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 500 }))

beforeEach(async () => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  // O módulo do registro é o que configura a camada de IA (como em todo processo do Opex).
  await import('@/features/integrations/registry/definitions')
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const sentUserAgent = () => new Headers(fetchMock.mock.calls[0]![1]!.headers).get('user-agent')

describe('User-Agent do Opex nos provedores de IA', () => {
  it('os geradores devolvem a identidade do Opex', async () => {
    const { opencodeGoUserAgent, commandCodeUserAgent } = await import('@nandobfer/integracoes/modules/integrations/ia/ai/endpoints')
    expect(opencodeGoUserAgent()).toBe(OPEX_GO)
    expect(commandCodeUserAgent()).toBe(OPEX_CC)
  })

  it('a chamada ao Console do OpenCode Go leva o User-Agent do Opex', async () => {
    const { fetchGoStatus } = await import('@nandobfer/integracoes/modules/integrations/ia/features/opencode-quota/server/go-api')
    await fetchGoStatus('oc_sk_teste').catch(() => undefined)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentUserAgent()).toBe(OPEX_GO)
  })

  it('a chamada à API do Command Code leva o User-Agent do Opex', async () => {
    const { fetchCcWhoami } = await import('@nandobfer/integracoes/modules/integrations/ia/features/command-code-usage/server/api')
    await fetchCcWhoami('cc_teste').catch(() => undefined)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentUserAgent()).toBe(OPEX_CC)
  })
})
