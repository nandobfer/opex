/** @vitest-environment happy-dom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpencodeQuotaDto } from '@/features/opencode-quota/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post } }))

import { OpencodeQuotaPanel } from '@/features/opencode-quota/components/OpencodeQuotaPanel'
import { OPENCODE_QUOTA_PANEL_KEY, OPENCODE_SETTINGS_HREF } from '@/features/opencode-quota/constants'

const ok = (data: unknown) => ({ data: { success: true, data } })
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000 + 30_000).toISOString()

const quota = (overrides: Partial<OpencodeQuotaDto> = {}): OpencodeQuotaDto => ({
  state: 'ok',
  message: null,
  exportedAt: new Date().toISOString(),
  checkedAt: new Date().toISOString(),
  providers: [
    {
      id: 'anthropic',
      name: 'Anthropic',
      status: 'ok',
      errors: [],
      windows: [
        { id: 'a.5h', label: '5h', account: 'pro', usedPercent: 92, value: null, resetAt: inHours(2) },
        { id: 'a.weekly', label: 'Semanal', account: 'pro', usedPercent: 19, value: null, resetAt: null },
      ],
    },
    { id: 'opencode-go', name: 'OpenCode Go', status: 'partial', errors: ['Provider error 503'], windows: [{ id: 'g.monthly', label: 'Mensal', account: null, usedPercent: 70, value: null, resetAt: null }] },
  ],
  ...overrides,
})

/** Texto visível de cada janela da quota (sem os atributos title/aria-label). */
function visibleResetTexts() {
  return [...document.querySelectorAll('[data-quota-window]')].map((node) => node.textContent ?? '')
}

function renderPanel(data: OpencodeQuotaDto | Error) {
  mocks.get.mockImplementation(async () => {
    if (data instanceof Error) throw data
    return ok(data)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OpencodeQuotaPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('OpencodeQuotaPanel', () => {
  it('mostra cada janela com barra, % usado, cor pelo consumo e o tempo até o reset', async () => {
    renderPanel(quota())
    const bars = await screen.findAllByRole('progressbar')
    expect(bars.map((bar) => bar.getAttribute('aria-valuenow'))).toEqual(['92', '19', '70'])
    expect(bars[0]!.getAttribute('aria-label')).toBe('Anthropic 5h: 92% usado, reinicia em 2 h 1 min')
    const levels = [...document.querySelectorAll('[data-quota-window]')].map((node) => node.getAttribute('data-level'))
    expect(levels).toEqual(['critical', 'ok', 'warning'])
    expect((bars[0]!.firstElementChild as HTMLElement).classList.contains('bg-destructive')).toBe(true)
    expect((bars[1]!.firstElementChild as HTMLElement).classList.contains('bg-success')).toBe(true)
    expect(screen.getByText('2 h 1 min')).toBeTruthy()
    // OPE-138: o texto visível perdeu o prefixo "reinicia em"; a dica mantém a explicação.
    expect(visibleResetTexts().some((text) => /reinicia em/i.test(text))).toBe(false)
    expect(screen.getByText('2 h 1 min').getAttribute('title')).toMatch(/^Reinicia em /)
    expect(screen.getByText('Provider error 503')).toBeTruthy()
  })

  it('recolher o card mostra a primeira janela de cada provedor e fica salvo no navegador', async () => {
    renderPanel(quota())
    await screen.findAllByRole('progressbar')
    fireEvent.click(screen.getByRole('button', { name: /Quota do OpenCode/ }))
    await waitFor(() => expect(screen.queryAllByRole('progressbar')).toHaveLength(2))
    const bars = screen.getAllByRole('progressbar')
    expect(bars.map((bar) => bar.getAttribute('aria-valuenow'))).toEqual(['92', '70'])
    expect(bars[0]!.getAttribute('aria-label')).toBe('Anthropic · 5h: 92% usado, reinicia em 2 h 1 min')
    expect(screen.getByText('2 h 1 min')).toBeTruthy()
    expect(visibleResetTexts().some((text) => /reinicia em/i.test(text))).toBe(false)
    expect(screen.getByText('OpenCode Go · Mensal')).toBeTruthy()
    expect(screen.queryByText('Provider error 503')).toBeNull()
    expect(JSON.parse(window.localStorage.getItem(OPENCODE_QUOTA_PANEL_KEY)!)).toEqual({ collapsed: true, collapsedProviders: [] })
  })

  it('a seta do card também recolhe e expande', async () => {
    renderPanel(quota())
    await screen.findAllByRole('progressbar')
    const collapse = screen.getByRole('button', { name: 'Recolher quota' })
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(collapse)
    await waitFor(() => expect(screen.getAllByRole('progressbar')).toHaveLength(2))
    expect(JSON.parse(window.localStorage.getItem(OPENCODE_QUOTA_PANEL_KEY)!)).toMatchObject({ collapsed: true })
    const expand = screen.getByRole('button', { name: 'Expandir quota' })
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(expand)
    await waitFor(() => expect(screen.getAllByRole('progressbar')).toHaveLength(3))
  })

  it('cada provedor recolhe sozinho: mostra só a primeira janela e some do card recolhido', async () => {
    renderPanel(quota())
    await screen.findAllByRole('progressbar')
    fireEvent.click(screen.getByRole('button', { name: 'Recolher Anthropic' }))
    await waitFor(() => expect(screen.getAllByRole('progressbar').map((bar) => bar.getAttribute('aria-valuenow'))).toEqual(['92', '70']))
    expect(screen.getByRole('button', { name: 'Expandir Anthropic' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: 'Recolher OpenCode Go' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Provider error 503')).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem(OPENCODE_QUOTA_PANEL_KEY)!)).toEqual({ collapsed: false, collapsedProviders: ['anthropic'] })

    fireEvent.click(screen.getByRole('button', { name: /Quota do OpenCode/ }))
    await waitFor(() => expect(screen.getAllByRole('progressbar').map((bar) => bar.getAttribute('aria-valuenow'))).toEqual(['70']))
    expect(screen.queryByText(/Anthropic/)).toBeNull()
  })

  it('várias contas no mesmo provedor viram uma barra por conta no card recolhido', async () => {
    window.localStorage.setItem(OPENCODE_QUOTA_PANEL_KEY, JSON.stringify({ collapsed: true, collapsedProviders: ['opencode-go'] }))
    const data = quota()
    data.providers[0]!.windows.push({ id: 'b.5h', label: '5h', account: 'max', usedPercent: 30, value: null, resetAt: null })
    renderPanel(data)
    await waitFor(() => expect(screen.getAllByRole('progressbar')).toHaveLength(2))
    expect(screen.getByText('Anthropic (pro) · 5h')).toBeTruthy()
    expect(screen.getByText('Anthropic (max) · 5h')).toBeTruthy()
  })

  it('preferência antiga { collapsed } continua valendo', async () => {
    window.localStorage.setItem(OPENCODE_QUOTA_PANEL_KEY, JSON.stringify({ collapsed: true }))
    renderPanel(quota())
    await waitFor(() => expect(screen.getAllByRole('progressbar')).toHaveLength(2))
    expect(screen.getByTestId('quota-compact')).toBeTruthy()
  })

  it('plugin sem resposta explica o que fazer', async () => {
    renderPanel(quota({ state: 'missing', message: 'x', providers: [], exportedAt: null }))
    expect(await screen.findByText('Plugin opencode-quota não respondeu')).toBeTruthy()
  })

  it('erro ao carregar oferece tentar novamente (pede a quota de novo)', async () => {
    mocks.post.mockResolvedValue(ok(quota()))
    renderPanel(new Error('falhou'))
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/opencode/quota/refresh'))
    expect(await screen.findAllByRole('progressbar')).toHaveLength(3)
  })

  it('export antigo ganha o selo "Desatualizado"', async () => {
    renderPanel(quota({ exportedAt: new Date(Date.now() - 31 * 60_000).toISOString() }))
    expect(await screen.findByText('Desatualizado')).toBeTruthy()
  })

  it('OPE-161: atalho de configuração entre Atualizar e a seta, levando ao OpenCode no host', async () => {
    renderPanel(quota())
    await screen.findAllByRole('progressbar')
    const link = screen.getByTestId('opencode-quota-config')
    expect(link.tagName).toBe('A')
    expect(OPENCODE_SETTINGS_HREF).toBe('/integracoes/ia/opencode')
    expect(link.getAttribute('href')).toBe('/integracoes/ia/opencode')
    expect(link.getAttribute('aria-label')).toBe('Configurar OpenCode no host')
    expect(link.getAttribute('title')).toBe('Configurar OpenCode no host')
    expect(link.classList.contains('focus-visible:ring-2')).toBe(true)
    expect(link.classList.contains('h-6')).toBe(true)
    expect(link.classList.contains('w-6')).toBe(true)
    const refresh = screen.getByRole('button', { name: 'Atualizar quota do OpenCode' })
    const chevron = screen.getByRole('button', { name: 'Recolher quota' })
    expect(refresh.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(link.compareDocumentPosition(chevron) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(link.parentElement).toBe(chevron.parentElement)
  })

  it('OPE-161: clicar no atalho não recolhe o card nem pede a quota', async () => {
    renderPanel(quota())
    await screen.findAllByRole('progressbar')
    fireEvent.click(screen.getByTestId('opencode-quota-config'))
    expect(screen.getByRole('button', { name: 'Recolher quota' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('progressbar')).toHaveLength(3)
    expect(window.localStorage.getItem(OPENCODE_QUOTA_PANEL_KEY)).toBeNull()
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('OPE-161: com o card recolhido o atalho continua visível e Atualizar continua pedindo a quota', async () => {
    window.localStorage.setItem(OPENCODE_QUOTA_PANEL_KEY, JSON.stringify({ collapsed: true, collapsedProviders: [] }))
    mocks.post.mockResolvedValue(ok(quota()))
    renderPanel(quota())
    await waitFor(() => expect(screen.getAllByRole('progressbar')).toHaveLength(2))
    expect(screen.getByTestId('opencode-quota-config').getAttribute('href')).toBe('/integracoes/ia/opencode')
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar quota do OpenCode' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/opencode/quota/refresh'))
  })

  it('sem provedores com dados mostra o estado vazio', async () => {
    renderPanel(quota({ providers: [] }))
    expect(await screen.findByText('Nenhum provedor com quota')).toBeTruthy()
  })
})
