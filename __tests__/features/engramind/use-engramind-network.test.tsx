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

describe('OPE-113: autor agente e pesos da busca', () => {
  it('authorAgent vem de author.agent (app/agente); sem agente, null', async () => {
    const { toNetworkMemory } = await import('@/features/engramind/hooks/useEngramindNetwork')
    const base = { id: 'm', channel: 'opex', channel_id: 'c', title: 'T', title_state: 'ready', text: 'Texto', category: 'X', status: 'active', version: 1, embedding_state: 'ready', retrieval_count: 0, created_at: now, updated_at: now } as unknown as Parameters<typeof toNetworkMemory>[0]
    expect(toNetworkMemory({ ...base, author: { app: 'opex', app_id: 'a', agent: 'opex/opex', agent_id: 'g' } }).authorAgent).toBe('opex/opex')
    expect(toNetworkMemory({ ...base, author: { app: 'opex', app_id: 'a', agent: null, agent_id: null } })).toMatchObject({ author: 'opex', authorAgent: null })
  })

  it('pesos da fusão da busca vêm das configurações, com o padrão 1/1/60', async () => {
    const { searchFusionOf } = await import('@/features/engramind/hooks/useEngramindNetwork')
    expect(searchFusionOf(() => undefined)).toEqual({ vectorWeight: 1, textWeight: 1, k: 60 })
    const settings: Record<string, unknown> = { 'search.vector_weight': 2, 'search.rrf_k': 30 }
    expect(searchFusionOf((key) => settings[key])).toEqual({ vectorWeight: 2, textWeight: 1, k: 30 })
  })
})
