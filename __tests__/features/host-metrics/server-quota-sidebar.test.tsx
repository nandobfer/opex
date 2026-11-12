/** @vitest-environment happy-dom */

import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostMetricsDto } from '@/features/host-metrics/schemas'
import type { OpencodeQuotaDto } from '@/features/opencode-quota/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), handlers: new Map<string, Set<(payload: unknown) => void>>() }))

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('next/navigation', () => ({ usePathname: () => '/tarefas' }))
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: mocks.post } }))
vi.mock('@/lib/pusher/client', () => ({
  isPusherClientAvailable: () => true,
  acquireChannel: () => ({
    bind: (event: string, handler: (payload: unknown) => void) => {
      if (!mocks.handlers.has(event)) mocks.handlers.set(event, new Set())
      mocks.handlers.get(event)!.add(handler)
    },
    unbind: (event: string, handler: (payload: unknown) => void) => mocks.handlers.get(event)?.delete(handler),
  }),
  releaseChannel: () => undefined,
}))

import { ServerQuotaSidebarItem } from '@/features/host-metrics/components/ServerQuotaSidebarItem'
import { HostMetricsPanel } from '@/features/host-metrics/components/HostMetricsPanel'
import { OPENCODE_QUOTA_PANEL_KEY } from '@/features/opencode-quota/constants'

const ok = (data: unknown) => ({ data: { success: true, data } })
const usage = (percent: number, total = 32e9) => ({ percent, used: (percent / 100) * total, total })

const host = (over: Partial<HostMetricsDto> = {}): HostMetricsDto => ({
  state: 'ok',
  message: null,
  metrics: { cpu: usage(10, 8), memory: usage(20), swap: usage(5, 8e9), disk: usage(40, 1e12) },
  checkedAt: new Date().toISOString(),
  attemptedAt: new Date().toISOString(),
  staleAfterMs: 30_000,
  ...over,
})

const quota = (percents: number[]): OpencodeQuotaDto => ({
  state: 'ok',
  message: null,
  exportedAt: new Date().toISOString(),
  checkedAt: new Date().toISOString(),
  providers: [{ id: 'anthropic', name: 'Anthropic', status: 'ok', errors: [], windows: percents.map((percent, index) => ({ id: `w${index}`, label: `J${index}`, account: null, usedPercent: percent, value: null, resetAt: null })) }],
})

function serve(hostData: HostMetricsDto | Error | 'pending', quotaData: OpencodeQuotaDto) {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/host-metrics') {
      if (hostData === 'pending') return new Promise(() => undefined)
      return hostData instanceof Error ? Promise.reject(hostData) : Promise.resolve(ok(hostData))
    }
    return Promise.resolve(ok(quotaData))
  })
}

function renderWith(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

const dot = (side: 'left' | 'right') => screen.getByTestId(`status-dot-${side}`)
const dotClass = (side: 'left' | 'right') => dot(side).querySelector('span[aria-hidden]')?.className ?? ''

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
  window.localStorage.clear()
})
afterEach(cleanup)

describe('ServerQuotaSidebarItem (OPE-145)', () => {
  it('bolinhas com a cor da pior barra: servidor à esquerda, quota à direita', async () => {
    serve(host({ metrics: { cpu: usage(10, 8), memory: usage(70), swap: usage(5, 8e9), disk: usage(40, 1e12) } }), quota([20, 90]))
    renderWith(<ServerQuotaSidebarItem collapsed />)
    await waitFor(() => expect(dot('left').getAttribute('data-level')).toBe('warning'))
    await waitFor(() => expect(dot('right').getAttribute('data-level')).toBe('critical'))
    expect(dotClass('left')).toContain('bg-warning')
    expect(dotClass('right')).toContain('bg-destructive')
    expect(screen.getByRole('button', { name: 'Servidor e quota' })).toBeTruthy()
  })

  it('bolinha da quota segue a preferência salva (provedor recolhido conta só o resumo)', async () => {
    window.localStorage.setItem(OPENCODE_QUOTA_PANEL_KEY, JSON.stringify({ collapsed: false, collapsedProviders: ['anthropic'] }))
    serve(host(), quota([20, 90]))
    renderWith(<ServerQuotaSidebarItem collapsed />)
    await waitFor(() => expect(dot('right').getAttribute('data-level')).toBe('ok'))
  })

  it('cinza carregando, com erro ou desatualizado', async () => {
    serve('pending', quota([20]))
    const view = renderWith(<ServerQuotaSidebarItem collapsed />)
    expect(dot('left').getAttribute('data-level')).toBe('unknown')
    expect(dotClass('left')).toContain('bg-muted-foreground')
    view.unmount()

    serve(host({ state: 'error', message: 'x' }), quota([20]))
    const second = renderWith(<ServerQuotaSidebarItem collapsed />)
    await waitFor(() => expect(dot('right').getAttribute('data-level')).toBe('ok'))
    expect(dot('left').getAttribute('data-level')).toBe('unknown')
    second.unmount()

    serve(host({ checkedAt: new Date(Date.now() - 60_000).toISOString() }), quota([20]))
    renderWith(<ServerQuotaSidebarItem collapsed />)
    await waitFor(() => expect(dot('right').getAttribute('data-level')).toBe('ok'))
    expect(dot('left').getAttribute('data-level')).toBe('unknown')
  })

  it('evento em tempo real grava os números no cache, sem nova busca', async () => {
    serve(host(), quota([20]))
    renderWith(<ServerQuotaSidebarItem collapsed />)
    await waitFor(() => expect(dot('left').getAttribute('data-level')).toBe('ok'))
    const calls = mocks.get.mock.calls.length
    act(() => mocks.handlers.get('host-metrics-updated')!.forEach((handler) => handler(host({ metrics: { cpu: usage(96, 8), memory: usage(20), swap: usage(5, 8e9), disk: usage(40, 1e12) } }))))
    await waitFor(() => expect(dot('left').getAttribute('data-level')).toBe('critical'))
    expect(mocks.get.mock.calls.length).toBe(calls)
  })

  it('abre pelo teclado (Enter/clique) com o servidor em cima e a quota embaixo, sem navegar', async () => {
    serve(host(), quota([20]))
    renderWith(<ServerQuotaSidebarItem collapsed />)
    const trigger = screen.getByRole('button', { name: 'Servidor e quota' })
    expect(trigger.tagName).toBe('BUTTON')
    fireEvent.click(trigger)
    const panel = await screen.findByTestId('sidebar-server-quota-panel')
    await waitFor(() => expect(panel.querySelector('[data-testid="host-metrics-panel"]')).toBeTruthy())
    const sections = Array.from(panel.querySelectorAll('section')).map((section) => section.getAttribute('aria-label'))
    expect(sections.indexOf('Servidor')).toBeLessThan(sections.indexOf('Quota do OpenCode'))
  })

  it('OPE-161: a quota do painel lateral também leva o atalho para a configuração do OpenCode', async () => {
    serve(host(), quota([20]))
    renderWith(<ServerQuotaSidebarItem collapsed={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Servidor e quota' }))
    const panel = await screen.findByTestId('sidebar-server-quota-panel')
    const link = await waitFor(() => {
      const found = panel.querySelector('[data-testid="opencode-quota-config"]')
      expect(found).toBeTruthy()
      return found!
    })
    expect(link.getAttribute('href')).toBe('/integracoes/ia/opencode')
    expect(link.getAttribute('aria-label')).toBe('Configurar OpenCode no host')
  })

  it('na gaveta mostra a linha "Servidor" com as bolinhas', async () => {
    serve(host(), quota([20]))
    renderWith(<ServerQuotaSidebarItem collapsed={false} />)
    expect(screen.getByText('Servidor')).toBeTruthy()
    expect(dot('left')).toBeTruthy()
    expect(dot('right')).toBeTruthy()
  })
})

describe('HostMetricsPanel (OPE-145)', () => {
  it('skeleton no carregamento com cabeçalho e quatro linhas', () => {
    serve('pending', quota([]))
    renderWith(<HostMetricsPanel />)
    expect(screen.getByTestId('host-metrics-skeleton')).toBeTruthy()
    expect(screen.getAllByTestId('host-metrics-skeleton-row')).toHaveLength(4)
  })

  it('quatro linhas na ordem, usado/total em GB/TB e "Sem swap" sem swap', async () => {
    serve(host({ metrics: { cpu: usage(12, 8), memory: usage(50, 32e9), swap: { percent: 0, used: 0, total: 0 }, disk: usage(31, 1e12) } }), quota([]))
    renderWith(<HostMetricsPanel />)
    await screen.findByTestId('host-metrics-panel')
    const rows = Array.from(document.querySelectorAll('[data-host-metric]')).map((row) => row.getAttribute('data-host-metric'))
    expect(rows).toEqual(['cpu', 'memory', 'swap', 'disk'])
    expect(screen.getByText('Sem swap')).toBeTruthy()
    expect(screen.getByText('16,0 GB / 32,0 GB')).toBeTruthy()
    expect(screen.getByText('310,0 GB / 1,0 TB')).toBeTruthy()
    expect(screen.getAllByRole('progressbar')).toHaveLength(3)
    expect(screen.getByText(/^Atualizado às \d{2}:\d{2}:\d{2}$/)).toBeTruthy()
    expect(screen.queryByTestId('stale-badge')).toBeNull()
  })

  it('falha sem leitura anterior: mensagem e "Tentar novamente" lê na hora', async () => {
    serve(host({ state: 'error', message: 'x', metrics: null, checkedAt: null }), quota([]))
    mocks.post.mockResolvedValue(ok(host()))
    renderWith(<HostMetricsPanel />)
    expect(await screen.findByText('Não foi possível ler os recursos do servidor pelo OpenCode.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/host-metrics/refresh'))
    await waitFor(() => expect(screen.getAllByRole('progressbar')).toHaveLength(4))
  })

  it('falha com leitura anterior mantém as barras e marca desatualizado', async () => {
    serve(host({ state: 'error', message: 'x' }), quota([]))
    renderWith(<HostMetricsPanel />)
    await screen.findByTestId('stale-badge')
    expect(screen.getAllByRole('progressbar')).toHaveLength(4)
  })

  it('OpenCode sem URL mostra o aviso de configuração', async () => {
    serve(host({ state: 'unconfigured', message: 'x', metrics: null, checkedAt: null }), quota([]))
    renderWith(<HostMetricsPanel />)
    expect(await screen.findByText('Configure o OpenCode em Integrações para ver os recursos do servidor.')).toBeTruthy()
  })
})
