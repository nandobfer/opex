/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandCodeUsageDto } from '@/features/command-code-usage/types'

/** OPE-190: card da assinatura Command Code na aba Consumo (mesmo desenho do OpenCode Go). */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post } }))

import { CommandCodeSubscriptionCard } from '@/features/command-code-usage/components/CommandCodeSubscriptionCard'

const ok = (data: unknown) => ({ data: { success: true, data } })
const query = { from: '2026-10-08T03:00:00.000Z', to: '2026-11-08T02:59:59.999Z' }
const START = '2026-11-05T12:00:00.000Z'
const END = '2026-12-05T12:00:00.000Z'
const NOW = Date.parse('2026-11-07T12:00:00.000Z')

const usage = (overrides: Partial<CommandCodeUsageDto> = {}): CommandCodeUsageDto => ({
  state: 'ok',
  message: null,
  checkedAt: new Date().toISOString(),
  keyName: 'Pessoal',
  scope: { mode: 'all', keys: [{ name: 'Pessoal', account: 0 }], accounts: 1, failed: [], cycleKeyName: null, cyclesDiffer: false },
  planId: 'individual-goat',
  cycle: { startsAt: START, endsAt: END },
  meters: [
    { id: 'fiveHour', label: '5h', percent: 50, resetsAt: new Date(Date.now() + 3 * 3_600_000).toISOString() },
    { id: 'weekly', label: 'Semanal', percent: 28.5, resetsAt: null },
    { id: 'month', label: 'Mensal', percent: 14.2, resetsAt: null },
  ],
  monthPercent: 14.2,
  limitReached: false,
  forecast: { dailyAverage: 7.1, projectedPercent: 214.3, crossesAt: '2026-11-19T20:00:00.000Z' },
  usageValueUsd: 12.5,
  usageValuePartial: false,
  extraCreditsUsd: 2.5,
  noWindows: false,
  chart: {
    cycle: { startsAt: START, endsAt: END, current: true },
    points: [
      { t: Date.parse(START), date: '2026-11-05', dayPercent: null, usage: 0, forecast: null, dayForecast: null },
      { t: Date.parse('2026-11-06T00:00:00.000Z'), date: '2026-11-05', dayPercent: 2.86, usage: 2.86, forecast: null, dayForecast: null },
      { t: NOW, date: '2026-11-07', dayPercent: 4.29, usage: 14.29, forecast: 14.29, dayForecast: null },
      { t: Date.parse(END), date: '2026-12-05', dayPercent: null, usage: null, forecast: 214.3, dayForecast: null },
    ],
    today: { t: NOW, percent: 14.29 },
    crossing: { t: Date.parse('2026-11-19T20:00:00.000Z'), value: 100, label: '19 nov' },
    forecastEnd: { t: Date.parse(END), percent: 214.3 },
    yMax: 220,
    missingDays: 1,
    partialDays: 0,
    incompleteDays: 0,
    historyFrom: '2026-11-05',
  },
  chartMessage: null,
  ...overrides,
})

function renderCard(data: CommandCodeUsageDto | Error) {
  mocks.get.mockImplementation(async () => {
    if (data instanceof Error) throw data
    return ok(data)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CommandCodeSubscriptionCard query={query} />
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('CommandCodeSubscriptionCard', () => {
  it('mostra % do mês, renovação, previsão, janelas, valor de uso discreto, plano e o gráfico com a nota de dias sem dados', async () => {
    renderCard(usage())
    expect(await screen.findByText('Renova em 5 dez')).toBeTruthy()
    expect(mocks.get).toHaveBeenCalledWith('/command-code/usage', { params: query })
    expect(screen.getAllByText('14,2%').some((node) => node.className.includes('text-3xl'))).toBe(true)
    expect(screen.getByText('Renova em 5 dez').parentElement!.textContent).toBe('Uso do Command Code·Renova em 5 dez·No ritmo atual, atinge o limite em 19 nov')
    expect([...document.querySelectorAll('[data-usage-window]')].map((node) => node.getAttribute('data-usage-window'))).toEqual(['fiveHour', 'weekly', 'month'])
    // O Intl separa "US$" do valor com espaço rígido.
    expect(document.querySelector('[data-cc-usage-value]')!.textContent).toMatch(/^Valor de uso no ciclo: US\$\s12,50$/)
    expect(document.querySelector('[data-cc-extra]')!.textContent).toMatch(/^Créditos extras: US\$\s2,50$/)
    expect(document.querySelector('[data-cc-plan]')!.textContent).toContain('individual-goat')
    expect(screen.getByRole('img', { name: 'Uso acumulado do ciclo atual da assinatura Command Code' })).toBeTruthy()
    expect([...document.querySelectorAll('[data-usage-legend]')].map((node) => node.textContent)).toEqual(['Uso', 'Previsão', 'Teto mensal'])
    expect(document.querySelector('[data-cc-note="missing"]')!.textContent).toContain('1 dia do ciclo sem dados')
  })

  it('assinatura não legível (API da CLI mudou): aviso claro, sem medidores nem gráfico', async () => {
    renderCard(usage({ state: 'unavailable', message: 'A API da CLI do Command Code (/alpha) não respondeu este endpoint (HTTP 404): a assinatura não é legível por ela no momento.', meters: [], chart: null, cycle: null, monthPercent: null }))
    expect(await screen.findByText('Assinatura não legível')).toBeTruthy()
    expect(screen.getByText(/não é legível por ela no momento/)).toBeTruthy()
    expect(document.querySelector('[data-usage-window]')).toBeNull()
  })

  it('carregando: skeleton com a mesma estrutura', () => {
    mocks.get.mockImplementation(() => new Promise(() => undefined))
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <CommandCodeSubscriptionCard query={query} />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('status', { name: 'Carregando consumo da assinatura' })).toBeTruthy()
  })

  it('erro de leitura: "Tentar novamente" relê pelo botão', async () => {
    mocks.post.mockResolvedValue(ok(usage()))
    renderCard(usage({ state: 'error', message: 'O Command Code recusou a chave na API da CLI (HTTP 401).', meters: [], chart: null }))
    expect(await screen.findByText('Não foi possível ler a assinatura')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/command-code/usage/refresh', null, { params: query }))
  })

  it('plano sem janelas: nota própria no lugar do gráfico; sem chave em uso: atalho para cadastrar', async () => {
    renderCard(usage({ meters: [], chart: null, noWindows: true, monthPercent: null, forecast: null, cycle: null, chartMessage: 'Plano sem janelas de uso: não há teto mensal para o gráfico. O saldo e o valor de uso aparecem acima.' }))
    expect(await screen.findByText('Sem janelas de uso')).toBeTruthy()
    cleanup()
    renderCard(usage({ state: 'unconfigured', message: 'Cadastre e coloque em uso uma chave do Command Code para ver o consumo da assinatura.' }))
    expect((await screen.findByText('Cadastrar chave')).closest('a')!.getAttribute('href')).toBe('/integracoes/ia/command-code')
  })
})
