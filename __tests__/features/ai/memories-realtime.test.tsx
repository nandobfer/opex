/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/** OPE-97: tempo real das memórias invalida só a lista alterada (inclusive a de uma central). */

const pusher = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>()
  const channel = { bind: vi.fn((event: string, handler: (payload: unknown) => void) => handlers.set(event, handler)), unbind: vi.fn((event: string) => handlers.delete(event)) }
  return { handlers, channel, acquireChannel: vi.fn(() => channel), releaseChannel: vi.fn() }
})
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: () => true, acquireChannel: pusher.acquireChannel, releaseChannel: pusher.releaseChannel }))
vi.mock('@/lib/api', () => ({ api: {}, unwrapApi: (response: { data: unknown }) => response.data, apiErrorMessage: (_error: unknown, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { agentMemoriesSource, centralMemoriesSource, useMemoriesRealtime } from '@/features/ai/hooks/useMemories'

const C1 = 'c0000000000000000000000a'
const C2 = 'c0000000000000000000000b'
let client: QueryClient

const mount = () => {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useMemoriesRealtime(true), { wrapper })
}
const seed = () => {
  for (const key of [centralMemoriesSource(C1).queryKey, centralMemoriesSource(C2).queryKey, agentMemoriesSource('developer-global').queryKey, agentMemoriesSource('opex-global').queryKey]) client.setQueryData(key, [])
}
const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated === true
const emit = (payload: unknown) => pusher.handlers.get('ai-memories-updated')!(payload)

beforeEach(() => {
  vi.clearAllMocks()
  pusher.handlers.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  seed()
})
afterEach(cleanup)

describe('tempo real das memórias', () => {
  it('fonte da central: rota e chave da central', () => {
    expect(centralMemoriesSource(C1)).toMatchObject({ queryKey: ['ai', 'memories', 'developer-central', C1], basePath: `/agentic/centrals/${C1}/memories` })
  })

  it('evento da lista de uma central invalida só a chave dessa central', () => {
    mount()
    expect(pusher.acquireChannel).toHaveBeenCalledWith('private-integration-ai')
    emit({ agentId: 'developer-central', centralId: C1 })
    expect(stale(centralMemoriesSource(C1).queryKey)).toBe(true)
    expect(stale(centralMemoriesSource(C2).queryKey)).toBe(false)
    expect(stale(agentMemoriesSource('developer-global').queryKey)).toBe(false)
  })

  it('evento das globais do desenvolvedor invalida só essa lista', () => {
    mount()
    emit({ agentId: 'developer-global' })
    expect(stale(agentMemoriesSource('developer-global').queryKey)).toBe(true)
    expect(stale(centralMemoriesSource(C1).queryKey)).toBe(false)
    expect(stale(agentMemoriesSource('opex-global').queryKey)).toBe(false)
  })

  it('evento sem agente invalida todas as listas; desmontar cancela a assinatura', () => {
    const { unmount } = mount()
    emit({})
    expect(stale(centralMemoriesSource(C2).queryKey)).toBe(true)
    expect(stale(agentMemoriesSource('opex-global').queryKey)).toBe(true)
    unmount()
    expect(pusher.channel.unbind).toHaveBeenCalledWith('ai-memories-updated', expect.any(Function))
    expect(pusher.releaseChannel).toHaveBeenCalledWith('private-integration-ai')
  })
})
