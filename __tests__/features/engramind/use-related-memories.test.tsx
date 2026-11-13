/** @vitest-environment happy-dom */

import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-164: `useRelatedMemories` só consulta com links entre similares, devolve o mapa para a lib e invalida
 * pelo `engramind-updated` `related-memories` ou `memory.*`.
 */

const pusher = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>()
  const channel = {
    bind: vi.fn((event: string, handler: (payload: unknown) => void) => handlers.set(event, handler)),
    unbind: vi.fn((event: string) => handlers.delete(event)),
  }
  return { handlers, channel, acquire: vi.fn(() => channel), release: vi.fn() }
})
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: () => true, acquireChannel: pusher.acquire, releaseChannel: pusher.release }))
const net = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), api: net }))

import { isRelatedMemoriesEvent, useRelatedMemories } from '@/features/engramind/hooks/useRelatedMemories'

const dto = { related: { m_1: [{ id: 'm_2', score: 0.9 }] }, pending: false, ready: true }

function setup(enabled: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const view = renderHook(() => useRelatedMemories({ enabled }), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
  return { ...view, invalidate }
}

beforeEach(() => {
  vi.clearAllMocks()
  pusher.handlers.clear()
  net.get.mockResolvedValue({ data: { success: true, data: dto } })
})

describe('useRelatedMemories', () => {
  it('com links entre similares: busca na rota do Opex e devolve o mapa por id', async () => {
    const { result } = setup(true)
    await waitFor(() => expect(result.current.map?.get('m_1')).toEqual([{ id: 'm_2', score: 0.9 }]))
    expect(net.get).toHaveBeenCalledWith('/engramind/related-memories', expect.anything())
  })

  it('com links ao centro: não consulta nem assina', () => {
    const { result } = setup(false)
    expect(result.current.map).toBeUndefined()
    expect(net.get).not.toHaveBeenCalled()
    expect(pusher.acquire).not.toHaveBeenCalled()
  })

  it('invalida com related-memories e memory.*, e ignora os demais tipos', async () => {
    const { invalidate } = setup(true)
    await waitFor(() => expect(pusher.handlers.has('engramind-updated')).toBe(true))
    pusher.handlers.get('engramind-updated')!({ type: 'universe-layout' })
    expect(invalidate).not.toHaveBeenCalled()
    pusher.handlers.get('engramind-updated')!({ type: 'related-memories' })
    pusher.handlers.get('engramind-updated')!({ type: 'memory.deleted' })
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(isRelatedMemoriesEvent('memory.created')).toBe(true)
    expect(isRelatedMemoriesEvent('channel.updated')).toBe(false)
  })
})
