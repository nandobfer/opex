/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'

/** Aba Build (N): o stream do log usa o subcaminho público (NEXT_PUBLIC_BASE_PATH). */

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('useBuildLogStream', () => {
  it('pede o log com o basePath na frente (regressão: atrás de proxy com prefixo o log não carregava)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/opex')
    const fetchMock = vi.fn(async () => ({ ok: false, body: null }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const { useBuildLogStream } = await import('@/features/agentic/hooks/useBuilds')
    renderHook(() => useBuildLogStream('w1', 'b1', { reset: vi.fn(), write: vi.fn() } as never))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0]![0]).toBe('/opex/api/agentic/workbenches/w1/builds/b1/log')
  })
})
