/** @vitest-environment happy-dom */
import React from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
  available: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  bind: vi.fn(),
  unbind: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, delete: mocks.del },
  unwrapApi: (response: { data: unknown }) => response.data,
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}))
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: mocks.available, acquireChannel: mocks.acquire, releaseChannel: mocks.release }))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))

import { useAiModelFavorites } from '@/features/ai/hooks/useAiModelFavorites'

const LIST = { favorites: [{ provider: 'gemini', model: 'flash' }] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.available.mockReturnValue(true)
  mocks.acquire.mockReturnValue({ bind: mocks.bind, unbind: mocks.unbind })
  mocks.get.mockResolvedValue({ data: { success: true, data: LIST } })
})
afterEach(cleanup)

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

describe('useAiModelFavorites', () => {
  it('favorita de forma otimista e grava a resposta do servidor', async () => {
    const { wrapper } = setup()
    let resolve: (value: unknown) => void = () => {}
    mocks.post.mockReturnValue(new Promise((done) => (resolve = done)))
    const { result } = renderHook(() => useAiModelFavorites(), { wrapper })
    await waitFor(() => expect(result.current.favorites).toHaveLength(1))
    expect(mocks.get).toHaveBeenCalledWith('/ai/model-favorites')

    act(() => result.current.setFavorite({ provider: 'opencode', model: 'anthropic/opus', favorite: true }))
    await waitFor(() => expect(result.current.isFavorite('opencode', 'anthropic/opus')).toBe(true))
    expect(mocks.post).toHaveBeenCalledWith('/ai/model-favorites', { provider: 'opencode', model: 'anthropic/opus' })
    const saved = { favorites: [...LIST.favorites, { provider: 'opencode', model: 'anthropic/opus' }] }
    mocks.get.mockResolvedValue({ data: { success: true, data: saved } })
    await act(async () => resolve({ data: { success: true, data: saved } }))
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
    expect(result.current.favorites).toEqual(saved.favorites)
  })

  it('desfavoritar remove na hora; falha do servidor reverte com aviso', async () => {
    const { wrapper } = setup()
    let reject: (error: unknown) => void = () => {}
    mocks.del.mockReturnValue(new Promise((_done, fail) => (reject = fail)))
    const { result } = renderHook(() => useAiModelFavorites(), { wrapper })
    await waitFor(() => expect(result.current.favorites).toHaveLength(1))

    act(() => result.current.setFavorite({ provider: 'gemini', model: 'flash', favorite: false }))
    await waitFor(() => expect(result.current.isFavorite('gemini', 'flash')).toBe(false))
    expect(mocks.del).toHaveBeenCalledWith('/ai/model-favorites', { data: { provider: 'gemini', model: 'flash' } })
    await act(async () => reject(new Error('falhou')))
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.isFavorite('gemini', 'flash')).toBe(true))
    expect(mocks.toastError).toHaveBeenCalledWith('Não foi possível remover o modelo dos favoritos')
  })

  it('duas estrelas em voo: a resposta parcial e o rollback não apagam o clique seguinte (regressão F1)', async () => {
    const { wrapper } = setup()
    const posts: { resolve: (value: unknown) => void; reject: (error: unknown) => void }[] = []
    mocks.post.mockImplementation(() => new Promise((resolve, reject) => posts.push({ resolve, reject })))
    const { result } = renderHook(() => useAiModelFavorites(), { wrapper })
    await waitFor(() => expect(result.current.favorites).toHaveLength(1))

    act(() => result.current.setFavorite({ provider: 'opencode', model: 'A', favorite: true }))
    await waitFor(() => expect(result.current.isFavorite('opencode', 'A')).toBe(true))
    act(() => result.current.setFavorite({ provider: 'opencode', model: 'B', favorite: true }))
    await waitFor(() => expect(result.current.isFavorite('opencode', 'B')).toBe(true))
    await waitFor(() => expect(posts).toHaveLength(2))

    // A falha: o favorito de B (já visível, talvez já gravado) não pode sumir, e ainda não há releitura.
    await act(async () => posts[0]!.reject(new Error('falhou')))
    expect(result.current.isFavorite('opencode', 'B')).toBe(true)
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenCalledWith('Não foi possível favoritar o modelo')

    // Só quando a última termina o servidor decide: A não foi gravado, B sim.
    mocks.get.mockResolvedValue({ data: { success: true, data: { favorites: [...LIST.favorites, { provider: 'opencode', model: 'B' }] } } })
    await act(async () => posts[1]!.resolve({ data: { success: true, data: { favorites: [...LIST.favorites, { provider: 'opencode', model: 'B' }] } } }))
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.isFavorite('opencode', 'A')).toBe(false))
    expect(result.current.isFavorite('opencode', 'B')).toBe(true)
  })

  it('o evento do Pusher invalida o cache dos favoritos e a assinatura sai na desmontagem', async () => {
    const { client, wrapper } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { unmount } = renderHook(() => useAiModelFavorites(), { wrapper })
    expect(mocks.bind).toHaveBeenCalledWith('ai-model-favorites-updated', expect.any(Function))
    const handler = mocks.bind.mock.calls[0]![1] as () => void
    act(() => handler())
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['ai-model-favorites'] })
    unmount()
    expect(mocks.unbind).toHaveBeenCalledWith('ai-model-favorites-updated', handler)
    expect(mocks.release).toHaveBeenCalled()
  })
})
