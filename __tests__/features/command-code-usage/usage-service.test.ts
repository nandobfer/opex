import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-190: assinatura Command Code lida da API da CLI (`/alpha/*`): estados, soma por conta, série e cache. */

const mocks = vi.hoisted(() => ({ primary: vi.fn(), byId: vi.fn(), pool: vi.fn(), publish: vi.fn(), fetch: vi.fn(), warn: vi.fn() }))

vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/api-keys', () => ({ getPrimaryAiProviderKey: mocks.primary, getAiProviderKeyById: mocks.byId, getAiProviderKeyPool: mocks.pool }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/lib/logger", () => ({ loggerFor: () => ({ warn: mocks.warn, info: vi.fn(), error: vi.fn() }) }))
vi.mock("@/lib/integrations/server", () => ({
  integrationDebug: () => ({}),
  debugFetch: (_debug: unknown, _label: string, url: string, init: RequestInit) => mocks.fetch(url, init),
}))

import { getCommandCodeUsage, refreshCommandCodeUsage, resetCcUsageCacheForTests, runCommandCodeUsageRefresh } from "@nandobfer/integracoes/modules/integrations/ia/features/command-code-usage/server/usage"
import { resetCcSeriesCacheForTests } from "@nandobfer/integracoes/modules/integrations/ia/features/command-code-usage/server/series"

const NOW = Date.parse('2026-11-07T12:00:00.000Z')
const START = '2026-11-05T12:00:00.000Z'
const END = '2026-12-05T12:00:00.000Z'
const KEY = { id: 'key_aaaaaaaaaaaaaaaaaa', name: 'Pessoal', apiKey: 'user_secret_a' }
const KEY2 = { id: 'key_bbbbbbbbbbbbbbbbbb', name: 'Trabalho', apiKey: 'user_secret_b' }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

interface Account {
  user: string
  credits: unknown
  /** `since` (ISO) → totalMonthlyCredits. */
  since: Record<string, number>
  cost: number
  /** Ciclo próprio da conta (padrão: START → END). */
  start?: string
  end?: string
}

const defaultAccount = (): Account => ({
  user: 'u1',
  credits: { credits: { monthlyCredits: 60, purchasedCredits: 2, freeCredits: 0.5, belowThreshold: false, creditThreshold: 5 }, windowLimits: { limited: true, exceeded: false, fiveHour: { used: 7, cap: 14, exceeded: false, resetAt: '2026-11-07T15:00:00Z' }, weekly: { used: 10, cap: 35, exceeded: false, resetAt: 1763049600000 } } },
  since: { [START]: 10, '2026-11-06T00:00:00.000Z': 8, '2026-11-07T00:00:00.000Z': 3 },
  cost: 12.5,
})

let accounts: Record<string, Account> = {}
let override: ((path: string, key: string) => Response | null) | null = null

function route(url: string, init?: RequestInit) {
  const auth = (init?.headers as Record<string, string>).Authorization.replace('Bearer ', '')
  const parsed = new URL(url)
  const path = parsed.pathname.replace('/alpha', '')
  const custom = override?.(path, auth)
  if (custom) return custom
  const account = accounts[auth]!
  if (path === '/whoami') return json({ success: true, user: { id: account.user, name: 'Fulano', email: 'fulano@exemplo.com', userName: 'fulano' }, org: null })
  if (path === '/billing/credits') return json(account.credits)
  if (path === '/billing/subscriptions') return json({ data: { status: 'active', planId: 'individual-goat', currentPeriodStart: account.start ?? START, currentPeriodEnd: account.end ?? END, cancelAtPeriodEnd: false, quantity: 1, pendingPhase: null, orgId: null } })
  if (path === '/usage/summary') {
    const since = parsed.searchParams.get('since')!
    const value = account.since[since]
    if (value === undefined) return json({ error: 'x' }, 500)
    return json({ totalCount: 5, totalCost: since === (account.start ?? START) ? account.cost : 1, totalMonthlyCredits: value, totalTokens: 100, periodBasis: 'billing-period' })
  }
  throw new Error(`URL inesperada ${url}`)
}

const summaryCalls = () => mocks.fetch.mock.calls.filter(([url]) => String(url).includes('/usage/summary')).length
const whoamiCalls = () => mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith('/whoami')).length

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetCcUsageCacheForTests()
  resetCcSeriesCacheForTests()
  accounts = { [KEY.apiKey]: defaultAccount() }
  override = null
  mocks.pool.mockResolvedValue([KEY])
  mocks.primary.mockResolvedValue(KEY)
  mocks.byId.mockImplementation(async (_id: string, keyId: string) => [KEY, KEY2].find((key) => key.id === keyId) ?? null)
  mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => route(url, init))
  mocks.publish.mockResolvedValue(undefined)
})

describe('getCommandCodeUsage', () => {
  it('janelas, mensal derivado (usado ÷ usado + restante), ciclo, valor de uso, créditos extras e gráfico pelas diferenças dos since', async () => {
    const dto = await getCommandCodeUsage({})
    expect(dto.state).toBe('ok')
    expect(dto.planId).toBe('individual-goat')
    expect(dto.cycle).toEqual({ startsAt: START, endsAt: END })
    expect(dto.meters.map((meter) => [meter.id, meter.percent])).toEqual([
      ['fiveHour', 50],
      ['weekly', 28.5],
      ['month', 14.2],
    ])
    expect(dto.monthPercent).toBe(14.2)
    expect(dto.usageValueUsd).toBe(12.5)
    expect(dto.extraCreditsUsd).toBe(2.5)
    expect(dto.keyName).toBe('Pessoal')
    // Linha: 0% no início, fim do 05/11 (2 créditos de 70), fim do 06/11 (+5) e agora com o medidor.
    expect(dto.chart?.points.filter((point) => point.usage !== null).map((point) => point.usage)).toEqual([0, 2.86, 10, 14.29])
    expect(dto.chart?.today?.percent).toBe(14.29)
    expect(dto.forecast?.projectedPercent).not.toBeNull()
    // Todos os limites do ciclo foram lidos (o do início, o de cada dia e o do ciclo).
    const sinces = mocks.fetch.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('since')).filter(Boolean)
    expect(new Set(sinces)).toEqual(new Set([START, '2026-11-06T00:00:00.000Z', '2026-11-07T00:00:00.000Z']))
    expect(mocks.publish).toHaveBeenCalledOnce()
    expect(mocks.publish).toHaveBeenCalledWith('command-code-usage-updated', { checkedAt: new Date(NOW).toISOString() })
  })

  it('não expõe nome, e-mail, ids da conta, segredo nem campos de cobrança no DTO, no log ou no evento', async () => {
    const dto = await getCommandCodeUsage({})
    const everything = JSON.stringify([dto, mocks.warn.mock.calls, mocks.publish.mock.calls])
    for (const secret of ['Fulano', 'fulano@exemplo.com', 'u1', 'user_secret_a', 'quantity', 'pendingPhase', 'cancelAtPeriodEnd', 'creditThreshold']) expect(everything).not.toContain(secret)
  })

  it('sem chave em uso: unconfigured sem chamar a API; filtro sem assinatura: no-key', async () => {
    mocks.pool.mockResolvedValue([])
    expect((await getCommandCodeUsage({})).state).toBe('unconfigured')
    expect((await getCommandCodeUsage({ apiKey: 'none' })).state).toBe('no-key')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('chave recusada (401): error com a mensagem acionável', async () => {
    override = (path) => (path === '/whoami' ? json({ error: 'unauthorized' }, 401) : null)
    const dto = await getCommandCodeUsage({})
    expect(dto.state).toBe('error')
    expect(dto.message).toContain('recusou a chave na API da CLI (HTTP 401)')
  })

  it('endpoint que sumiu (404): unavailable, sem números', async () => {
    override = (path) => (path === '/billing/credits' ? json({ error: 'not found' }, 404) : null)
    const dto = await getCommandCodeUsage({})
    expect(dto.state).toBe('unavailable')
    expect(dto.message).toContain('não é legível')
    expect(dto.meters).toEqual([])
  })

  it('formato novo: unavailable citando só os campos, nunca os valores', async () => {
    override = (path) => (path === '/billing/credits' ? json({ credits: { remaining: 'segredo-123' } }) : null)
    const dto = await getCommandCodeUsage({})
    expect(dto.state).toBe('unavailable')
    expect(dto.message).toContain('credits.monthlyCredits')
    expect(dto.message).not.toContain('segredo-123')
  })

  it('sem o usado do pool no summary: janelas aparecem, mensal e gráfico ficam indisponíveis (nada estimado)', async () => {
    override = (path) => (path === '/usage/summary' ? json({ totalCost: 3, totalCount: 1 }) : null)
    const dto = await getCommandCodeUsage({})
    expect(dto.state).toBe('ok')
    expect(dto.meters.map((meter) => meter.id)).toEqual(['fiveHour', 'weekly'])
    expect(dto.monthPercent).toBeNull()
    expect(dto.chart).toBeNull()
    expect(dto.chartMessage).toContain('mensal e o gráfico ficaram indisponíveis')
  })

  it('plano sem janelas (pago por uso): sem medidores nem gráfico, com a nota própria', async () => {
    accounts[KEY.apiKey]!.credits = { credits: { monthlyCredits: 0, purchasedCredits: 14 }, windowLimits: { limited: false } }
    override = (path) => (path === '/billing/subscriptions' ? json({ error: 'not found' }, 404) : null)
    const dto = await getCommandCodeUsage({})
    expect(dto.state).toBe('ok')
    expect(dto.noWindows).toBe(true)
    expect(dto.meters).toEqual([])
    expect(dto.extraCreditsUsd).toBe(14)
    expect(dto.chartMessage).toContain('Plano sem janelas de uso')
  })

  it('ciclo passado no filtro: mensagem de que ciclos anteriores não são legíveis', async () => {
    const dto = await getCommandCodeUsage({ to: '2026-10-20T23:59:59.000Z' })
    expect(dto.chart).toBeNull()
    expect(dto.chartMessage).toBe('Ciclos anteriores não são legíveis: o Command Code só informa o saldo do ciclo atual.')
    expect(dto.monthPercent).toBe(14.2)
  })

  it('dia cujo limite falhou: sem dados (conta 0) e aviso de dias faltando, nunca zero silencioso', async () => {
    delete accounts[KEY.apiKey]!.since['2026-11-06T00:00:00.000Z']
    const dto = await getCommandCodeUsage({})
    expect(dto.chart?.missingDays).toBe(2)
    expect(dto.chart?.points.filter((point) => point.date !== '2026-11-07' && point.t !== Date.parse(START)).every((point) => point.usage === null)).toBe(true)
  })
})

describe('Todas as chaves', () => {
  it('duas chaves da mesma conta contam uma vez; contas diferentes somam janelas e pools', async () => {
    mocks.pool.mockResolvedValue([KEY, KEY2])
    accounts[KEY2.apiKey] = defaultAccount()
    const same = await getCommandCodeUsage({})
    expect(same.scope).toMatchObject({ mode: 'all', accounts: 1 })
    expect(same.meters.find((meter) => meter.id === 'month')?.percent).toBe(14.2)
    expect(same.usageValueUsd).toBe(12.5)

    resetCcUsageCacheForTests()
    resetCcSeriesCacheForTests()
    accounts[KEY2.apiKey] = { ...defaultAccount(), user: 'u2', since: { [START]: 0, '2026-11-06T00:00:00.000Z': 0, '2026-11-07T00:00:00.000Z': 0 }, cost: 0, credits: { credits: { monthlyCredits: 70 }, windowLimits: { limited: true, fiveHour: { used: 0, cap: 14, resetAt: 0 }, weekly: { used: 0, cap: 35, resetAt: 0 } } } }
    const sum = await getCommandCodeUsage({})
    expect(sum.scope).toMatchObject({ accounts: 2 })
    expect(sum.meters.map((meter) => [meter.id, meter.percent])).toEqual([
      ['fiveHour', 25],
      ['weekly', 14.2],
      ['month', 7.1],
    ])
    expect(sum.monthPercent).toBe(7.1)
  })

  it('contas com ciclos diferentes: o ciclo da renovação mais próxima rege o gráfico e o % do mês soma a série desde o início dele', async () => {
    mocks.pool.mockResolvedValue([KEY, KEY2])
    // Conta B renova 12 h depois (06/12 00:00): a referência é a conta A (Pessoal), que renova primeiro.
    accounts[KEY2.apiKey] = {
      user: 'u2',
      start: '2026-11-06T00:00:00.000Z',
      end: '2026-12-06T00:00:00.000Z',
      credits: { credits: { monthlyCredits: 45 }, windowLimits: { limited: true, fiveHour: { used: 0, cap: 14, resetAt: 0 }, weekly: { used: 0, cap: 35, resetAt: 0 } } },
      since: { [START]: 6, '2026-11-06T00:00:00.000Z': 5, '2026-11-07T00:00:00.000Z': 2 },
      cost: 4,
    }
    const dto = await getCommandCodeUsage({})
    expect(dto.scope).toMatchObject({ accounts: 2, cyclesDiffer: true, cycleKeyName: 'Pessoal' })
    expect(dto.cycle).toEqual({ startsAt: START, endsAt: END })
    // Mensal das janelas: cada conta no próprio ciclo, (10 + 5) / (70 + 50).
    expect(dto.meters.find((meter) => meter.id === 'month')?.percent).toBe(12.5)
    // % do mês na referência: dias somados desde 05/11 12:00 — (2+1) + (5+3) + (3+2) = 16 de 120.
    expect(dto.monthPercent).toBe(13.3)
    expect(dto.chart?.today?.percent).toBe(13.33)
    expect(dto.chart?.points.filter((point) => point.usage !== null).map((point) => point.usage)).toEqual([0, 2.5, 9.17, 13.33])
    expect(dto.usageValueUsd).toBe(16.5)
  })

  it('uma chave falha: fica fora da soma (cobertura parcial); todas falhando: o estado da primeira', async () => {
    mocks.pool.mockResolvedValue([KEY, KEY2])
    override = (path, key) => (key === KEY2.apiKey && path === '/whoami' ? json({}, 401) : null)
    const dto = await getCommandCodeUsage({})
    expect(dto.state).toBe('ok')
    expect(dto.scope?.failed).toEqual([{ name: 'Trabalho', message: expect.stringContaining('HTTP 401') }])
  })
})

describe('cache, botão e rotina', () => {
  it('a tela reaproveita a leitura de até 1 min; o botão relê, mas no máximo uma vez a cada 30 s', async () => {
    await getCommandCodeUsage({})
    const summaries = summaryCalls()
    await getCommandCodeUsage({})
    expect(whoamiCalls()).toBe(1)
    expect(summaryCalls()).toBe(summaries)
    await refreshCommandCodeUsage({})
    expect(whoamiCalls()).toBe(1)
    vi.setSystemTime(NOW + 31_000)
    await refreshCommandCodeUsage({})
    expect(whoamiCalls()).toBe(2)
  })

  it('rotina: relê as chaves em uso e só publica de novo quando algo muda; sem chave, nem chama a API', async () => {
    expect(await runCommandCodeUsageRefresh()).toBe('5h 50% · Semanal 28,5% · Mensal 14,2%')
    expect(mocks.publish).toHaveBeenCalledOnce()
    vi.setSystemTime(NOW + 5 * 60_000)
    await runCommandCodeUsageRefresh()
    expect(mocks.publish).toHaveBeenCalledOnce()
    mocks.pool.mockResolvedValue([])
    mocks.fetch.mockClear()
    expect(await runCommandCodeUsageRefresh()).toBe('Sem chave do Command Code em uso')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
