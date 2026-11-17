/** @vitest-environment happy-dom */

import React from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), release: vi.fn(), acquire: vi.fn(), handlers: new Map<string, Set<(payload: unknown) => void>>() }))

vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: vi.fn() } }))
vi.mock('@/lib/pusher/client', () => ({
  isPusherClientAvailable: () => true,
  acquireChannel: (name: string) => {
    mocks.acquire(name)
    return {
      bind: (event: string, handler: (payload: unknown) => void) => {
        if (!mocks.handlers.has(event)) mocks.handlers.set(event, new Set())
        mocks.handlers.get(event)!.add(handler)
      },
      unbind: (event: string, handler: (payload: unknown) => void) => mocks.handlers.get(event)?.delete(handler),
    }
  },
  releaseChannel: mocks.release,
}))

import { useOpencodeGoUsage, useOpencodeGoUsageRealtime } from '@/features/opencode-quota/hooks/useOpencodeGoUsage'

const query = { from: '2026-11-06T03:00:00.000Z', to: '2026-11-17T02:59:59.999Z' }

function Subscriber() {
  useOpencodeGoUsage(query)
  useOpencodeGoUsageRealtime()
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
  mocks.get.mockResolvedValue({ data: { success: true, data: { state: 'unconfigured' } } })
})
afterEach(cleanup)

describe('useOpencodeGoUsageRealtime', () => {
  it('o evento da rotina reconsulta a assinatura; desmontar solta o evento e o canal', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={client}>
        <Subscriber />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))
    expect(mocks.get).toHaveBeenCalledWith('/opencode/quota/go', { params: query })
    expect(mocks.acquire).toHaveBeenCalledWith('private-app')
    const handlers = mocks.handlers.get('opencode-go-usage-updated')
    expect(handlers?.size).toBe(1)

    act(() => handlers!.forEach((handler) => handler({ checkedAt: '2026-11-16T20:00:00.000Z' })))
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))

    view.unmount()
    expect(mocks.handlers.get('opencode-go-usage-updated')?.size).toBe(0)
    expect(mocks.release).toHaveBeenCalledWith('private-app')
  })
})
