import { describe, expect, it } from 'vitest'
import { lineStyleAt, LINE_SERIES_COLORS } from '@/components/metrics/charts/palette'
import { isSmallSample, lineSeriesItems, sampleOf, valueAxis } from '@/components/metrics/line-chart-model'

const thirteen = Array.from({ length: 13 }, (_, index) => ({ key: `s${index}`, label: `Série ${index}`, defaultSelected: index < 3 }))

describe('cores das linhas das métricas', () => {
  it('as 10 primeiras séries têm cores diferentes entre si (sem os dois roxos lado a lado)', () => {
    const colors = lineSeriesItems(thirteen).slice(0, 10).map((item) => item.color)
    expect(new Set(colors).size).toBe(10)
    expect(colors[0]).toBe('var(--chart-2)')
    expect(colors[colors.length - 1]).toBe('var(--chart-1)')
  })

  it('com 13 séries (Desenvolvedor), cor + traço nunca se repetem', () => {
    const styles = lineSeriesItems(thirteen).map((item) => `${item.color}|${item.dash ?? ''}`)
    expect(new Set(styles).size).toBe(13)
    expect(lineStyleAt(LINE_SERIES_COLORS.length).dash).toBeTruthy()
    expect(lineStyleAt(0).dash).toBeUndefined()
  })

  it('a cor vem da posição na lista completa: desmarcar uma série não muda a das outras', () => {
    const items = lineSeriesItems(thirteen)
    const visible = items.filter((item) => item.key !== 's1')
    expect(visible.find((item) => item.key === 's2')!.color).toBe(items[2]!.color)
  })
})

describe('eixo de porcentagem', () => {
  it('vai de 0 a 100 com marcas de 25 quando os valores ficam até 100', () => {
    expect(valueAxis([{ a: 100, b: 0 }, { a: null }], ['a', 'b'], 'percent')).toEqual({ domain: [0, 100], ticks: [0, 25, 50, 75, 100] })
  })

  it('só cresce quando um valor passa de 100 de verdade (ex.: erro de 150%)', () => {
    expect(valueAxis([{ a: 140 }], ['a'], 'percent')).toEqual({ domain: [0, 150], ticks: [0, 25, 50, 75, 100, 125, 150] })
  })

  it('outros formatos usam escala automática a partir de 0', () => {
    expect(valueAxis([{ a: 7 }], ['a'], 'count').domain).toEqual([0, 'auto'])
  })
})

describe('amostra (n)', () => {
  const sample = { bucket: '2026-10-16', base: 2, bySeries: { regression: 2, ciFixed: 0 } }

  it('n da série, ou a base quando a série não informa', () => {
    expect(sampleOf(sample, 'regression')).toBe(2)
    expect(sampleOf(sample, 'ciFixed')).toBe(0)
    expect(sampleOf(sample, 'other')).toBe(2)
    expect(sampleOf(undefined)).toBe(0)
  })

  it('pouco representativo: tem amostra, mas abaixo do mínimo', () => {
    expect(isSmallSample(1, 3)).toBe(true)
    expect(isSmallSample(3, 3)).toBe(false)
    expect(isSmallSample(0, 3)).toBe(false)
    expect(isSmallSample(1, null)).toBe(false)
  })
})
