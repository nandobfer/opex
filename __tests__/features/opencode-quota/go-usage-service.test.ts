import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ active: vi.fn(), byId: vi.fn(), allowances: vi.fn(), publish: vi.fn(), fetch: vi.fn() }))

vi.mock('@/lib/ai/api-keys', () => ({ getActiveAiProviderKey: mocks.active, getAiProviderKeyById: mocks.byId }))
vi.mock('@/lib/ai/opencode-go', () => ({ opencodeGoAllowances: mocks.allowances }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), request: vi.fn(), response: vi.fn() }),
  debugFetch: (_debug: unknown, _label: string, url: string, init: RequestInit) => mocks.fetch(url, init),
}))

import { getOpencodeGoUsage, refreshOpencodeGoUsage, resetGoUsageCacheForTests, runOpencodeGoUsageRefresh } from '@/features/opencode-quota/server/go-usage'
import { resetGoSeriesCacheForTests } from '@/features/opencode-quota/server/go-series'

const NOW = Date.parse('2026-11-16T19:57:00.000Z')
const KEY = { id: 'key_aaaaaaaaaaaaaaaaaa', name: 'Chave principal', apiKey: 'oc_sk_secret' }

/** Resposta real do `go/status` (16/11/2026), com os campos de pagamento que precisam ser descartados. */
const status = (monthUsed = '2634252498') => ({
  product: 'go',
  renewalCurrency: 'usd',
  cancelAtPeriodEnd: false,
  resumability: 'renewing',
  subscriberUserId: 'usr_123',
  paymentMethodId: 'pm_456',
  paymentMethodKind: 'card',
  upgradePrice: 'R$ 99',
  teamsUpgradePrice: 'R$ 199',
  nextPeriodPaid: true,
  useBalance: false,
  access: {
    startsAt: '2026-11-05T12:15:35.000Z',
    endsAt: '2026-12-05T12:15:35.000Z',
    meters: {
      fiveHour: { startsAt: '2026-11-16T17:00:00.000Z', resetsAt: '2026-11-16T22:00:00.000Z', limitMicroCents: '1200000000', usedMicroCents: '37061887' },
      week: { startsAt: '2026-11-16T00:00:00.000Z', resetsAt: '2026-11-23T00:00:00.000Z', limitMicroCents: '3000000000', usedMicroCents: '168599483' },
      month: { resetsAt: '2026-12-05T12:15:35.000Z', limitMicroCents: '6000000000', usedMicroCents: monthUsed },
    },
  },
})

const json = (body: unknown, init: { status?: number } = {}) => ({ ok: (init.status ?? 200) < 400, status: init.status ?? 200, json: async () => body, text: async () => JSON.stringify(body) })
const text = (body: string, status: number) => ({ ok: false, status, json: async () => JSON.parse(body), text: async () => body })

let statusBody: unknown = status()
let statusResponse: ((url: string) => unknown) | null = null
const failingDays = new Set<string>()

function route(url: string) {
  if (url.endsWith('/go/status')) return statusResponse ? statusResponse(url) : json(statusBody)
  const parsed = new URL(url)
  if (parsed.pathname.endsWith('/usage/models')) {
    const day = parsed.searchParams.get('from')!
    if (failingDays.has(day)) return text('{"_tag":"Boom"}', 500)
    const page = Number(parsed.searchParams.get('page'))
    // Dois modelos em páginas diferentes: o cliente segue `pageInfo.pageCount`.
    if (page === 1) return json({ items: [{ model: 'deepseek-v4.1-flash', totalCostMicroCents: '200000000' }], pageInfo: { page: 1, pageSize: 10, total: 2, pageCount: 2 } })
    return json({ items: [{ model: 'glm-5.3', totalCostMicroCents: '15000000' }], pageInfo: { page: 2, pageSize: 10, total: 2, pageCount: 2 } })
  }
  if (parsed.pathname.endsWith('/usage/cost-by-day')) return json([{ date: '2026-11-05', totalCostMicroCents: '400000000' }, { date: '2026-11-16', totalCostMicroCents: '100000000' }])
  throw new Error(`URL inesperada ${url}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetGoUsageCacheForTests()
  resetGoSeriesCacheForTests()
  statusBody = status()
  statusResponse = null
  failingDays.clear()
  mocks.active.mockResolvedValue(KEY)
  mocks.byId.mockResolvedValue(null)
  mocks.allowances.mockResolvedValue(new Map([['deepseek-v4.1-flash', 100], ['glm-5.3', 15]]))
  mocks.publish.mockResolvedValue(undefined)
  mocks.fetch.mockImplementation(async (url: string) => route(url))
})

afterEach(() => vi.useRealTimers())

const query = { from: '2026-11-06T03:00:00.000Z', to: '2026-11-17T02:59:59.999Z' }

describe('getOpencodeGoUsage', () => {
  it('lê a assinatura com a chave em uso, User-Agent do Opex e sem dados de pagamento no DTO', async () => {
    const dto = await getOpencodeGoUsage(query)
    expect(dto.state).toBe('ok')
    expect(dto.keyName).toBe('Chave principal')
    expect(dto.monthPercent).toBe(43.9)
    expect(dto.meters.map((meter) => [meter.id, meter.percent])).toEqual([['fiveHour', 3], ['week', 5.6], ['month', 43.9]])
    expect(dto.cycle).toEqual({ startsAt: '2026-11-05T12:15:35.000Z', endsAt: '2026-12-05T12:15:35.000Z' })
    expect(dto.forecast?.projectedPercent).toBeGreaterThan(100)
    expect(dto.forecast?.crossesAt).not.toBeNull()

    const serialized = JSON.stringify(dto)
    for (const field of ['subscriberUserId', 'usr_123', 'paymentMethodId', 'pm_456', 'paymentMethodKind', 'upgradePrice', 'teamsUpgradePrice', 'nextPeriodPaid', 'useBalance', 'oc_sk_secret']) {
      expect(serialized).not.toContain(field)
    }
    for (const [, init] of mocks.fetch.mock.calls as [string, RequestInit][]) {
      const headers = init.headers as Record<string, string>
      expect(headers['User-Agent']).toMatch(/^Opex \(opencode-go/)
      expect(headers.Authorization).toBe('Bearer oc_sk_secret')
    }
  })

  it('monta a série em % por cota de modelo (todas as páginas) e o gasto real pró-rateado', async () => {
    const dto = await getOpencodeGoUsage(query)
    const day = dto.chart!.points.find((point) => point.date === '2026-11-10')!
    // 2 US$ de 100 (2 pp) + 0,15 US$ de 15 (1 pp).
    expect(day.dayPercent).toBe(3)
    expect(dto.chart!.points.find((point) => point.date === '2026-11-16')!.usage).toBe(43.9)
    // 05/11: 4 US$ × (1 − 12:15:35/24 h) + 16/11: 1 US$.
    const fraction = (Date.parse('2026-11-05T12:15:35Z') - Date.parse('2026-11-05T00:00:00Z')) / 86_400_000
    expect(dto.realCostUsd).toBeCloseTo(Math.round((4 * (1 - fraction) + 1) * 100) / 100, 2)
  })

  it('entre 21h e 24h em São Paulo (já amanhã em UTC) o filtro "até hoje" mantém a ponta do medidor e a previsão', async () => {
    // 22:00 de 16/11 em São Paulo = 01:00 UTC de 17/11; o filtro padrão termina no fim do dia 16/11 local.
    const late = Date.parse('2026-11-17T01:00:00.000Z')
    vi.setSystemTime(late)
    const dto = await getOpencodeGoUsage({ from: '2026-11-06T03:00:00.000Z', to: '2026-11-17T02:59:59.999Z' })
    const today = dto.chart!.points.find((point) => point.date === '2026-11-17')!
    expect(today.usage).toBe(43.9)
    expect(today.forecast).toBe(43.9)
    expect(dto.chart!.forecastEnd).toMatchObject({ date: '2026-12-05' })
    expect(dto.chart!.crossing).not.toBeNull()
    expect(dto.chart!.points.at(-1)!.date).toBe('2026-12-05')
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes('from=2026-11-17'))).toBe(true)
  })

  it('filtro que termina antes de agora não ganha o dia UTC seguinte', async () => {
    vi.setSystemTime(Date.parse('2026-11-17T01:00:00.000Z'))
    const dto = await getOpencodeGoUsage({ from: '2026-11-06T03:00:00.000Z', to: '2026-11-15T02:59:59.999Z' })
    expect(dto.chart!.points.at(-1)!.date).toBe('2026-11-14')
    expect(dto.chart!.forecastEnd).toBeNull()
  })

  it('segue a série quando um dia falha e conta o dia como sem dados', async () => {
    failingDays.add('2026-11-10')
    const dto = await getOpencodeGoUsage(query)
    expect(dto.state).toBe('ok')
    expect(dto.chart!.points.find((point) => point.date === '2026-11-10')!.usage).toBeNull()
    expect(dto.chart!.missingDays).toBe(1)
  })

  it('sem catálogo de cotas mostra os medidores e explica o gráfico indisponível', async () => {
    mocks.allowances.mockRejectedValue(new Error('offline'))
    const dto = await getOpencodeGoUsage(query)
    expect(dto.state).toBe('ok')
    expect(dto.chart).toBeNull()
    expect(dto.chartMessage).toMatch(/catálogo/)
  })

  it('com o mês em 100% marca o limite e não prevê', async () => {
    statusBody = status('6000000000')
    const dto = await getOpencodeGoUsage(query)
    expect(dto.limitReached).toBe(true)
    expect(dto.forecast?.projectedPercent).toBeNull()
    expect(dto.chart?.forecastEnd).toBeNull()
  })

  it.each([
    [401, '{}', /recusou a chave/],
    [403, 'error code: 1010', /Cloudflare/],
    [403, '{"_tag":"Forbidden"}', /não tem acesso/],
    [404, 'Not Found', /HTTP 404/],
  ])('falha do status (HTTP %s) vira erro acionável, sem reserva', async (code, body, message) => {
    statusResponse = () => text(body, code)
    const dto = await getOpencodeGoUsage(query)
    expect(dto.state).toBe('error')
    expect(dto.message).toMatch(message)
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes('/zen/'))).toBe(false)
  })

  it('formato não reconhecido vira erro', async () => {
    statusBody = { product: 'go', access: { startsAt: 'x' } }
    const dto = await getOpencodeGoUsage(query)
    expect(dto.state).toBe('error')
    expect(dto.message).toMatch(/formato não reconhecido/)
  })

  it('filtro de chave: id do chaveiro, chave inexistente, sem chave e nenhuma em uso', async () => {
    mocks.byId.mockResolvedValueOnce({ ...KEY, id: 'key_bbbbbbbbbbbbbbbbbb', name: 'Reserva' })
    expect((await getOpencodeGoUsage({ ...query, apiKey: 'key_bbbbbbbbbbbbbbbbbb' })).keyName).toBe('Reserva')
    expect(mocks.byId).toHaveBeenCalledWith('ai_opencode_go', 'key_bbbbbbbbbbbbbbbbbb')

    expect((await getOpencodeGoUsage({ ...query, apiKey: 'key_cccccccccccccccccc' })).state).toBe('no-key')
    expect((await getOpencodeGoUsage({ ...query, apiKey: 'none' })).state).toBe('no-key')
    expect((await getOpencodeGoUsage({ ...query, apiKey: 'removed' })).state).toBe('no-key')

    mocks.active.mockResolvedValue(null)
    expect((await getOpencodeGoUsage(query)).state).toBe('unconfigured')
  })

  it('reaproveita o status e os dias em memória; o Atualizar respeita o intervalo mínimo', async () => {
    await getOpencodeGoUsage(query)
    const statusCalls = () => mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith('/go/status')).length
    const dayCalls = () => mocks.fetch.mock.calls.filter(([url]) => String(url).includes('/usage/models')).length
    const days = dayCalls()
    await getOpencodeGoUsage(query)
    expect(statusCalls()).toBe(1)
    expect(dayCalls()).toBe(days)

    await refreshOpencodeGoUsage(query)
    expect(statusCalls()).toBe(1)

    vi.setSystemTime(NOW + 31_000)
    await refreshOpencodeGoUsage(query)
    expect(statusCalls()).toBe(2)
    // Só o dia de hoje é relido (duas páginas).
    expect(dayCalls()).toBe(days + 2)
  })
})

describe('rotina opencode-go-usage-refresh', () => {
  it('publica só quando os percentuais mudam', async () => {
    expect(await runOpencodeGoUsageRefresh()).toContain('Mensal 43,9%')
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(mocks.publish).toHaveBeenCalledWith('opencode-go-usage-updated', { checkedAt: new Date(NOW).toISOString() })

    vi.setSystemTime(NOW + 5 * 60_000)
    await runOpencodeGoUsageRefresh()
    expect(mocks.publish).toHaveBeenCalledTimes(1)

    statusBody = status('2700000000')
    vi.setSystemTime(NOW + 10 * 60_000)
    await runOpencodeGoUsageRefresh()
    expect(mocks.publish).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(mocks.publish.mock.calls)).not.toContain('paymentMethod')
  })

  it('sem chave em uso não chama a API', async () => {
    mocks.active.mockResolvedValue(null)
    expect(await runOpencodeGoUsageRefresh()).toMatch(/Sem chave/)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
