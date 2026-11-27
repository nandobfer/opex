/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Tempo real da Visão geral (OPE-205): o consumo de IA das origens do agente atualiza a Taxa de cache. */

const mocks = vi.hoisted(() => ({ available: vi.fn(), acquire: vi.fn(), release: vi.fn(), bind: vi.fn(), unbind: vi.fn() }))
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: mocks.available, acquireChannel: mocks.acquire, releaseChannel: mocks.release }))

import { AGENT_METRICS_QUERY_KEY, useAgentMetricsRealtime } from '@/features/agent-metrics/hooks/useAgentMetrics'
import type { AgentId } from '@/features/agent-metrics/catalog'

const KEY = (agent: AgentId) => [AGENT_METRICS_QUERY_KEY, agent, 'overview', {}]

function mount(agent: AgentId) {
  const client = new QueryClient()
  client.setQueryData(KEY(agent), {})
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const view = renderHook(() => useAgentMetricsRealtime(agent), { wrapper })
  const handlers = mocks.bind.mock.calls.filter(([event]) => event === 'ai-consumption-updated').map(([, handler]) => handler as (payload: unknown) => void)
  return { client, view, handlers }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.available.mockReturnValue(true)
  mocks.acquire.mockReturnValue({ bind: mocks.bind, unbind: mocks.unbind })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useAgentMetricsRealtime e o consumo de IA (OPE-205)', () => {
  it('ouve ai-consumption-updated e invalida a Visão geral só com o consumo de uma origem do agente', () => {
    const { client, handlers } = mount('desenvolvedor')
    expect(handlers).toHaveLength(1)
    handlers[0]!({ provider: 'opencode', origin: 'routine-agent' })
    vi.advanceTimersByTime(1000)
    expect(client.getQueryState(KEY('desenvolvedor'))?.isInvalidated).toBe(false)
    handlers[0]!({ provider: 'opencode', origin: 'agentic' })
    vi.advanceTimersByTime(1000)
    expect(client.getQueryState(KEY('desenvolvedor'))?.isInvalidated).toBe(true)
  })

  it('quem já ouvia o consumo inteiro (Catalogador) não ganha uma segunda assinatura nem o filtro', () => {
    const { client, handlers } = mount('catalogador')
    expect(handlers).toHaveLength(1)
    handlers[0]!({ provider: 'gemini', origin: 'outra-origem' })
    vi.advanceTimersByTime(1000)
    expect(client.getQueryState(KEY('catalogador'))?.isInvalidated).toBe(true)
  })

  it('desfaz a assinatura do consumo ao desmontar', () => {
    const { view } = mount('mentor')
    view.unmount()
    expect(mocks.unbind).toHaveBeenCalledWith('ai-consumption-updated', expect.any(Function))
    expect(mocks.release).toHaveBeenCalled()
  })
})
