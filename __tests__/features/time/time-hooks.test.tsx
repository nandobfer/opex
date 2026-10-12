/** @vitest-environment jsdom */
import React from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), available: vi.fn(), acquire: vi.fn(), release: vi.fn(), bind: vi.fn(), unbind: vi.fn() }))

vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get } }))
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: mocks.available, acquireChannel: mocks.acquire, releaseChannel: mocks.release }))

import { useTimeLogs, useTimeRealtime } from '@/features/time/hooks/useTime'
import type { TaskType } from '@/features/tasks/constants'

const PROJ = 'a'.repeat(24)
const emptyPage = { logs: [], page: 1, totalPages: 1, total: 0, totalMinutes: 0, totalCostUsd: 0 }

interface Query {
  from: string
  to: string
  projects: string[]
  types: TaskType[]
}

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.available.mockReturnValue(true)
  mocks.acquire.mockReturnValue({ bind: mocks.bind, unbind: mocks.unbind })
  mocks.get.mockResolvedValue({ data: { success: true, data: emptyPage } })
})
afterEach(cleanup)

describe('useTimeLogs', () => {
  it('envia o recorte em CSV e omite o filtro sem seleção', async () => {
    const { client, wrapper } = setup()
    const first: Query = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z', projects: [], types: [] }
    const { result, rerender } = renderHook((props: { query: Query }) => useTimeLogs(props.query), { wrapper, initialProps: { query: first } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.get).toHaveBeenLastCalledWith('/time/logs', { params: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z', page: 1 } })

    rerender({ query: { ...first, projects: [PROJ], types: ['feature', 'bugfix'] } })
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith('/time/logs', {
        params: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z', page: 1, projects: PROJ, types: 'feature,bugfix' },
      }),
    )
    client.clear()
  })
})

describe('useTimeRealtime', () => {
  it('invalida as horas em time-updated e em tasks-updated, e libera o canal ao desmontar', () => {
    const { client, wrapper } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { unmount } = renderHook(() => useTimeRealtime(), { wrapper })
    expect(mocks.acquire).toHaveBeenCalledWith('private-app')

    const timeHandler = mocks.bind.mock.calls.find(([name]) => name === 'time-updated')?.[1] as (event: { taskIds: string[] }) => void
    const tasksHandler = mocks.bind.mock.calls.find(([name]) => name === 'tasks-updated')?.[1] as () => void
    expect(timeHandler).toBeTypeOf('function')
    expect(tasksHandler).toBeTypeOf('function')

    act(() => timeHandler({ taskIds: ['t1'] }))
    act(() => tasksHandler())

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['time'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['time', 'logs'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 't1'] })

    unmount()
    expect(mocks.unbind).toHaveBeenCalledTimes(2)
    expect(mocks.release).toHaveBeenCalledWith('private-app')
    client.clear()
  })
})
