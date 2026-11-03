/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** OPE-128: `useMentorRunMemory` — só consulta com memória gravada; relê enquanto o resumo está pendente, até o limite da abertura. */

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: vi.fn(), put: vi.fn() },
  unwrapApi: (body: { data: unknown }) => body.data,
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}))
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: () => false, acquireChannel: vi.fn(), releaseChannel: vi.fn() }))

import { MENTOR_MEMORY_POLL_MAX_MS, MENTOR_MEMORY_POLL_MS, mentorMemoryPollInterval, useMentorRunMemory } from '@/features/adversarial-agent/hooks/useMentor'

const memory = (resumoPendente: boolean) => ({ data: { data: { state: 'ok', resumo: 'Conferir providers', resumoPendente, atualizadaEm: null } } })

function setup(run: { id: string; memoryId: string | null } | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(({ value }) => useMentorRunMemory(value), { wrapper, initialProps: { value: run } })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useMentorRunMemory (OPE-128)', () => {
  it('execução sem memória gravada: não consulta o Engramind', async () => {
    const { result } = setup({ id: 'r1', memoryId: null })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MENTOR_MEMORY_POLL_MS * 3)
    })
    expect(mocks.get).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it('resumo pendente: relê pela rota da execução até ficar pronto e então para', async () => {
    mocks.get.mockResolvedValueOnce(memory(true)).mockResolvedValueOnce(memory(true)).mockResolvedValue(memory(false))
    const { result } = setup({ id: 'r1', memoryId: 'm_abc' })
    await waitFor(() => expect(result.current.data?.resumoPendente).toBe(true))
    expect(mocks.get).toHaveBeenCalledWith('/adversarial/mentor/runs/r1/memory')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MENTOR_MEMORY_POLL_MS * 2 + 100)
    })
    await waitFor(() => expect(result.current.data?.resumoPendente).toBe(false))
    const calls = mocks.get.mock.calls.length
    expect(calls).toBe(3)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MENTOR_MEMORY_POLL_MS * 4)
    })
    expect(mocks.get.mock.calls.length).toBe(calls)
    expect(result.current.expired).toBe(false)
  })

  it('resumo que não fica pronto: no limite da abertura para de reler e marca `expired`', async () => {
    mocks.get.mockResolvedValue(memory(true))
    const { result } = setup({ id: 'r1', memoryId: 'm_abc' })
    await waitFor(() => expect(result.current.data?.resumoPendente).toBe(true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MENTOR_MEMORY_POLL_MAX_MS + 100)
    })
    await waitFor(() => expect(result.current.expired).toBe(true))
    const calls = mocks.get.mock.calls.length
    expect(calls).toBeGreaterThan(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MENTOR_MEMORY_POLL_MS * 4)
    })
    expect(mocks.get.mock.calls.length).toBe(calls)
  })

  it('regra do intervalo: só com o resumo pendente e antes do limite', () => {
    expect(mentorMemoryPollInterval({ resumoPendente: true }, false)).toBe(MENTOR_MEMORY_POLL_MS)
    expect(mentorMemoryPollInterval({ resumoPendente: true }, true)).toBe(false)
    expect(mentorMemoryPollInterval({ resumoPendente: false }, false)).toBe(false)
    expect(mentorMemoryPollInterval(undefined, false)).toBe(false)
  })
})
