/** @vitest-environment happy-dom */
import React from 'react'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  bind: vi.fn(),
  unbind: vi.fn(),
  release: vi.fn(),
  evolutionRealtime: vi.fn(),
}))
vi.mock('@/lib/pusher/client', () => ({
  acquireChannel: () => ({
    bind: (event: string, handler: () => void) => {
      mocks.handlers.set(event, handler)
      mocks.bind(event)
    },
    unbind: (event: string) => mocks.unbind(event),
  }),
  releaseChannel: mocks.release,
}))
vi.mock('@/features/evolution-api/hooks/useEvolution', () => ({ useEvolutionRealtime: mocks.evolutionRealtime }))

import { SECRETARY_SETTINGS_ENDPOINT, useSecretaryRealtime } from '@/features/secretary-agent/hooks/useSecretaryRealtime'
import { EVOLUTION_QUERY_KEY } from '@/features/evolution-api/constants'
import { SECRETARY_DECISION_EVENT } from '@/features/secretary-agent/constants'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
})

describe('useSecretaryRealtime (OPE-207)', () => {
  it('evento do Secretário recarrega só a configuração e /secretary/*; desmontar libera o canal', () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { unmount } = renderHook(() => useSecretaryRealtime(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
    expect(mocks.evolutionRealtime).toHaveBeenCalled()
    expect(mocks.bind).toHaveBeenCalledWith(SECRETARY_DECISION_EVENT)
    mocks.handlers.get(SECRETARY_DECISION_EVENT)!()
    const predicate = (invalidate.mock.calls[0]![0] as { predicate: (query: { queryKey: unknown[] }) => boolean }).predicate
    expect(predicate({ queryKey: [EVOLUTION_QUERY_KEY, SECRETARY_SETTINGS_ENDPOINT] })).toBe(true)
    expect(predicate({ queryKey: [EVOLUTION_QUERY_KEY, '/secretary/conversations'] })).toBe(true)
    expect(predicate({ queryKey: [EVOLUTION_QUERY_KEY, '/evolution/instances'] })).toBe(false)
    expect(predicate({ queryKey: ['outra', '/secretary/conversations'] })).toBe(false)
    unmount()
    expect(mocks.unbind).toHaveBeenCalledWith(SECRETARY_DECISION_EVENT)
    expect(mocks.release).toHaveBeenCalled()
  })
})
