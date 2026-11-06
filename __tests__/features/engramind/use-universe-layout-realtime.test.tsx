/** @vitest-environment happy-dom */

import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-142: o layout dos universos muda ao vivo. `useUniverseLayout({ realtime: true })` (o do provider) assina o
 * `engramind-updated` em `private-app` e só o tipo `universe-layout` invalida a consulta; sai da assinatura ao desmontar.
 */

const pusher = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>()
  const channel = {
    bind: vi.fn((event: string, handler: (payload: unknown) => void) => handlers.set(event, handler)),
    unbind: vi.fn((event: string) => handlers.delete(event)),
  }
  return { handlers, channel, acquire: vi.fn(() => channel), release: vi.fn(), available: true }
})
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: () => pusher.available, acquireChannel: pusher.acquire, releaseChannel: pusher.release }))
const net = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), api: net }))

import { appChannel } from '@/lib/pusher/channel-names'
import { useUniverseLayout } from '@/features/engramind/hooks/useUniverseLayout'

const dto = { config: { layout: 'rings' }, isDefault: true, updatedAt: null }

function setup(options: { realtime?: boolean } = { realtime: true }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const view = renderHook(() => useUniverseLayout(options), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
  return { ...view, invalidate }
}

beforeEach(() => {
  vi.clearAllMocks()
  pusher.handlers.clear()
  pusher.available = true
  net.get.mockResolvedValue({ data: { success: true, data: dto } })
})

describe('useUniverseLayout (tempo real)', () => {
  it('busca o layout na rota do Opex (sem prefixar /api)', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.data).toEqual(dto))
    expect(net.get).toHaveBeenCalledWith('/engramind/universe-layout', expect.anything())
  })

  it('assina o engramind-updated em private-app; só o tipo universe-layout invalida a consulta', async () => {
    const { invalidate, result } = setup()
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(pusher.acquire).toHaveBeenCalledWith(appChannel())
    const handler = pusher.handlers.get('engramind-updated')!
    expect(handler).toBeTypeOf('function')
    handler({ type: 'memory.created' })
    handler({})
    expect(invalidate).not.toHaveBeenCalled()
    handler({ type: 'universe-layout' })
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['engramind', 'universe-layout'] })
  })

  it('ao desmontar desfaz a assinatura e libera o canal', async () => {
    const { unmount, result } = setup()
    await waitFor(() => expect(result.current.data).toBeTruthy())
    unmount()
    expect(pusher.channel.unbind).toHaveBeenCalledWith('engramind-updated', expect.any(Function))
    expect(pusher.release).toHaveBeenCalledWith(appChannel())
    expect(pusher.handlers.size).toBe(0)
  })

  it('sem realtime (a aba assina pelo useEngramindRealtime) ou sem Pusher no navegador: não assina', async () => {
    const first = setup({ realtime: false })
    await waitFor(() => expect(first.result.current.data).toBeTruthy())
    first.unmount()
    pusher.available = false
    const second = setup({ realtime: true })
    await waitFor(() => expect(second.result.current.data).toBeTruthy())
    expect(pusher.acquire).not.toHaveBeenCalled()
  })
})
