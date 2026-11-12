/** @vitest-environment happy-dom */
import React from 'react'
import { cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Tempo real dos rotineiros (OPE-149): uma entrada global gravada num agente atualiza a aba Entradas dos outros. */

const mocks = vi.hoisted(() => ({ available: vi.fn(), acquire: vi.fn(), release: vi.fn(), bind: vi.fn(), unbind: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: mocks.available, acquireChannel: mocks.acquire, releaseChannel: mocks.release }))

import { useRoutineRealtime } from '@/features/routine-agents/hooks/useRoutineRealtime'
import { routineKeys } from '@/features/routine-agents/hooks/keys'
import { ROUTINE_AGENT_UPDATED_EVENT } from '@/features/routine-agents/constants'
import { routineChatQueryPrefix } from '@/features/routine-agents/chat'

const AGENT_A = 'a'.repeat(24)
const AGENT_B = 'b'.repeat(24)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.available.mockReturnValue(true)
  mocks.acquire.mockReturnValue({ bind: mocks.bind, unbind: mocks.unbind })
})
afterEach(cleanup)

describe('useRoutineRealtime', () => {
  it('routine-agent-updated invalida as entradas de todos os agentes, não só a do agente do evento', () => {
    const client = new QueryClient()
    client.setQueryData(routineKeys.entries(AGENT_A), [])
    client.setQueryData(routineKeys.entries(AGENT_B), [])
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    renderHook(() => useRoutineRealtime(), { wrapper })

    const bound = mocks.bind.mock.calls.find(([event]) => event === ROUTINE_AGENT_UPDATED_EVENT)
    expect(bound).toBeTruthy()
    expect(client.getQueryState(routineKeys.entries(AGENT_B))?.isInvalidated).toBe(false)

    ;(bound![1] as (payload: { id: string }) => void)({ id: AGENT_A })

    expect(client.getQueryState(routineKeys.entries(AGENT_A))?.isInvalidated).toBe(true)
    expect(client.getQueryState(routineKeys.entries(AGENT_B))?.isInvalidated).toBe(true)
  })

  it('routine-agent-updated invalida o status da conversa do agente (modelo e disponibilidade, OPE-160)', () => {
    const client = new QueryClient()
    client.setQueryData([routineChatQueryPrefix(AGENT_A), 'status'], { available: true, modelLabel: 'OpenAI · antigo' })
    client.setQueryData([routineChatQueryPrefix(AGENT_B), 'status'], { available: true, modelLabel: 'OpenAI · outro' })
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    renderHook(() => useRoutineRealtime(), { wrapper })
    const bound = mocks.bind.mock.calls.find(([event]) => event === ROUTINE_AGENT_UPDATED_EVENT)
    ;(bound![1] as (payload: { id: string }) => void)({ id: AGENT_A })
    expect(client.getQueryState([routineChatQueryPrefix(AGENT_A), 'status'])?.isInvalidated).toBe(true)
    expect(client.getQueryState([routineChatQueryPrefix(AGENT_B), 'status'])?.isInvalidated).toBe(false)
  })

  it('desfaz a assinatura e libera o canal ao desmontar', () => {
    const client = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { unmount } = renderHook(() => useRoutineRealtime(), { wrapper })
    unmount()
    expect(mocks.unbind).toHaveBeenCalledWith(ROUTINE_AGENT_UPDATED_EVENT, expect.any(Function))
    expect(mocks.release).toHaveBeenCalled()
  })
})
