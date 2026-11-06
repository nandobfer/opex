/** @vitest-environment happy-dom */

import React from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), handlers: new Map<string, Set<(payload: unknown) => void>>() }))

vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get, post: vi.fn() } }))
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

import { useOpencodeQuota, useOpencodeQuotaRealtime } from '@/features/opencode-quota/hooks/useOpencodeQuota'

function Subscriber() {
  useOpencodeQuota()
  useOpencodeQuotaRealtime()
  return null
}

afterEach(cleanup)

describe('quota em dois lugares (barra lateral e /desenvolvimento, OPE-145)', () => {
  it('um evento com duas assinaturas faz uma busca só', async () => {
    let resolve: ((value: unknown) => void) | null = null
    mocks.get.mockImplementation(() => new Promise((done) => (resolve = done)))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <Subscriber />
        <Subscriber />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))
    await act(async () => resolve?.({ data: { success: true, data: { state: 'ok', providers: [] } } }))

    act(() => mocks.handlers.get('opencode-quota-updated')!.forEach((handler) => handler({ checkedAt: 'x' })))
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
    await act(async () => resolve?.({ data: { success: true, data: { state: 'ok', providers: [] } } }))
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })
})
