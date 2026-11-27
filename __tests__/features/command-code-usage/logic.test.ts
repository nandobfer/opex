import { describe, expect, it } from 'vitest'
import { ccAccountKey, ccReferenceIndex, ccDailyCredits, ccKeyLabel, ccMonthPool, ccSeriesBoundaries, combineCcDays, groupCcAccounts, hasCcWindows, sumCcMeters } from "@nandobfer/integracoes/modules/integrations/ia/features/command-code-usage/logic"
import { ccCreditsSchema, ccSubscriptionSchema, ccWhoamiSchema, toIsoInstant } from "@nandobfer/integracoes/modules/integrations/ia/features/command-code-usage/schemas"
import { joinCommandCodeCatalog, commandCodeRoute, toCommandCodeModels } from "@nandobfer/integracoes/modules/integrations/ia/ai/command-code-models"

/** OPE-190: regras puras da assinatura Command Code (API da CLI) e do catálogo do provedor. */

const credits = (overrides: Record<string, unknown> = {}) =>
  ccCreditsSchema.parse({
    credits: { monthlyCredits: 50, purchasedCredits: 0, freeCredits: 0 },
    windowLimits: { limited: true, fiveHour: { used: 7, cap: 14, resetAt: '2026-11-24T20:00:00Z' }, weekly: { used: 0.01, cap: 35, resetAt: 0 } },
    ...overrides,
  })

describe('schemas da API da CLI', () => {
  it('resetAt aceita ISO e epoch em ms; 0 vira nulo (janela não usada)', () => {
    const parsed = credits()
    expect(parsed.windowLimits?.fiveHour?.resetAt).toBe('2026-11-24T20:00:00.000Z')
    expect(parsed.windowLimits?.weekly?.resetAt).toBeNull()
    expect(toIsoInstant(1790296411110)).toBe(new Date(1790296411110).toISOString())
    expect(toIsoInstant(1790296411)).toBe(new Date(1790296411000).toISOString())
  })

  it('descarta nome, e-mail e campos de cobrança, e aceita a resposta embrulhada em data', () => {
    const whoami = ccWhoamiSchema.parse({ success: true, user: { id: 'u1', name: 'Fulano', email: 'f@x.com', userName: 'f' }, org: null })
    expect(whoami).toEqual({ user: { id: 'u1' }, org: null })
    const sub = ccSubscriptionSchema.parse({ data: { status: 'active', planId: 'individual-goat', currentPeriodStart: '2026-11-05T10:00:00Z', currentPeriodEnd: '2026-12-05T10:00:00Z', quantity: 1, pendingPhase: null, cancelAtPeriodEnd: false, orgId: 'o1' } })
    expect(Object.keys(sub).sort()).toEqual(['currentPeriodEnd', 'currentPeriodStart', 'planId', 'status'])
    expect(JSON.stringify(sub)).not.toMatch(/quantity|pendingPhase|cancelAtPeriodEnd|orgId/)
  })
})

describe('medidores', () => {
  it('5h e Semanal por used/cap (uma casa, truncado) e Mensal derivado: usado no ciclo ÷ (usado + restante)', () => {
    const meters = sumCcMeters([{ credits: credits(), month: ccMonthPool(20, 50) }])
    expect(meters).toEqual([
      { id: 'fiveHour', label: '5h', percent: 50, resetsAt: '2026-11-24T20:00:00.000Z' },
      { id: 'weekly', label: 'Semanal', percent: 0, resetsAt: null },
      { id: 'month', label: 'Mensal', percent: 28.5, resetsAt: null },
    ])
  })

  it('sem o usado do ciclo, o Mensal não aparece (nada é estimado)', () => {
    expect(ccMonthPool(null, 50)).toBeNull()
    expect(sumCcMeters([{ credits: credits(), month: null }]).map((meter) => meter.id)).toEqual(['fiveHour', 'weekly'])
  })

  it('plano sem janelas (Provider, pago por uso): nenhuma janela', () => {
    const payg = credits({ windowLimits: { limited: false } })
    expect(hasCcWindows(payg)).toBe(false)
    expect(sumCcMeters([{ credits: payg, month: null }])).toEqual([])
  })

  it('soma de contas: used e cap somados por janela, reset mais próximo, Mensal sobre a soma dos pools', () => {
    const other = credits({ windowLimits: { limited: true, fiveHour: { used: 0, cap: 14, resetAt: '2026-11-24T18:00:00Z' }, weekly: { used: 35, cap: 35, resetAt: 1790296411110 } } })
    const meters = sumCcMeters([
      { credits: credits(), month: ccMonthPool(20, 50) },
      { credits: other, month: ccMonthPool(0, 70) },
    ])
    expect(meters.find((meter) => meter.id === 'fiveHour')).toMatchObject({ percent: 25, resetsAt: '2026-11-24T18:00:00.000Z' })
    expect(meters.find((meter) => meter.id === 'month')?.percent).toBe(14.2)
  })
})

describe('série diária pelas diferenças dos since', () => {
  it('limites: início do ciclo e o início de cada dia UTC até hoje', () => {
    const start = Date.parse('2026-11-05T10:00:00Z')
    expect(ccSeriesBoundaries(start, Date.parse('2026-11-07T03:00:00Z')).map((item) => item.date)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07'])
  })

  it('dia = since(dia) − since(dia seguinte); hoje = since(hoje); falta de leitura = sem dados; diferença negativa = 0 parcial', () => {
    const boundaries = [{ date: 'a' }, { date: 'b' }, { date: 'c' }, { date: 'd' }]
    const days = ccDailyCredits(boundaries, [10, 7, 8, 2])
    expect(days.get('a')).toEqual({ credits: 3, partial: false })
    expect(days.get('b')).toEqual({ credits: 0, partial: true })
    expect(days.get('c')).toEqual({ credits: 6, partial: false })
    expect(days.get('d')).toEqual({ credits: 2, partial: false })
    expect(ccDailyCredits(boundaries, [10, null, 8, 2]).get('a')).toEqual({ credits: null, partial: false })
  })

  it('em %: créditos ÷ pool; o primeiro dia é dividido pela fração do ciclo nele (o gráfico pró-rateia de volta)', () => {
    const start = Date.parse('2026-11-05T12:00:00Z')
    const days = new Map([
      ['2026-11-05', { credits: 1, partial: false }],
      ['2026-11-06', { credits: 2, partial: false }],
    ])
    const combined = combineCcDays([{ days, pool: 100 }], ['2026-11-05', '2026-11-06'], start)
    expect(combined.get('2026-11-05')?.percent).toBeCloseTo(2)
    expect(combined.get('2026-11-06')?.percent).toBeCloseTo(2)
  })

  it('soma de contas: conta sem dados no dia conta 0 e marca incompleto; sem dados de nenhuma, sem dados', () => {
    const a = new Map([['2026-11-06', { credits: 4, partial: false }]])
    const b = new Map([['2026-11-06', { credits: null, partial: false }]])
    const combined = combineCcDays([{ days: a, pool: 50 }, { days: b, pool: 150 }], ['2026-11-06', '2026-11-07'], Date.parse('2026-11-05T00:00:00Z'))
    expect(combined.get('2026-11-06')).toEqual({ percent: 2, partial: false, incomplete: true })
    expect(combined.get('2026-11-07')).toEqual({ percent: null, partial: false })
  })
})

describe('contas e rótulos', () => {
  it('identidade pela organização ou, sem ela, pelo usuário; chaves da mesma conta ficam juntas', () => {
    expect(ccAccountKey({ user: { id: 'u1' }, org: { id: 'o1' } })).toBe('org:o1')
    expect(ccAccountKey({ user: { id: 'u1' }, org: null })).toBe('user:u1')
    const groups = groupCcAccounts([{ account: 'user:u1', n: 1 }, { account: 'user:u2', n: 2 }, { account: 'user:u1', n: 3 }, { account: null, n: 4 }])
    expect(groups.map((group) => group.map((item) => item.n))).toEqual([[1, 3], [2], [4]])
  })

  it('ciclo de referência: renovação mais próxima; empate pelo maior pool, depois a principal, depois o nome', () => {
    expect(ccReferenceIndex([{ endMs: 20, pool: 100, primary: true, name: 'A' }, { endMs: 10, pool: 10, primary: false, name: 'B' }])).toBe(1)
    expect(ccReferenceIndex([{ endMs: 10, pool: 50, primary: true, name: 'A' }, { endMs: 10, pool: 70, primary: false, name: 'B' }])).toBe(1)
    expect(ccReferenceIndex([{ endMs: 10, pool: 70, primary: false, name: 'A' }, { endMs: 10, pool: 70, primary: true, name: 'B' }])).toBe(1)
    expect(ccReferenceIndex([{ endMs: 10, pool: 70, primary: false, name: 'Zeta' }, { endMs: 10, pool: 70, primary: false, name: 'Alfa' }])).toBe(1)
  })

  it('rótulo: uma chave ou "Chaves: 3 (2 contas)"', () => {
    expect(ccKeyLabel(null, 'Pessoal')).toBe('Chave: Pessoal')
    expect(ccKeyLabel({ mode: 'all', keys: [{ name: 'A', account: 0 }, { name: 'B', account: 0 }, { name: 'C', account: 1 }], accounts: 2, failed: [], cycleKeyName: null, cyclesDiffer: false }, null)).toBe('Chaves: 3 (2 contas)')
  })
})

describe('catálogo do provedor (command-code-models)', () => {
  it('une as listas pelo id e roteia pela preferência chat → responses → messages, sempre na base oficial', () => {
    const list = joinCommandCodeCatalog(
      [
        { id: 'gpt-x', supported_endpoints: ['/responses', '/chat/completions'] },
        { id: 'claude-x', supported_endpoints: ['/messages'] },
        { id: 'typesafe/jev', supported_endpoints: ['/systemone'] },
      ],
      [{ id: 'claude-x', display: { group: 'Anthropic', label: 'Claude X' }, reasoningEfforts: ['low', 'xhigh'] }],
    )
    expect(commandCodeRoute(list[0])).toEqual({ api: 'chat-completions', baseURL: 'https://api.commandcode.ai/provider/v1' })
    expect(commandCodeRoute(list[1]).api).toBe('messages')
    expect(commandCodeRoute(undefined).api).toBe('chat-completions')
    expect(commandCodeRoute({ id: 'claude-y', endpoints: null }).api).toBe('messages')
    const models = toCommandCodeModels(list)
    expect(models.map((model) => model.id)).toEqual(['claude-x', 'gpt-x'])
    expect(models[0]).toMatchObject({ name: 'Claude X', group: 'Anthropic', variants: ['low', 'xhigh'] })
  })
})
