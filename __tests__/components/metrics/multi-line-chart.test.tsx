/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())

import { lineSelectionKey, MultiLineChart } from '@/components/metrics/MultiLineChart'
import { LastUsedKpi } from '@/components/metrics/LastUsedKpi'
import { formatMetricValue } from '@/components/metrics/format'

const SERIES = [
  { key: 'regression', label: '% de regressão', defaultSelected: true },
  { key: 'oneShot', label: '% de one shot', defaultSelected: true },
  { key: 'ciFailed', label: '% de CI com falha', defaultSelected: false },
]
const POINTS = [
  { bucket: '2026-11-01', regression: null, oneShot: null, ciFailed: null },
  { bucket: '2026-11-02', regression: 50, oneShot: 25, ciFailed: 0 },
]

const headers = () => Array.from(document.querySelectorAll('[role="group"][aria-label="Métricas"] th')).map((th) => th.textContent)
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

describe('gráfico de várias linhas com legenda selecionável', () => {
  it('cada linha tem caixa de seleção; as padrão vêm marcadas', () => {
    render(<MultiLineChart persistKey="desenvolvedor:percentages" series={SERIES} points={POINTS} format="percent" ariaLabel="Métricas" />)
    expect(checkbox('% de regressão').checked).toBe(true)
    expect(checkbox('% de CI com falha').checked).toBe(false)
    expect(headers()).toEqual(['Data', '% de regressão', '% de one shot'])
  })

  it('marcar e desmarcar mostra/oculta a linha e a escolha fica salva no navegador', () => {
    const { unmount } = render(<MultiLineChart persistKey="desenvolvedor:percentages" series={SERIES} points={POINTS} format="percent" ariaLabel="Métricas" />)
    fireEvent.click(checkbox('% de CI com falha'))
    fireEvent.click(checkbox('% de one shot'))
    expect(headers()).toEqual(['Data', '% de regressão', '% de CI com falha'])
    expect(JSON.parse(window.localStorage.getItem(lineSelectionKey('desenvolvedor:percentages'))!)).toEqual(['regression', 'ciFailed'])
    unmount()
    render(<MultiLineChart persistKey="desenvolvedor:percentages" series={SERIES} points={POINTS} format="percent" ariaLabel="Métricas" />)
    expect(checkbox('% de one shot').checked).toBe(false)
    expect(checkbox('% de CI com falha').checked).toBe(true)
  })

  it('todas desmarcadas: "Selecione ao menos uma métrica"', () => {
    render(<MultiLineChart persistKey="x:y" series={SERIES} points={POINTS} format="percent" ariaLabel="Métricas" />)
    fireEvent.click(checkbox('% de regressão'))
    fireEvent.click(checkbox('% de one shot'))
    expect(screen.getByText('Selecione ao menos uma métrica')).toBeTruthy()
  })

  it('ponto sem base aparece como "—" (nunca 0%)', () => {
    render(<MultiLineChart persistKey="a:b" series={SERIES} points={POINTS} format="percent" ariaLabel="Métricas" />)
    const firstRow = document.querySelectorAll('[role="group"][aria-label="Métricas"] tbody tr')[0]!
    expect(firstRow.textContent).toContain('—')
    expect(formatMetricValue(null, 'percent')).toBe('—')
    expect(formatMetricValue(42.25, 'percent')).toBe('42,3%')
  })
})

describe('KPI Último uso', () => {
  it('data e hora com o tempo relativo; sem uso, "Nunca usado"', () => {
    const at = new Date(2026, 10, 3, 14, 11).toISOString()
    const now = new Date(2026, 10, 6, 14, 11)
    const { rerender } = render(<LastUsedKpi at={at} now={now} />)
    expect(screen.getByText('03/11/2026 14:11')).toBeTruthy()
    expect(screen.getByText('há 3 dias')).toBeTruthy()
    rerender(<LastUsedKpi at={null} />)
    expect(screen.getByText('Nunca usado')).toBeTruthy()
  })
})
