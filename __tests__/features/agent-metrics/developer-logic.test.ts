import { describe, expect, it } from 'vitest'
import { classifyLegacyCorrections, DEVELOPER_DEFAULT_LINES, DEVELOPER_LINE_ORDER, DEVELOPER_PERCENT_KEYS, developerFlags, mergeCorrections, stageDurations, summarizeDeveloper, type DeveloperWorkbenchFacts } from '@/features/agent-metrics/logic/developer'
import { eachBucketLabel, finalizeLineChart, MIN_RELIABLE_SAMPLE, mergeLineSeries, pct, percentSeries, usageSeries, valueSeries } from '@/features/agent-metrics/logic/common'

const T = (iso: string) => new Date(iso).getTime()
const ctx = { mode: 'day' as const, from: T('2026-11-01T03:00:00Z'), to: T('2026-11-04T02:59:59Z'), timeZone: 'America/Sao_Paulo' }
const NO_SINCE = { interrupted: null, resumed: null, ciFixed: null, stages: null }

const facts = (overrides: Partial<DeveloperWorkbenchFacts> = {}): DeveloperWorkbenchFacts => ({
  id: 'w1',
  completedAt: T('2026-11-02T15:00:00Z'),
  startedAt: T('2026-11-01T15:00:00Z'),
  mergedAt: null,
  planVersions: 1,
  corrections: { plan: 0, preview: 0, pr: 0 },
  reopened: false,
  regressionFinding: false,
  blocked: false,
  lesson: false,
  conflict: false,
  ciFailed: false,
  ciFixed: false,
  interrupted: false,
  resumed: false,
  retried: false,
  costUsd: null,
  tokens: null,
  stageDurations: null,
  ...overrides,
})

describe('Agente Desenvolvedor — definições das métricas', () => {
  it('regressão total = reaberta OU achado de regressão OU correção de prévia', () => {
    expect(developerFlags(facts()).regression).toBe(false)
    expect(developerFlags(facts({ reopened: true })).regression).toBe(true)
    expect(developerFlags(facts({ regressionFinding: true })).regression).toBe(true)
    expect(developerFlags(facts({ corrections: { plan: 0, preview: 1, pr: 0 } }))).toMatchObject({ regression: true, previewCorrection: true })
    // Correção de plano não é regressão.
    expect(developerFlags(facts({ planVersions: 2, corrections: { plan: 1, preview: 0, pr: 0 } })).regression).toBe(false)
  })

  it('one shot = nenhuma correção de plano, de prévia nem pedido do PR', () => {
    expect(developerFlags(facts()).oneShot).toBe(true)
    expect(developerFlags(facts({ planVersions: 2, corrections: { plan: 0, preview: 0, pr: 1 } })).oneShot).toBe(false)
    expect(developerFlags(facts({ planVersions: 2, corrections: { plan: 1, preview: 0, pr: 0 } })).oneShot).toBe(false)
  })

  it('CI corrigido só conta entre as mesas com CI falho', () => {
    expect(developerFlags(facts({ ciFixed: true })).ciFixed).toBe(false)
    const summary = summarizeDeveloper([facts({ id: 'a', ciFailed: true, ciFixed: true }), facts({ id: 'b', ciFailed: true }), facts({ id: 'c' })], ctx, NO_SINCE)
    expect(summary.percents.ciFailed).toBeCloseTo(66.67, 1)
    expect(summary.percents.ciFixed).toBe(50)
  })

  it('período sem mesas concluídas: porcentagens "—" (null), nunca 0%, e o gráfico sem pontos', () => {
    const summary = summarizeDeveloper([], ctx, NO_SINCE)
    expect(summary.base).toBe(0)
    expect(summary.percents.regression).toBeNull()
    expect(summary.series.every((point) => point.regression === null)).toBe(true)
    expect(pct(0, 0)).toBeNull()
  })

  it('a série tem ponto só nos dias com base, na data de conclusão (reaberta e concluída de novo conta uma vez)', () => {
    const summary = summarizeDeveloper([facts({ id: 'a', reopened: true }), facts({ id: 'b' })], ctx, NO_SINCE)
    const day = summary.series.find((point) => point.bucket === '2026-11-02')
    expect(day?.regression).toBe(50)
    expect(day?.reopened).toBe(50)
    expect(summary.series.find((point) => point.bucket === '2026-11-01')?.regression).toBeNull()
    expect(summary.base).toBe(2)
  })

  it('métrica não retroativa: antes da data de início o bucket fica sem ponto e a base só conta mesas depois dela', () => {
    const since = { ...NO_SINCE, interrupted: T('2026-11-02T12:00:00Z') }
    const items = [facts({ id: 'old', completedAt: T('2026-11-01T15:00:00Z'), interrupted: false }), facts({ id: 'new', interrupted: true })]
    const summary = summarizeDeveloper(items, ctx, since)
    expect(summary.percents.interrupted).toBe(100)
    expect(summary.series.find((point) => point.bucket === '2026-11-01')?.interrupted).toBeNull()
  })

  it('ciclos de correção por mesa, tempo até o merge e custo médio', () => {
    const summary = summarizeDeveloper(
      [facts({ id: 'a', planVersions: 3, corrections: { plan: 1, preview: 1, pr: 0 }, mergedAt: T('2026-11-01T17:00:00Z'), costUsd: 2 }), facts({ id: 'b', costUsd: 0 })],
      ctx,
      NO_SINCE,
    )
    expect(summary.cyclesPerWorkbench).toBe(1)
    expect(summary.hoursToMerge).toBe(2)
    expect(summary.costPerWorkbench).toBe(2)
  })
})

describe('classificação retroativa das correções', () => {
  it('versão de plano depois de implementar = prévia; com pedido do PR = PR; senão = plano', () => {
    const plans = [T('2026-11-01T10:00:00Z'), T('2026-11-01T11:00:00Z'), T('2026-11-01T14:00:00Z'), T('2026-11-01T18:00:00Z')]
    const turns = [{ ts: T('2026-11-01T12:00:00Z'), stage: 'implementing' }]
    const prRequests = [T('2026-11-01T17:00:00Z')]
    expect(classifyLegacyCorrections(plans, turns, prRequests)).toEqual({ plan: 1, preview: 1, pr: 1 })
  })

  it('pedido de mudança no PR pelo botão do app (sem o prefixo) conta como PR, não como prévia', () => {
    const plans = [T('2026-11-01T10:00:00Z'), T('2026-11-01T18:00:00Z')]
    // Plano → implementou → abriu o PR → pedido pelo app → nova versão: há turno na etapa do PR.
    const turns = [
      { ts: T('2026-11-01T12:00:00Z'), stage: 'implementing' },
      { ts: T('2026-11-01T14:00:00Z'), stage: 'opening_pr' },
    ]
    expect(classifyLegacyCorrections(plans, turns, [])).toEqual({ plan: 0, preview: 0, pr: 1 })
    expect(developerFlags(facts({ planVersions: 2, corrections: classifyLegacyCorrections(plans, turns, []) })).regression).toBe(false)
  })

  it('depois da data dos eventos, vale o tipo exato do evento', () => {
    const since = T('2026-11-01T12:00:00Z')
    const counts = mergeCorrections(
      [T('2026-11-01T10:00:00Z'), T('2026-11-01T11:00:00Z'), T('2026-11-01T13:00:00Z')],
      (times) => classifyLegacyCorrections(times, [], []),
      [{ at: T('2026-11-01T12:30:00Z'), kind: 'preview' }],
      since,
    )
    expect(counts).toEqual({ plan: 1, preview: 1, pr: 0 })
  })
})

describe('tempo por etapa e uso por data', () => {
  it('cada etapa dura até a entrada da seguinte; repetidas somam; a concluída não conta', () => {
    const durations = stageDurations(
      [
        { at: 0, stage: 'planning' },
        { at: 10, stage: 'plan_review' },
        { at: 30, stage: 'planning' },
        { at: 35, stage: 'done' },
      ],
      100,
    )
    expect(durations).toEqual({ planning: 15, plan_review: 20 })
    expect(stageDurations([], 10)).toBeNull()
  })

  it('uso é contagem: dias sem uso ficam 0 e o mês agrupa os dias', () => {
    const points = usageSeries([{ day: '2026-11-02', runs: 3, failures: 1 }], ctx)
    expect(points.map((point) => point.runs)).toEqual([0, 3, 0])
    const monthly = usageSeries(
      [
        { day: '2026-10-02', runs: 2, failures: 0 },
        { day: '2026-11-02', runs: 1, failures: 1 },
      ],
      { ...ctx, mode: 'month', from: T('2026-10-01T03:00:00Z') },
    )
    expect(monthly).toEqual([
      { bucket: '2026-10', runs: 2, failures: 0 },
      { bucket: '2026-11', runs: 1, failures: 1 },
    ])
  })

  it('percentSeries: porcentagem por bucket com base', () => {
    const points = percentSeries([{ at: T('2026-11-02T15:00:00Z'), flags: { a: true } }, { at: T('2026-11-02T16:00:00Z'), flags: { a: false } }], ['a'] as const, ctx)
    expect(points.find((point) => point.bucket === '2026-11-02')?.a).toBe(50)
  })
})

describe('amostra (n) do gráfico de linhas', () => {
  const chart = (points: ReturnType<typeof percentSeries>, keys: string[], sampleLabel: string | null = 'mesas concluídas') =>
    finalizeLineChart({ id: 'c', title: 't', description: 'd', format: 'percent', sampleLabel, series: keys.map((key) => ({ key, label: key, defaultSelected: true })), points })

  it('o n de cada dia é a base do dia; dia vazio fica null com n = 0 e as chaves n: saem dos pontos', () => {
    const summary = summarizeDeveloper([facts({ id: 'a', reopened: true }), facts({ id: 'b' })], ctx, NO_SINCE)
    const dto = chart(summary.series, [...DEVELOPER_PERCENT_KEYS])
    const index = dto.points.findIndex((point) => point.bucket === '2026-11-02')
    expect(dto.samples[index]).toMatchObject({ bucket: '2026-11-02', base: 2 })
    expect(dto.samples[index]!.bySeries.regression).toBe(2)
    const empty = dto.points.findIndex((point) => point.bucket === '2026-11-01')
    expect(dto.points[empty]!.regression).toBeNull()
    expect(dto.samples[empty]!.base).toBe(0)
    expect(Object.keys(dto.points[index]!).some((key) => key.startsWith('n:'))).toBe(false)
    expect(dto.minSample).toBe(MIN_RELIABLE_SAMPLE)
  })

  it('métrica com data de início conta só as mesas depois dela; CI corrigido conta só as mesas com CI falho', () => {
    const since = { ...NO_SINCE, interrupted: T('2026-11-02T15:30:00Z') }
    const items = [facts({ id: 'a', ciFailed: true, ciFixed: true }), facts({ id: 'b', completedAt: T('2026-11-02T16:00:00Z'), interrupted: true }), facts({ id: 'c' })]
    const dto = chart(summarizeDeveloper(items, ctx, since).series, [...DEVELOPER_PERCENT_KEYS])
    const sample = dto.samples.find((item) => item.bucket === '2026-11-02')!
    expect(sample.base).toBe(3)
    expect(sample.bySeries.interrupted).toBe(1)
    expect(sample.bySeries.ciFixed).toBe(1)
  })

  it('mergeLineSeries preserva as amostras de bases diferentes', () => {
    const blocked = percentSeries([{ at: T('2026-11-02T15:00:00Z'), flags: { blocked: true } }, { at: T('2026-11-02T16:00:00Z'), flags: { blocked: false } }], ['blocked'] as const, ctx)
    const ignored = percentSeries([{ at: T('2026-11-02T15:00:00Z'), flags: { ignored: false } }], ['ignored'] as const, ctx)
    const dto = chart(mergeLineSeries(blocked, ignored), ['blocked', 'ignored'])
    const sample = dto.samples.find((item) => item.bucket === '2026-11-02')!
    expect(sample).toEqual({ bucket: '2026-11-02', base: 2, bySeries: { blocked: 2, ignored: 1 } })
  })

  it('gráfico de soma (sampleLabel null) não leva n', () => {
    const dto = chart(valueSeries([{ at: T('2026-11-02T15:00:00Z'), values: { tokens: 10 } }], ['tokens'] as const, ctx, 'sum'), ['tokens'], null)
    expect(dto.samples).toEqual([])
    expect(dto.minSample).toBeNull()
  })

  it('Desenvolvedor abre só com regressão, bloqueio e one shot, que vêm primeiro na ordem das linhas', () => {
    expect(DEVELOPER_DEFAULT_LINES).toEqual(['regression', 'blocked', 'oneShot'])
    expect(DEVELOPER_LINE_ORDER.slice(0, 3)).toEqual(['regression', 'blocked', 'oneShot'])
    expect([...DEVELOPER_LINE_ORDER].sort()).toEqual([...DEVELOPER_PERCENT_KEYS].sort())
  })

  it('descrição pelo agrupamento', () => {
    expect([eachBucketLabel('day'), eachBucketLabel('week'), eachBucketLabel('month')]).toEqual(['em cada dia', 'em cada semana', 'em cada mês'])
  })
})
