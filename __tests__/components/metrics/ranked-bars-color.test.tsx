/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// O recharts não desenha no happy-dom: <Bar> renderiza os filhos e cada <Cell> guarda o `fill` recebido.
const cells: string[] = []
const bars: Record<string, unknown>[] = []
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: (props: { children?: React.ReactNode } & Record<string, unknown>) => {
    bars.push(props)
    return <div>{props.children}</div>
  },
  Cell: ({ fill }: { fill: string }) => {
    cells.push(fill)
    return null
  },
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))
vi.mock('@/components/ui/chart', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/chart')>()),
  ChartContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ChartTooltip: () => null,
}))

import { RankedBarsCard } from '@/components/metrics/charts/RankedBarsCard'

const rows = [
  { label: 'Adversário', value: 3, color: 'var(--chart-info-1)' },
  { label: 'Por central', value: 2, color: 'var(--chart-info-3)' },
  { label: 'Sem cor', value: 1, color: null },
]
const props = { labelKey: 'label', valueKey: 'value', config: { value: { label: 'Destino' } }, ariaLabel: 'Destino das lições', table: { columns: [], rows: [] }, color: 'var(--chart-info-1)' }

beforeEach(() => {
  cells.length = 0
  bars.length = 0
})
afterEach(cleanup)

describe('RankedBarsCard com cor por item (OPE-141, Destino das lições)', () => {
  it('com colorKey, cada barra usa a cor do item; sem cor, a cor do card', () => {
    render(<RankedBarsCard {...props} data={rows} colorKey="color" />)
    expect(cells).toEqual(['var(--chart-info-1)', 'var(--chart-info-3)', 'var(--chart-info-1)'])
  })

  it('sem colorKey (Dashboards), uma cor só e nenhuma célula', () => {
    render(<RankedBarsCard {...props} data={rows} />)
    expect(cells).toEqual([])
    expect(bars.at(-1)!.fill).toBe('var(--chart-info-1)')
  })
})
