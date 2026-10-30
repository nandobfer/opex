/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
const net = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api', () => ({
  api: net,
  unwrapApi: (response: { data: unknown }) => response.data,
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}))
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: () => false, acquireChannel: vi.fn(), releaseChannel: vi.fn() }))

import { DeveloperMemoriesSection } from '@/features/agentic/components/DeveloperMemoriesSection'

const CENTRAL = 'c0000000000000000000000a'
const mount = (centralId?: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DeveloperMemoriesSection centralId={centralId} />
    </QueryClientProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  net.get.mockResolvedValue({ data: { data: [] } })
})
afterEach(cleanup)

describe('memórias do agente desenvolvedor (tela)', () => {
  it('na central: o card da central (rota da central) e, abaixo, o das globais', async () => {
    mount(CENTRAL)
    const titles = screen.getAllByText(/^Memórias (da central|globais do agente desenvolvedor)$/).map((node) => node.textContent)
    expect(titles).toEqual(['Memórias da central', 'Memórias globais do agente desenvolvedor'])
    await waitFor(() => expect(screen.getAllByText('Nenhuma memória')).toHaveLength(2))
    expect(net.get.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([`/agentic/centrals/${CENTRAL}/memories`, '/ai/agents/developer-global/memories']))
  })

  it('sem central (aba Desenvolvimento agêntico): só as globais', async () => {
    mount()
    expect(screen.getByText('Memórias globais do agente desenvolvedor')).toBeTruthy()
    expect(screen.queryByText('Memórias da central')).toBeNull()
    await waitFor(() => expect(net.get).toHaveBeenCalledWith('/ai/agents/developer-global/memories'))
    expect(net.get.mock.calls.some((call) => String(call[0]).startsWith('/agentic/'))).toBe(false)
  })
})
