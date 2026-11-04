/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'
import { xyflowMock } from '../../helpers/xyflow'
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

import { EngramindError } from '@engramind/client'
import { EngramindNetwork } from '@engramind/client/react'
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
