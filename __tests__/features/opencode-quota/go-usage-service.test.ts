import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ active: vi.fn(), byId: vi.fn(), pool: vi.fn(), allowances: vi.fn(), publish: vi.fn(), fetch: vi.fn() }))

vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/api-keys', () => ({ getPrimaryAiProviderKey: mocks.active, getAiProviderKeyById: mocks.byId, getAiProviderKeyPool: mocks.pool }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/opencode-go', () => ({ opencodeGoAllowances: mocks.allowances }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/lib/integrations/server", () => ({
  integrationDebug: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), request: vi.fn(), response: vi.fn() }),
  debugFetch: (_debug: unknown, _label: string, url: string, init: RequestInit) => mocks.fetch(url, init),
}))

import { getOpencodeGoUsage, refreshOpencodeGoUsage, resetGoUsageCacheForTests, runOpencodeGoUsageRefresh } from "@nandobfer/integracoes/modules/integrations/ia/features/opencode-quota/server/go-usage"
import { resetGoSeriesCacheForTests } from "@nandobfer/integracoes/modules/integrations/ia/features/opencode-quota/server/go-series"

const NOW = Date.parse('2026-11-16T19:57:00.000Z')
const KEY = { id: 'key_aaaaaaaaaaaaaaaaaa', name: 'Chave principal', apiKey: 'oc_sk_secret' }
const KEY2 = { id: 'key_bbbbbbbbbbbbbbbbbb', name: 'Trabalho', apiKey: 'oc_sk_other' }

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
/** Respostas da segunda chave (OPE-180), pelo `Authorization`: status próprio, dias e gasto que falham. */
let otherStatus: unknown = null
const otherFailingDays = new Set<string>()
let otherCostFails = false

function route(url: string, init?: RequestInit) {
  const other = (init?.headers as Record<string, string> | undefined)?.Authorization === `Bearer ${KEY2.apiKey}`
  if (url.endsWith('/go/status')) {
    if (other && otherStatus !== null) return typeof otherStatus === 'function' ? (otherStatus as () => unknown)() : json(otherStatus)
    return statusResponse ? statusResponse(url) : json(statusBody)
  }
  const parsed = new URL(url)
  if (parsed.pathname.endsWith('/usage/models')) {
    const day = parsed.searchParams.get('from')!
    if (failingDays.has(day) || (other && otherFailingDays.has(day))) return text('{"_tag":"Boom"}', 500)
    const page = Number(parsed.searchParams.get('page'))
    // Dois modelos em páginas diferentes: o cliente segue `pageInfo.pageCount`.
    if (page === 1) return json({ items: [{ model: 'deepseek-v4.1-flash', totalCostMicroCents: '200000000' }], pageInfo: { page: 1, pageSize: 10, total: 2, pageCount: 2 } })
    return json({ items: [{ model: 'glm-5.3', totalCostMicroCents: '15000000' }], pageInfo: { page: 2, pageSize: 10, total: 2, pageCount: 2 } })
  }
  if (parsed.pathname.endsWith('/usage/cost-by-day') && other && otherCostFails) return text('{"_tag":"Boom"}', 500)
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
  otherStatus = null
  otherFailingDays.clear()
  otherCostFails = false
  mocks.active.mockResolvedValue(KEY)
  // Sem segunda chave, o grupo em uso é só a principal (como antes da OPE-180).
  mocks.pool.mockImplementation(async () => {
    const key = await mocks.active()
    return key ? [key] : []
  })
  mocks.byId.mockResolvedValue(null)
  mocks.allowances.mockResolvedValue(new Map([['deepseek-v4.1-flash', 100], ['glm-5.3', 15]]))
  mocks.publish.mockResolvedValue(undefined)
  mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => route(url, init))
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
    expect(dto.chart!.forecastEnd).toMatchObject({ t: Date.parse('2026-12-05T12:15:35.000Z') })
    expect(dto.chart!.crossing).toMatchObject({ value: 100 })
    expect(dto.chart!.points.at(-1)!.date).toBe('2026-12-05')
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes('from=2026-11-17'))).toBe(true)
  })

  it('padrão "Último mês" mostra só o ciclo atual: consulta só os dias dele e começa em 0% (regressão do 97%)', async () => {
    const dto = await getOpencodeGoUsage({ from: '2026-10-16T03:00:00.000Z', to: '2026-11-17T02:59:59.999Z' })
    const days = mocks.fetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/usage/models')).map((url) => new URL(url).searchParams.get('from'))
    expect(days.every((day) => day! >= '2026-11-05')).toBe(true)
    expect(dto.chart!.cycle).toMatchObject({ startsAt: '2026-11-05T12:15:35.000Z', current: true })
    expect(dto.chart!.points[0]!.usage).toBe(0)
    expect(dto.chart!.today!.percent).toBe(43.9)
    expect(dto.chart!.crossing!.value).toBe(100)
    expect(Math.max(...dto.chart!.points.map((point) => point.usage ?? 0))).toBe(43.9)
  })

  it('filtro que termina num ciclo passado mostra aquele ciclo, sem previsão', async () => {
    const dto = await getOpencodeGoUsage({ from: '2026-10-10T03:00:00.000Z', to: '2026-10-21T02:59:59.999Z' })
    expect(dto.chart!.cycle).toEqual({ startsAt: '2026-10-05T12:15:35.000Z', endsAt: '2026-11-05T12:15:35.000Z', current: false })
    expect(dto.chart!.forecastEnd).toBeNull()
    expect(dto.chart!.today).toBeNull()
    expect(dto.chart!.points.at(-1)!.t).toBe(Date.parse('2026-11-05T12:15:35.000Z'))
    // O cabeçalho continua no ciclo atual.
    expect(dto.monthPercent).toBe(43.9)
  })

  it('segue a série quando um dia falha e conta o dia como sem dados', async () => {
    failingDays.add('2026-11-10')
    const dto = await getOpencodeGoUsage(query)
    expect(dto.state).toBe('ok')
    expect(dto.chart!.points.find((point) => point.date === '2026-11-10')!.usage).toBeNull()
    expect(dto.chart!.missingDays).toBe(1)
  })

  it('dia que falhou não é reconsultado antes de 90 s (sem rajada repetida a cada leitura)', async () => {
    failingDays.add('2026-11-10')
    const callsFor = (day: string) => mocks.fetch.mock.calls.filter(([url]) => String(url).includes(`from=${day}&`) && String(url).endsWith("page=1")).length
    await getOpencodeGoUsage(query)
    expect(callsFor('2026-11-10')).toBe(1)

    vi.setSystemTime(NOW + 60_000)
    const again = await getOpencodeGoUsage(query)
    expect(callsFor('2026-11-10')).toBe(1)
    expect(again.chart!.missingDays).toBe(1)

    failingDays.clear()
    vi.setSystemTime(NOW + 91_000)
    const recovered = await getOpencodeGoUsage(query)
    expect(callsFor('2026-11-10')).toBe(2)
    expect(recovered.chart!.points.find((point) => point.date === '2026-11-10')!.usage).not.toBeNull()
  })

  it('catálogo que não responde vira "gráfico indisponível" no prazo, sem prender os medidores', async () => {
    // O prazo é o AbortSignal.timeout(GO_REQUEST_TIMEOUT_MS): aqui ele "vence" na hora, sem esperar 15 s.
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const deadline = new AbortController()
      if (ms === 15_000) queueMicrotask(() => deadline.abort())
      return deadline.signal
    })
    let received: AbortSignal | undefined
    mocks.allowances.mockImplementationOnce((_product: string, options: { signal?: AbortSignal }) => {
      received = options.signal
      return new Promise((_, reject) => {
        if (options.signal?.aborted) reject(new Error('aborted'))
        options.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })
    const dto = await getOpencodeGoUsage(query)
    timeout.mockRestore()
    expect(received?.aborted).toBe(true)
    expect(dto.state).toBe('ok')
    expect(dto.monthPercent).toBe(43.9)
    expect(dto.chart).toBeNull()
    expect(dto.chartMessage).toMatch(/catálogo/)
  })

  it('o catálogo é lido com a chave do filtro (não exige chave em uso)', async () => {
    await getOpencodeGoUsage(query)
    expect(mocks.allowances).toHaveBeenCalledWith('go', expect.objectContaining({ apiKey: 'oc_sk_secret' }))
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

/**
 * Status de outra assinatura: uso do mês e ciclo próprios. Assinaturas distintas nunca começam no mesmo instante:
 * por padrão, a outra começa 1 s depois (mesmo plano e mesmos limites).
 */
const otherSubscription = (monthUsed: string, cycle = { startsAt: '2026-11-05T12:15:36.000Z', endsAt: '2026-12-05T12:15:36.000Z' }) => {
  const base = status(monthUsed)
  return { ...base, access: { ...base.access, ...cycle, meters: { ...base.access.meters, month: { ...base.access.meters.month, resetsAt: cycle.endsAt } } } }
}

describe('"Todas as chaves" soma as assinaturas das chaves em uso (OPE-180)', () => {
  beforeEach(() => {
    mocks.pool.mockResolvedValue([KEY, KEY2])
  })

  it('soma uso e limite num gráfico único com um teto de 100% (regressão: antes só a chave principal)', async () => {
    otherStatus = otherSubscription('1365747502')
    const dto = await getOpencodeGoUsage(query)
    expect(dto.state).toBe('ok')
    // (2.634.252.498 + 1.365.747.502) / (6.000.000.000 × 2) = 33,33…%
    expect(dto.monthPercent).toBe(33.3)
    expect(dto.meters.find((meter) => meter.id === 'month')!.percent).toBe(33.3)
    expect(dto.chart!.today!.percent).toBe(33.33)
    // Mesmo % por dia nas duas (mesma cota): a média ponderada continua 3 pp — não 6.
    expect(dto.chart!.points.find((point) => point.date === '2026-11-10')!.dayPercent).toBe(3)
    expect(dto.chart!.crossing).toBeNull()
    expect(dto.keyName).toBeNull()
    expect(dto.scope).toEqual({
      mode: 'all',
      keys: [
        { name: 'Chave principal', subscription: 0 },
        { name: 'Trabalho', subscription: 1 },
      ],
      subscriptions: 2,
      failed: [],
      cycleKeyName: 'Chave principal',
      cyclesDiffer: true,
    })
    const fraction = (Date.parse('2026-11-05T12:15:35Z') - Date.parse('2026-11-05T00:00:00Z')) / 86_400_000
    expect(dto.realCostUsd).toBeCloseTo(2 * (Math.round((4 * (1 - fraction) + 1) * 100) / 100), 2)
    expect(dto.realCostPartial).toBe(false)
    expect(JSON.stringify(dto)).not.toContain('oc_sk_')
  })

  it('chaves com status idêntico contam uma vez e a série não é somada em dobro', async () => {
    otherStatus = status()
    const dto = await getOpencodeGoUsage(query)
    expect(dto.monthPercent).toBe(43.9)
    expect(dto.scope).toMatchObject({ subscriptions: 1, keys: [{ name: 'Chave principal', subscription: 0 }, { name: 'Trabalho', subscription: 0 }] })
    const modelCalls = (mocks.fetch.mock.calls as [string, RequestInit][]).filter(([url]) => url.includes('/usage/models'))
    expect(modelCalls.every(([, init]) => (init.headers as Record<string, string>).Authorization === `Bearer ${KEY.apiKey}`)).toBe(true)
    const fraction = (Date.parse('2026-11-05T12:15:35Z') - Date.parse('2026-11-05T00:00:00Z')) / 86_400_000
    expect(dto.realCostUsd).toBeCloseTo(Math.round((4 * (1 - fraction) + 1) * 100) / 100, 2)
  })

  it('chaves do mesmo workspace lidas em instantes diferentes (uso mudou no meio) continuam uma assinatura só', async () => {
    mocks.pool.mockResolvedValue([KEY])
    await getOpencodeGoUsage(query)
    // 40 s depois: a principal ainda vem da memória (< 1 min); a segunda chave lê o uso já maior.
    vi.setSystemTime(NOW + 40_000)
    mocks.pool.mockResolvedValue([KEY, KEY2])
    otherStatus = status('2700000000')
    const dto = await getOpencodeGoUsage(query)
    expect(dto.scope).toMatchObject({ subscriptions: 1, keys: [{ name: 'Chave principal', subscription: 0 }, { name: 'Trabalho', subscription: 0 }] })
    // Limite não dobra e vale a leitura mais recente (2,7 de 6 bilhões = 45%).
    expect(dto.monthPercent).toBe(45)
    const fraction = (Date.parse('2026-11-05T12:15:35Z') - Date.parse('2026-11-05T00:00:00Z')) / 86_400_000
    expect(dto.realCostUsd).toBeCloseTo(Math.round((4 * (1 - fraction) + 1) * 100) / 100, 2)
  })

  it('ciclos diferentes: a ponta "agora" continua o acumulado diário do ciclo de referência (sem salto)', async () => {
    // Medidores coerentes com a série do mock (3 pp por dia em cada assinatura).
    const refStart = Date.parse('2026-10-28T08:00:00.000Z')
    const keyStart = Date.parse('2026-11-05T12:15:35.000Z')
    const used = (from: number) => String(Math.round((3 * (NOW - from)) / 86_400_000 / 100 * 6_000_000_000))
    statusBody = status(used(keyStart))
    otherStatus = otherSubscription(used(refStart), { startsAt: '2026-10-28T08:00:00.000Z', endsAt: '2026-11-28T08:00:00.000Z' })
    const dto = await getOpencodeGoUsage(query)
    const chart = dto.chart!
    const lastDay = chart.points.filter((point) => point.date < '2026-11-16' && point.usage !== null).at(-1)!
    const todayShare = (3 * (NOW - Date.parse('2026-11-16T00:00:00.000Z'))) / 86_400_000
    // Ponta = acumulado até ontem + a fração de hoje, nos dois ciclos (o de referência vem desde 28/10).
    expect(lastDay.usage).toBeCloseTo((3 * (Date.parse('2026-11-16T00:00:00.000Z') - refStart)) / 86_400_000, 1)
    expect(chart.today!.percent - lastDay.usage!).toBeCloseTo(todayShare, 1)
    expect(dto.monthPercent).toBe(Math.floor(chart.today!.percent * 10 + 1e-9) / 10)
    // Previsão com a mesma taxa do acumulado: 3 pp por dia.
    expect(dto.forecast!.dailyAverage).toBeCloseTo(3, 1)
  })

  it('ciclos diferentes: gráfico, previsão e "Renova em" seguem a renovação mais próxima', async () => {
    otherStatus = otherSubscription('1000000000', { startsAt: '2026-10-28T08:00:00.000Z', endsAt: '2026-11-28T08:00:00.000Z' })
    const dto = await getOpencodeGoUsage(query)
    expect(dto.cycle).toEqual({ startsAt: '2026-10-28T08:00:00.000Z', endsAt: '2026-11-28T08:00:00.000Z' })
    expect(dto.chart!.cycle).toMatchObject({ startsAt: '2026-10-28T08:00:00.000Z', endsAt: '2026-11-28T08:00:00.000Z', current: true })
    expect(dto.chart!.forecastEnd).toMatchObject({ t: Date.parse('2026-11-28T08:00:00.000Z') })
    expect(dto.scope).toMatchObject({ cyclesDiffer: true, cycleKeyName: 'Trabalho' })
    expect(dto.meters.find((meter) => meter.id === 'month')!.resetsAt).toBe('2026-11-28T08:00:00.000Z')
  })

  it('uma chave que falha sai da soma com aviso de cobertura parcial; todas falhando vira erro', async () => {
    otherStatus = () => text('{}', 401)
    const dto = await getOpencodeGoUsage(query)
    expect(dto.state).toBe('ok')
    expect(dto.monthPercent).toBe(43.9)
    expect(dto.keyName).toBe('Chave principal')
    expect(dto.scope!.failed).toEqual([{ name: 'Trabalho', message: expect.stringMatching(/recusou a chave/) }])

    resetGoUsageCacheForTests()
    statusResponse = () => text('{}', 401)
    const failed = await getOpencodeGoUsage(query)
    expect(failed.state).toBe('error')
    expect(failed.message).toMatch(/recusou a chave/)
  })

  it('grupo em uso vazio fica "não configurado"', async () => {
    mocks.pool.mockResolvedValue([])
    expect((await getOpencodeGoUsage(query)).state).toBe('unconfigured')
  })

  it('dia sem dados de uma assinatura conta 0 para ela e marca a cobertura incompleta; gasto que falha vira parcial', async () => {
    otherStatus = otherSubscription('1365747502')
    otherFailingDays.add('2026-11-10')
    otherCostFails = true
    const dto = await getOpencodeGoUsage(query)
    expect(dto.chart!.points.find((point) => point.date === '2026-11-10')!.dayPercent).toBe(1.5)
    expect(dto.chart!.incompleteDays).toBe(1)
    expect(dto.chart!.missingDays).toBe(0)
    const fraction = (Date.parse('2026-11-05T12:15:35Z') - Date.parse('2026-11-05T00:00:00Z')) / 86_400_000
    expect(dto.realCostUsd).toBeCloseTo(Math.round((4 * (1 - fraction) + 1) * 100) / 100, 2)
    expect(dto.realCostPartial).toBe(true)
  })

  it('a leitura publica um único evento mesmo com várias chaves mudando; o Atualizar respeita o intervalo por chave', async () => {
    otherStatus = otherSubscription('1365747502')
    await getOpencodeGoUsage(query)
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    const statusCalls = () => mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith('/go/status')).length
    expect(statusCalls()).toBe(2)
    await refreshOpencodeGoUsage(query)
    expect(statusCalls()).toBe(2)
    vi.setSystemTime(NOW + 31_000)
    await refreshOpencodeGoUsage(query)
    expect(statusCalls()).toBe(4)
    expect(mocks.publish).toHaveBeenCalledTimes(1)
  })

  it('filtro por uma chave continua lendo só aquela assinatura', async () => {
    otherStatus = otherSubscription('1365747502')
    mocks.byId.mockResolvedValueOnce(KEY2)
    const dto = await getOpencodeGoUsage({ ...query, apiKey: KEY2.id })
    expect(dto.keyName).toBe('Trabalho')
    expect(dto.monthPercent).toBe(22.7)
    expect(dto.scope).toMatchObject({ mode: 'key', subscriptions: 1, keys: [{ name: 'Trabalho', subscription: 0 }] })
    expect(mocks.pool).not.toHaveBeenCalled()
  })

  it('a rotina relê todas as chaves em uso e publica uma vez', async () => {
    otherStatus = otherSubscription('1365747502')
    const summary = await runOpencodeGoUsageRefresh()
    expect(summary).toContain('Chave principal: 5h 3% · Semanal 5,6% · Mensal 43,9%')
    expect(summary).toContain('Trabalho: 5h 3% · Semanal 5,6% · Mensal 22,7%')
    expect(mocks.publish).toHaveBeenCalledTimes(1)
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
