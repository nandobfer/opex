/** @vitest-environment happy-dom */

import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import { flowItems, xyflowMock } from '../../helpers/xyflow'
import { installFakeEventSource } from '../../helpers/engramind-live'

/**
 * OPE-116: o `OpexEngramindProvider` entrega à lib os adaptadores do Opex. Aqui o provider real: o detalhe do
 * canal (`/engramind/canais/[channel]`) com as Configurações do canal pelo `slots.channelDetail`, o link de
 * volta pelo `hrefs`, o "Configurar" do card do fim da rede e o mapeamento dos erros do axios (`toLibError`).
 */

vi.mock('framer-motion', () => ({ ...framerMotionMock(), useReducedMotion: () => true }))
vi.mock('@xyflow/react', () => xyflowMock())
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => nav, usePathname: () => '/engramind', useSearchParams: () => new URLSearchParams() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }))
const net = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), api: net }))
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: () => false, acquireChannel: vi.fn(), releaseChannel: vi.fn() }))

import { DEFAULT_UNIVERSE_LAYOUT, EngramindError } from '@engramind/client'
import { EngramindNetwork, MemoryUniverse } from '@engramind/client/react'
import { OpexEngramindProvider, toLibError } from '@/features/engramind/components/OpexEngramindProvider'
import { EngramindChannelPage } from '@/features/engramind/components/page/channels/EngramindChannelPage'

const now = new Date().toISOString()
const channel = { id: 'ch_1', slug: 'eng/global', name: 'Global da engenharia', description: null, priority: 3, version: 1, created_at: now, archived_at: null }
const respond = (url: string): unknown => {
  if (url === '/engramind/channels/eng%2Fglobal') return channel
  if (url === '/engramind/channels/eng%2Fglobal/settings') return { channel: 'eng/global', channel_id: 'ch_1', settings: [] }
  if (url === '/engramind/subscriptions') return { subscriptions: [], next_cursor: null }
  if (url === '/engramind/channels') return { channels: [channel], next_cursor: null }
  if (url === '/engramind/apps') return { apps: [{ id: 'app_1', slug: 'opex', name: 'Opex', description: null, created_at: now, disabled_at: null, webhook: null }], next_cursor: null }
  if (url.endsWith('s')) return { [url.split('/').pop()!]: [], next_cursor: null }
  return []
}

const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

beforeEach(() => {
  vi.clearAllMocks()
  installFakeEventSource()
  net.get.mockImplementation(async (url: string) => ({ data: { success: true, data: respond(url) } }))
})
afterEach(cleanup)

describe('OpexEngramindProvider com a lib', () => {
  it('detalhe do canal: as Configurações do canal do Opex entram pelo slot, com o link de volta à rede do Opex', async () => {
    wrap(<EngramindChannelPage slug="eng/global" />)
    expect(await screen.findByText('Configurações do canal')).toBeTruthy()
    expect(screen.getByText('Global da engenharia')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Rede/ }).getAttribute('href')).toBe('/engramind?universo=canal%3Aeng%2Fglobal')
    expect(net.get).toHaveBeenCalledWith('/engramind/channels/eng%2Fglobal/settings', expect.anything())
  })

  it('"Configurar" do card do fim da rede leva à aba Conexão da integração', async () => {
    wrap(
      <OpexEngramindProvider>
        <EngramindNetwork />
      </OpexEngramindProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /Configurar/ }))
    expect(nav.push).toHaveBeenCalledWith('/integracoes/engramind?aba=conexao')
  })
})

describe('layout dos universos (OPE-142)', () => {
  const universe = (
    <MemoryUniverse
      center={{ kind: 'channel', id: 'eng/global', label: 'eng/global' }}
      staleAfterDays={90}
      actions={{ onActive: vi.fn(), onPin: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), readOnly: true }}
      memories={Array.from({ length: 30 }, (_, index) => ({
        id: `m${index}`, channel: 'eng/global', title: `M ${index}`, text: 't', category: 'fact', status: 'active' as const, version: 1,
        createdAt: new Date(Date.now() - index * 86_400_000).toISOString(), updatedAt: now, retrievals: 0, injections: 0, lastRetrievedAt: null, verifiedAt: null, stale: false, author: null,
      }))}
    />
  )
  const radiusOf = (id: string) => {
    const node = flowItems.nodes.find((item) => item.id === id) as unknown as { position: { x: number; y: number } }
    return Math.hypot(node.position.x, node.position.y)
  }

  it('sem configuração gravada: o padrão (anéis concêntricos, a mais nova no raio 150)', async () => {
    net.get.mockImplementation(async (url: string) => ({ data: { success: true, data: url === '/engramind/universe-layout' ? { config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null } : respond(url) } }))
    wrap(<OpexEngramindProvider channelLabels={false}>{universe}</OpexEngramindProvider>)
    await waitFor(() => expect(net.get).toHaveBeenCalledWith('/engramind/universe-layout', expect.anything()))
    expect(Math.round(radiusOf('m0'))).toBe(150)
    expect(radiusOf('m29')).toBeGreaterThan(radiusOf('m0'))
  })

  it('a configuração gravada vale no universo da lib (mais novas por fora) e muda ao vivo sem recarregar', async () => {
    const saved = { config: { ...DEFAULT_UNIVERSE_LAYOUT, order: 'newest-outside', firstRadius: 140 }, isDefault: false, updatedAt: now }
    net.get.mockImplementation(async (url: string) => ({ data: { success: true, data: url === '/engramind/universe-layout' ? JSON.parse(JSON.stringify(saved)) : respond(url) } }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <OpexEngramindProvider channelLabels={false}>{universe}</OpexEngramindProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(Math.round(radiusOf('m29'))).toBe(140))
    expect(radiusOf('m0')).toBeGreaterThan(radiusOf('m29'))
    saved.config = { ...DEFAULT_UNIVERSE_LAYOUT, order: 'newest-inside', firstRadius: 100 } as never
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['engramind', 'universe-layout'] })
    })
    await waitFor(() => expect(Math.round(radiusOf('m0'))).toBe(100))
  })
})

describe('similares dos universos (OPE-164)', () => {
  const universe = (
    <MemoryUniverse
      center={{ kind: 'channel', id: 'eng/global', label: 'eng/global' }}
      staleAfterDays={90}
      actions={{ onActive: vi.fn(), onPin: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), readOnly: true }}
      memories={Array.from({ length: 6 }, (_, index) => ({
        id: `m${index}`, channel: 'eng/global', title: `M ${index}`, text: 't', category: 'fact', status: 'active' as const, version: 1,
        createdAt: new Date(Date.now() - index * 86_400_000).toISOString(), updatedAt: now, retrievals: 0, injections: 0, lastRetrievedAt: null, verifiedAt: null, stale: false, author: null,
      }))}
    />
  )
  const related = { related: { m0: [{ id: 'm3', score: 0.9 }] }, pending: false, ready: true }
  const mockLayout = (links: 'center' | 'related') =>
    net.get.mockImplementation(async (url: string) => ({
      data: { success: true, data: url === '/engramind/universe-layout' ? { config: { ...DEFAULT_UNIVERSE_LAYOUT, links }, isDefault: false, updatedAt: now } : url === '/engramind/related-memories' ? related : respond(url) },
    }))

  it('com links entre similares, busca as similares e a lib desenha as arestas', async () => {
    mockLayout('related')
    wrap(<OpexEngramindProvider channelLabels={false}>{universe}</OpexEngramindProvider>)
    await waitFor(() => expect(flowItems.edges.map((edge) => edge.id)).toContain('related:m0|m3'))
    expect(flowItems.edges.some((edge) => edge.type === 'orbit')).toBe(false)
  })

  it('com links ao centro, não consulta as similares', async () => {
    mockLayout('center')
    wrap(<OpexEngramindProvider channelLabels={false}>{universe}</OpexEngramindProvider>)
    await waitFor(() => expect(flowItems.edges.filter((edge) => edge.type === 'orbit')).toHaveLength(6))
    expect(net.get).not.toHaveBeenCalledWith('/engramind/related-memories', expect.anything())
  })

  it('erro ao buscar as similares não quebra a rede: desenha sem arestas', async () => {
    net.get.mockImplementation(async (url: string) => {
      if (url === '/engramind/related-memories') throw new Error('falhou')
      return { data: { success: true, data: url === '/engramind/universe-layout' ? { config: { ...DEFAULT_UNIVERSE_LAYOUT, links: 'related' }, isDefault: false, updatedAt: now } : respond(url) } }
    })
    wrap(<OpexEngramindProvider channelLabels={false}>{universe}</OpexEngramindProvider>)
    await waitFor(() => expect(net.get).toHaveBeenCalledWith('/engramind/related-memories', expect.anything()))
    expect(flowItems.nodes.filter((node) => node.type === 'memory')).toHaveLength(6)
    expect(flowItems.edges.filter((edge) => edge.type === 'related')).toHaveLength(0)
  })
})

describe('toLibError (axios → EngramindError)', () => {
  const axiosError = (status: number, data: unknown, headers: Record<string, string> = {}) =>
    new AxiosError('falhou', 'ERR_BAD_RESPONSE', undefined, undefined, { status, statusText: '', data, headers: new AxiosHeaders(headers), config: { headers: new AxiosHeaders() } } as never)

  it('401 mantém o status, a mensagem pt-BR e o código do Opex', () => {
    const error = toLibError(axiosError(401, { success: false, error: 'Token do Engramind recusado.', code: 'ENGRAMIND_AUTH_INVALID' })) as EngramindError
    expect(error).toBeInstanceOf(EngramindError)
    expect(error).toMatchObject({ status: 401, message: 'Token do Engramind recusado.', code: 'ENGRAMIND_AUTH_INVALID', retryAfter: null })
  })

  it('429 lê o Retry-After e repassa os detalhes', () => {
    const error = toLibError(axiosError(429, { success: false, error: 'Limite.', code: 'ENGRAMIND_RATE_LIMITED', details: { limit: 60 } }, { 'retry-after': '7' })) as EngramindError
    expect(error).toMatchObject({ status: 429, code: 'ENGRAMIND_RATE_LIMITED', retryAfter: 7, details: { limit: 60 } })
  })

  it('sem resposta (rede): status 0, código HTTP_0 e mensagem padrão', () => {
    const error = toLibError(new AxiosError('Network Error', 'ERR_NETWORK')) as EngramindError
    expect(error).toMatchObject({ status: 0, code: 'HTTP_0', message: 'Não foi possível falar com o Engramind.' })
  })

  it('erro que não é do axios passa como está', () => {
    const original = new Error('outro')
    expect(toLibError(original)).toBe(original)
  })
})
