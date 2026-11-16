/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpencodeGoUsageDto } from '@/features/opencode-quota/go-types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post } }))

import { OpencodeGoSubscriptionCard } from '@/features/opencode-quota/components/go/OpencodeGoSubscriptionCard'

const ok = (data: unknown) => ({ data: { success: true, data } })
const query = { from: '2026-11-06T03:00:00.000Z', to: '2026-11-17T02:59:59.999Z' }
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000 + 30_000).toISOString()

const usage = (overrides: Partial<OpencodeGoUsageDto> = {}): OpencodeGoUsageDto => ({
  state: 'ok',
  message: null,
  checkedAt: new Date().toISOString(),
  keyName: 'Chave principal',
  cycle: { startsAt: '2026-11-05T12:15:35.000Z', endsAt: '2026-12-05T12:15:35.000Z' },
  meters: [
    { id: 'fiveHour', label: '5h', percent: 3.1, resetsAt: inHours(2) },
    { id: 'week', label: 'Semanal', percent: 5.6, resetsAt: inHours(72) },
    { id: 'month', label: 'Mensal', percent: 43.9, resetsAt: '2026-12-05T12:15:35.000Z' },
  ],
  monthPercent: 43.9,
  limitReached: false,
  forecast: { dailyAverage: 3.9, projectedPercent: 116.2, crossesAt: '2026-12-01T07:46:58.320Z' },
  realCostUsd: 42.85,
  chart: {
    points: [
      { date: '2026-11-15', dayPercent: 5.93, usage: 40.71, forecast: null },
      { date: '2026-11-16', dayPercent: 3.19, usage: 43.9, forecast: 43.9 },
      { date: '2026-12-05', dayPercent: null, usage: null, forecast: 116.2 },
    ],
    ceilings: [{ from: '2026-11-15', to: '2026-12-05', value: 100, current: true }],
    crossing: { date: '2026-12-01', value: 100 },
    forecastEnd: { date: '2026-12-05', value: 116.2, percent: 116.2 },
    yMax: 150,
    missingDays: 2,
    partialDays: 0,
    historyFrom: '2026-10-05',
  },
  chartMessage: null,
  ...overrides,
})

function renderCard(data: OpencodeGoUsageDto | Error) {
  mocks.get.mockImplementation(async () => {
    if (data instanceof Error) throw data
    return ok(data)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OpencodeGoSubscriptionCard query={query} />
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('OpencodeGoSubscriptionCard', () => {
  it('mostra % do mês, renovação, previsão, janelas com uma casa, gasto real e o gráfico', async () => {
    renderCard(usage())
    expect(await screen.findByText(/Renova em/)).toBeTruthy()
    expect(mocks.get).toHaveBeenCalledWith('/opencode/quota/go', { params: query })
    expect(screen.getByText('05/12 às 09:15')).toBeTruthy()
    expect(screen.getAllByText('43,9%').some((node) => node.className.includes('text-3xl'))).toBe(true)
    const status = document.querySelector('[data-go-status]')!
    expect(status.textContent).toBe('No ritmo atual, atinge o limite em 01/12')
    expect(status.getAttribute('data-go-status')).toBe('warning')
    expect([...document.querySelectorAll('[data-go-window]')].map((node) => node.getAttribute('data-go-window'))).toEqual(['fiveHour', 'week', 'month'])
    expect(document.querySelector('[data-go-window="week"]')!.textContent).toContain('5,6%')
    expect(screen.getByText('Gasto real no ciclo: US$ 42,85')).toBeTruthy()
    // Nenhum "US$ x de US$ 60" do medidor.
    expect(document.body.textContent).not.toMatch(/US\$ [\d,]+ de US\$/)
    expect([...document.querySelectorAll('[data-go-legend]')].map((node) => node.textContent)).toEqual(['Uso', 'Previsão', 'Teto mensal'])
    expect(document.querySelector('[data-go-average]')!.textContent).toBe('Média de 3,9% por dia')
    const table = screen.getByRole('group', { name: 'Uso acumulado da assinatura OpenCode Go por dia' })
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(table.textContent).toContain('116,2%')
    expect(document.querySelector('[data-go-note="missing"]')!.textContent).toContain('2 dias sem dados')
    expect(screen.getByText(/Chave: Chave principal/)).toBeTruthy()
  })

  it('previsão abaixo do teto mostra o % previsto até a renovação', async () => {
    renderCard(usage({ forecast: { dailyAverage: 1, projectedPercent: 62.4, crossesAt: null } }))
    expect(await screen.findByText('Previsão de 62,4% até a renovação')).toBeTruthy()
  })

  it('com o mês em 100% mostra "Limite mensal atingido" sem previsão', async () => {
    const data = usage({ monthPercent: 100, limitReached: true, forecast: { dailyAverage: 9, projectedPercent: null, crossesAt: null } })
    renderCard({ ...data, chart: { ...data.chart!, crossing: null, forecastEnd: null, points: data.chart!.points.map((point) => ({ ...point, forecast: null })) } })
    const status = await screen.findByText('Limite mensal atingido')
    expect(status.getAttribute('data-go-status')).toBe('destructive')
    expect(screen.queryByText(/Previsão de/)).toBeNull()
    expect(screen.queryByText(/atinge o limite/)).toBeNull()
  })

  it('erro do Console com "Tentar novamente" que relê e mostra o resultado novo', async () => {
    renderCard(usage({ state: 'error', message: 'O OpenCode Go recusou a chave (HTTP 401).', meters: [], cycle: null, monthPercent: null, forecast: null, chart: null, realCostUsd: null }))
    expect(await screen.findByText('O OpenCode Go recusou a chave (HTTP 401).')).toBeTruthy()
    mocks.post.mockResolvedValue(ok(usage()))
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/opencode/quota/go/refresh', null, { params: query }))
    expect(await screen.findByText(/Renova em/)).toBeTruthy()
  })

  it('sem chave em uso aponta para a integração; filtro sem assinatura explica', async () => {
    renderCard(usage({ state: 'unconfigured', message: 'Cadastre e ative uma chave do OpenCode Go.', meters: [], cycle: null, chart: null }))
    const link = await screen.findByRole('link', { name: 'Cadastrar chave' })
    expect(link.getAttribute('href')).toBe('/integracoes/ia/opencode-go')
    cleanup()
    renderCard(usage({ state: 'no-key', message: 'Este filtro de chave não aponta para uma assinatura.', meters: [], cycle: null, chart: null }))
    expect(await screen.findByText('Sem assinatura para este filtro')).toBeTruthy()
  })

  it('catálogo indisponível: medidores sem o gráfico, com aviso', async () => {
    renderCard(usage({ chart: null, chartMessage: 'Não foi possível ler o catálogo de modelos do OpenCode Go.' }))
    expect(await screen.findByText('Gráfico indisponível')).toBeTruthy()
    expect(document.querySelectorAll('[data-go-window]')).toHaveLength(3)
  })

  it('carregando mostra o skeleton; falha da rota mostra erro', async () => {
    mocks.get.mockImplementation(() => new Promise(() => undefined))
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <OpencodeGoSubscriptionCard query={query} />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('status', { name: 'Carregando consumo da assinatura' })).toBeTruthy()
    cleanup()
    renderCard(new Error('boom'))
    expect(await screen.findByText('Não foi possível carregar a assinatura')).toBeTruthy()
  })

  it('marca "Desatualizado" quando a última leitura passou de 15 min', async () => {
    renderCard(usage({ checkedAt: new Date(Date.now() - 20 * 60_000).toISOString() }))
    expect(await screen.findByTestId('stale-badge')).toBeTruthy()
  })
})
