import { describe, expect, it } from 'vitest'
import { lineSeriesItems } from '@/components/metrics/line-chart-model'
import { SEMANTIC_COLORS, SINGLE_MEASURE_COLOR } from '@/components/metrics/charts/palette'
import { seriesStyle, styleBarChart, styleLineChart } from '@/features/agent-metrics/series-style'
import type { MetricLineChartInput } from '@/features/agent-metrics/types'

const chart = (id: string, keys: string[]): MetricLineChartInput => ({ id, title: id, description: '', format: 'percent', series: keys.map((key) => ({ key, label: key, defaultSelected: true })), points: [], sampleLabel: 'n' })

describe('cores por significado (critério aprovado OPE-141, porte do MT-40)', () => {
  it('a mesma métrica tem a mesma cor e o mesmo traço em agentes diferentes', () => {
    expect(seriesStyle('failures', 'percentages')).toEqual({ color: SEMANTIC_COLORS.red, dash: 'solid' })
    const reviewer = styleLineChart(chart('percentages', ['firstApproval', 'failures'])).series
    const mentor = styleLineChart(chart('percentages', ['lessons', 'failures'])).series
    expect(reviewer.find((item) => item.key === 'failures')).toMatchObject({ color: SEMANTIC_COLORS.red, dash: 'solid' })
    expect(mentor.find((item) => item.key === 'failures')).toMatchObject({ color: SEMANTIC_COLORS.red, dash: 'solid' })
    expect(reviewer[0]).toMatchObject({ color: SEMANTIC_COLORS.green })
  })

  it('positivas verde/azul, informativas roxo/rosa e negativas por criticidade', () => {
    expect(seriesStyle('oneShot')?.color).toBe(SEMANTIC_COLORS.green)
    expect(seriesStyle('ciFixed')?.color).toBe(SEMANTIC_COLORS.blue)
    expect(seriesStyle('confirmed')?.color).toBe(SEMANTIC_COLORS.purple)
    expect(seriesStyle('regression')?.color).toBe(SEMANTIC_COLORS.red)
    expect(seriesStyle('blocked')?.color).toBe(SEMANTIC_COLORS.orange)
    expect(seriesStyle('conflict')?.color).toBe(SEMANTIC_COLORS.yellow)
    expect(seriesStyle('ignored')).toEqual({ color: SEMANTIC_COLORS.red, dash: 'solid' })
    expect(seriesStyle('errors')).toEqual({ color: SEMANTIC_COLORS.red, dash: 'solid' })
  })

  it('Conversas por data: Dono roxo e Portal rosa, ambos cheios (decisão do dono); Tokens por data em roxo', () => {
    expect(seriesStyle('owner', 'conversations')).toEqual({ color: SEMANTIC_COLORS.purple, dash: 'solid' })
    expect(seriesStyle('portal', 'conversations')).toEqual({ color: SEMANTIC_COLORS.pink, dash: 'solid' })
    expect(seriesStyle('tokens', 'tokens')).toEqual({ color: SINGLE_MEASURE_COLOR, dash: 'solid' })
  })

  it('categorias do Adversário usam a escala própria (regression da categoria é pontilhada)', () => {
    expect(seriesStyle('security', 'categories')).toEqual({ color: SEMANTIC_COLORS.red, dash: 'solid' })
    expect(seriesStyle('regression', 'categories')).toEqual({ color: SEMANTIC_COLORS.red, dash: 'dotted' })
    expect(seriesStyle('style', 'categories')).toEqual({ color: SEMANTIC_COLORS.white, dash: 'dotted' })
  })

  it('série sem significado mantém a cor pela posição; com significado, a linha usa a cor e o traço dela', () => {
    expect(seriesStyle('qualquer-coisa', 'percentages')).toBeNull()
    const items = lineSeriesItems(styleLineChart(chart('percentages', ['regression', 'reopened', 'desconhecida'])).series)
    expect(items[0]).toMatchObject({ color: SEMANTIC_COLORS.red, dash: undefined })
    expect(items[1]).toMatchObject({ color: SEMANTIC_COLORS.red, dash: '6 3' })
    expect(items[2]!.color).toMatch(/^var\(--chart-\d+\)$/)
  })

  it('Destino das lições tem cor por lista; as demais barras ficam sem cor própria', () => {
    const targets = styleBarChart({ id: 'targets', title: '', description: '', format: 'count', items: [{ key: 'adversarial', label: 'A', value: 1 }, { key: 'developer-central', label: 'C', value: 2 }, { key: 'outra', label: 'X', value: 3 }] })
    expect(targets.items.map((item) => item.color)).toEqual([SEMANTIC_COLORS.purple, SEMANTIC_COLORS.white, null])
    const tools = styleBarChart({ id: 'tools', title: '', description: '', format: 'count', items: [{ key: 'get_task', label: 'get_task', value: 1 }] })
    expect(tools.items[0]!.color).toBeUndefined()
  })
})
