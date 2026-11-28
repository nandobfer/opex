/** @vitest-environment happy-dom */
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** OPE-213: Pausar/Retomar com resposta otimista — o status muda na hora no cache e volta se a chamada falhar. */

const mocks = vi.hoisted(() => ({ post: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }))
vi.mock('@/lib/api', () => ({
  api: { post: mocks.post, get: vi.fn() },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
  unwrapApi: (body: { data: unknown }) => body.data,
}))

import { useRoutineAgentStatus } from '@/features/routine-agents/hooks/useRoutineAgents'
import { routineKeys } from '@/features/routine-agents/hooks/keys'
import type { RoutineAgentDto } from '@/features/routine-agents/types'

const agent = { id: 'a1', status: 'active', nextFireAt: '2026-11-04T18:00:00.000Z' } as RoutineAgentDto

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(routineKeys.agent('a1'), agent)
  client.setQueryData(routineKeys.list('current'), [agent])
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, ...renderHook(() => useRoutineAgentStatus(), { wrapper }) }
}

afterEach(() => vi.clearAllMocks())

describe('useRoutineAgentStatus (OPE-213)', () => {
  it('Pausar aplica o status na hora (sem próximo disparo), antes da resposta', async () => {
    let resolve: (value: unknown) => void = () => {}
    mocks.post.mockReturnValue(new Promise((done) => (resolve = done)))
    const { client, result } = setup()
    act(() => result.current.mutate({ id: 'a1', action: 'pause' }))
    await waitFor(() => expect(client.getQueryData<RoutineAgentDto>(routineKeys.agent('a1'))?.status).toBe('paused'))
    expect(client.getQueryData<RoutineAgentDto>(routineKeys.agent('a1'))?.nextFireAt).toBeNull()
    expect(client.getQueryData<RoutineAgentDto[]>(routineKeys.list('current'))?.[0]?.status).toBe('paused')
    resolve({ data: { data: { ...agent, status: 'paused', nextFireAt: null } } })
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Agente pausado'))
  })

  it('falhou: volta ao status anterior e avisa', async () => {
    mocks.post.mockRejectedValue(new Error('x'))
    const { client, result } = setup()
    act(() => result.current.mutate({ id: 'a1', action: 'pause' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Não foi possível alterar o status do agente'))
    expect(client.getQueryData<RoutineAgentDto>(routineKeys.agent('a1'))?.status).toBe('active')
    expect(client.getQueryData<RoutineAgentDto[]>(routineKeys.list('current'))?.[0]?.status).toBe('active')
  })
})
