/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** OPE-109: os dados da rede mantêm a referência enquanto nada muda (o layout e os nodes derivam deles). */

const net = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({
  api: net,
  unwrapApi: (response: { data: unknown }) => response.data,
  apiErrorCode: () => null,
  apiErrorMessage: (_error: unknown, fallback?: string) => fallback ?? 'erro',
}))

import { useEngramindNetwork } from '@/features/engramind/hooks/useEngramindNetwork'

const now = new Date().toISOString()
const respond = (url: string) => {
  if (url === '/engramind/channels') return { channels: [{ id: 'ch_1', slug: 'opex', name: 'Opex', description: null, priority: 0, version: 1, created_at: now, archived_at: null }], next_cursor: null }
  if (url === '/engramind/agents') return { agents: [], next_cursor: null }
  if (url === '/engramind/apps') return { apps: [], next_cursor: null }
  if (url === '/engramind/subscriptions') return { subscriptions: [], next_cursor: null }
  if (url === '/engramind/memories')
    return {
      memories: [{ id: 'm_1', channel: 'opex', channel_id: 'ch_1', title: 'T', title_state: 'ready', text: 'Texto', category: 'PROJECT_RULES', status: 'active', version: 1, author: null, embedding_state: 'ready', retrieval_count: 0, injected_count: 0, last_retrieved_at: null, verified_at: null, stale_candidate: false, created_at: now, updated_at: now, archived_at: null }],
      next_cursor: null,
    }
  if (url === '/engramind/settings') return { settings: [] }
  return {}
}

afterEach(cleanup)

describe('useEngramindNetwork', () => {
  it('regressão: re-render sem dados novos devolve as mesmas listas (memórias, canais, apps, uso e categorias)', async () => {
    net.get.mockImplementation(async (url: string) => ({ data: { data: respond(url) } }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, rerender } = renderHook(() => useEngramindNetwork(), { wrapper })
    await waitFor(() => expect(result.current.memories).toHaveLength(1))
    const before = result.current
    rerender()
    rerender()
    expect(result.current.memories).toBe(before.memories)
    expect(result.current.channels).toBe(before.channels)
    expect(result.current.rawMemories).toBe(before.rawMemories)
    expect(result.current.apps).toBe(before.apps)
    expect(result.current.usage).toBe(before.usage)
    expect(result.current.categories).toBe(before.categories)
  })
})
