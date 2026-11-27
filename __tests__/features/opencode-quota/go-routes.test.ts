import { legacyRoute } from '../../helpers/integrations-route'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ get: vi.fn(), refresh: vi.fn() }))

vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/opencode-quota/server/go-usage", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ getOpencodeGoUsage: mocks.get, refreshOpencodeGoUsage: mocks.refresh }))()) as Record<string, unknown>) }))

const { GET } = legacyRoute("opencode", "quota/go")
const { POST } = legacyRoute("opencode", "quota/go/refresh")

const params = { params: Promise.resolve({}) }
const dto = { state: 'unconfigured', message: 'x', checkedAt: '2026-11-16T12:00:00.000Z', keyName: null, scope: null, cycle: null, meters: [], monthPercent: null, limitReached: false, forecast: null, realCostUsd: null, realCostPartial: false, chart: null, chartMessage: null }
const from = '2026-10-16T03:00:00.000Z'
const to = '2026-11-17T02:59:59.999Z'

beforeEach(() => vi.clearAllMocks())

describe('rotas da assinatura OpenCode Go', () => {
  it('GET repassa período e chave do filtro', async () => {
    mocks.get.mockResolvedValue(dto)
    const res = await GET(new NextRequest(`http://localhost/api/opencode/quota/go?from=${from}&to=${to}&apiKey=all`), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: dto })
    expect(mocks.get).toHaveBeenCalledWith({ from, to, apiKey: 'all' })
  })

  it('GET recusa período invertido e chave inválida', async () => {
    expect((await GET(new NextRequest(`http://localhost/api/opencode/quota/go?from=${to}&to=${from}`), params)).status).toBe(400)
    expect((await GET(new NextRequest('http://localhost/api/opencode/quota/go?apiKey=qualquer'), params)).status).toBe(400)
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('POST refresh relê com a mesma query', async () => {
    mocks.refresh.mockResolvedValue(dto)
    const res = await POST(new NextRequest(`http://localhost/api/opencode/quota/go/refresh?from=${from}&to=${to}`, { method: 'POST' }), params)
    expect(res.status).toBe(200)
    expect(mocks.refresh).toHaveBeenCalledWith({ from, to })
  })
})
