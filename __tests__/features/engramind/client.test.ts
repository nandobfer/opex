import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Cliente HTTP do Engramind: Bearer, User-Agent, Idempotency-Key, segredo fora do debug e erros em pt-BR. */

const mocks = vi.hoisted(() => ({
  config: { baseUrl: 'http://engramind:8000', adminToken: 'eng.tk_00000000.segredo' } as Record<string, string | undefined>,
  fetch: vi.fn(),
}))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => mocks.config }))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({}),
  debugFetch: (_debug: unknown, _label: string, url: string, init: RequestInit) => mocks.fetch(url, init),
}))

import { engramindCall } from '@/features/engramind/server/client'
import { DomainError } from '@/lib/api/route'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const error = (status: number, code: string, details: unknown = null, headers?: Record<string, string>) => json(status, { error: { code, message: 'msg', details } }, headers)

describe('engramindCall', () => {
  beforeEach(() => {
    mocks.fetch.mockReset()
    mocks.config = { baseUrl: 'http://engramind:8000', adminToken: 'eng.tk_00000000.segredo' }
  })

  it('GET com Bearer e User-Agent do Opex, sem Idempotency-Key, e a query montada', async () => {
    mocks.fetch.mockResolvedValue(json(200, { channels: [] }))
    await engramindCall('GET', { path: '/v1/channels', query: { include_archived: true, cursor: undefined } })
    const [url, init] = mocks.fetch.mock.calls[0]!
    expect(url).toBe('http://engramind:8000/v1/channels?include_archived=true')
    expect(init.headers.Authorization).toBe('Bearer eng.tk_00000000.segredo')
    expect(init.headers['User-Agent']).toMatch(/^opex\//)
    expect(init.headers['Idempotency-Key']).toBeUndefined()
  })

  it('mutação leva Idempotency-Key (fixa quando informada)', async () => {
    mocks.fetch.mockImplementation(async () => json(200, {}))
    await engramindCall('POST', { path: '/v1/channels', body: { slug: 'eng/x' } })
    expect(mocks.fetch.mock.calls[0]![1].headers['Idempotency-Key']).toMatch(/^opex-/)
    await engramindCall('POST', { path: '/v1/memories/import', body: {} }, { idempotencyKey: 'opex-import-abc' })
    expect(mocks.fetch.mock.calls[1]![1].headers['Idempotency-Key']).toBe('opex-import-abc')
  })

  it('corpo com segredo vai como Blob (o debug só registra corpos em texto)', async () => {
    mocks.fetch.mockResolvedValue(json(200, { key: 'redator.api_key', configured: true }))
    await engramindCall('PUT', { path: '/v1/secrets/redator.api_key', body: { value: 'sk-123' } }, { sensitiveBody: true })
    const body = mocks.fetch.mock.calls[0]![1].body
    expect(typeof body).not.toBe('string')
    expect(await (body as Blob).text()).toBe('{"value":"sk-123"}')
  })

  it('traduz os códigos para pt-BR acionável', async () => {
    mocks.fetch.mockResolvedValueOnce(error(409, 'LAST_ADMIN_TOKEN'))
    await expect(engramindCall('POST', { path: '/v1/tokens/tk_1/revoke', body: {} })).rejects.toMatchObject({ status: 409, code: 'ENGRAMIND_LAST_ADMIN_TOKEN', message: expect.stringContaining('Emita outro token admin antes') })
    mocks.fetch.mockResolvedValueOnce(error(409, 'CATEGORY_IN_USE', { in_use: 3 }))
    await expect(engramindCall('PUT', { path: '/v1/settings', body: {} })).rejects.toMatchObject({ message: expect.stringContaining('(3)') })
    mocks.fetch.mockResolvedValueOnce(error(429, 'RATE_LIMITED', null, { 'Retry-After': '12' }))
    await expect(engramindCall('GET', { path: '/v1/status' })).rejects.toMatchObject({ status: 429, message: expect.stringContaining('12 s') })
    mocks.fetch.mockResolvedValueOnce(error(400, 'PROVIDER_NOT_CONFIGURED', { missing: ['redator.model', 'redator.api_key'] }))
    await expect(engramindCall('POST', { path: '/v1/settings/redator/test', body: {} })).rejects.toMatchObject({ message: expect.stringContaining('redator.model, redator.api_key') })
  })

  it('401 do Engramind não vira 401 do Opex (a sessão do dono continua válida)', async () => {
    mocks.fetch.mockResolvedValueOnce(error(401, 'AUTH_INVALID'))
    const failure = await engramindCall('GET', { path: '/v1/whoami' }).catch((caught: unknown) => caught)
    expect(failure).toBeInstanceOf(DomainError)
    expect(failure).toMatchObject({ status: 409, code: 'ENGRAMIND_AUTH_INVALID', message: expect.stringContaining('Reconfigure o token') })
  })

  it('fora do ar e sem configuração', async () => {
    mocks.fetch.mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))
    await expect(engramindCall('GET', { path: '/v1/status' })).rejects.toMatchObject({ status: 503, code: 'ENGRAMIND_UNREACHABLE', message: expect.stringContaining('ECONNREFUSED') })
    mocks.config = { baseUrl: undefined, adminToken: undefined }
    await expect(engramindCall('GET', { path: '/v1/status' })).rejects.toMatchObject({ code: 'ENGRAMIND_NOT_CONFIGURED' })
  })
})
