/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextRequest } from 'next/server'

/** Ambientes: valores das variáveis para o formulário — rota GET /env e o cache do hook (OPE-175). */

const mocks = vi.hoisted(() => ({ readEnvValues: vi.fn(), get: vi.fn() }))

vi.mock('@/features/environments/server/service', () => ({ readEnvValues: mocks.readEnvValues }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), api: { get: mocks.get } }))
vi.mock('@/lib/pusher/client', () => ({ acquireChannel: vi.fn(), releaseChannel: vi.fn(), isPusherClientAvailable: () => false }))

import { GET } from '@/app/api/environments/[id]/env/route'
import { DomainError } from '@/lib/api/route'
import { useEnvironmentEnvValues } from '@/features/environments/hooks/useEnvironments'

const values = { items: [{ key: 'TOKEN', value: 'segredo' }, { key: 'URL', value: null }] }

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('GET /api/environments/[id]/env', () => {
  it('devolve os valores decifrados do ambiente', async () => {
    mocks.readEnvValues.mockResolvedValue(values)
    const res = await GET(new NextRequest('http://localhost/api/environments/e1/env'), { params: Promise.resolve({ id: 'e1' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: values })
    expect(mocks.readEnvValues).toHaveBeenCalledWith('e1')
  })

  it('ambiente inexistente: 404', async () => {
    mocks.readEnvValues.mockRejectedValue(new DomainError(404, 'Ambiente não encontrado', 'ENVIRONMENT_NOT_FOUND'))
    const res = await GET(new NextRequest('http://localhost/api/environments/x/env'), { params: Promise.resolve({ id: 'x' }) })
    expect(res.status).toBe(404)
  })
})

describe('useEnvironmentEnvValues', () => {
  it('lê ao abrir e tira os valores do cache ao fechar', async () => {
    mocks.get.mockResolvedValue({ data: { success: true, data: values } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, rerender } = renderHook(({ open }) => useEnvironmentEnvValues('e1', open), { wrapper, initialProps: { open: true } })
    await waitFor(() => expect(result.current.data).toEqual(values))
    expect(mocks.get).toHaveBeenCalledWith('/environments/e1/env')
    expect(client.getQueryData(['environment-env-values', 'e1'])).toEqual(values)
    rerender({ open: false })
    await waitFor(() => expect(client.getQueryData(['environment-env-values', 'e1'])).toBeUndefined())
    expect(result.current.data).toBeUndefined()
  })

  it('OPE-211: sair da página (desmontar) tira os valores do cache; o tempo real do módulo não relê', async () => {
    mocks.get.mockResolvedValue({ data: { success: true, data: values } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, unmount } = renderHook(() => useEnvironmentEnvValues('e1', true), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(values))
    await client.invalidateQueries({ queryKey: ['environments'] })
    expect(mocks.get).toHaveBeenCalledTimes(1)
    unmount()
    expect(client.getQueryData(['environment-env-values', 'e1'])).toBeUndefined()
  })

  it('fechado: não lê nada', () => {
    const client = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    renderHook(() => useEnvironmentEnvValues('e1', false), { wrapper })
    expect(mocks.get).not.toHaveBeenCalled()
  })
})
