/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** Cores das centrais em Tarefas em tempo real: `agentic-updated` recarrega só as centrais (OPE-100, port do MT-33). */

const mocks = vi.hoisted(() => ({ available: vi.fn(), acquire: vi.fn(), release: vi.fn(), bind: vi.fn(), unbind: vi.fn() }))

vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: mocks.available, acquireChannel: mocks.acquire, releaseChannel: mocks.release }))

import { agenticKey, useCentralsRealtime } from '@/features/agentic/hooks/useAgentic'
import { AGENTIC_UPDATED_EVENT } from '@/features/agentic/constants'
import { appChannel } from '@/lib/pusher/channel-names'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.available.mockReturnValue(true)
  mocks.acquire.mockReturnValue({ bind: mocks.bind, unbind: mocks.unbind })
})
afterEach(() => cleanup())

function setup() {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useCentralsRealtime(), { wrapper })
  return { invalidate, hook }
}

describe('useCentralsRealtime', () => {
  it('no canal do app, o evento das centrais invalida só a lista de centrais', () => {
    const { invalidate } = setup()
    expect(mocks.acquire).toHaveBeenCalledWith(appChannel())
    const handler = mocks.bind.mock.calls.find(([name]) => name === AGENTIC_UPDATED_EVENT)?.[1] as () => void
    handler()
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: agenticKey('centrals') })
  })

  it('desmontar desfaz a assinatura e libera o canal', () => {
    const { hook } = setup()
    hook.unmount()
    expect(mocks.unbind).toHaveBeenCalledWith(AGENTIC_UPDATED_EVENT, expect.any(Function))
    expect(mocks.release).toHaveBeenCalledWith(appChannel())
  })

  it('sem Pusher configurado, não assina nada', () => {
    mocks.available.mockReturnValue(false)
    setup()
    expect(mocks.acquire).not.toHaveBeenCalled()
  })
})
