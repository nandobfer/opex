/** @vitest-environment happy-dom */
import React from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  available: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  bind: vi.fn(),
  unbind: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  unwrapApi: (response: { data: unknown }) => response.data,
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}))
vi.mock('@/lib/pusher/client', () => ({ isPusherClientAvailable: mocks.available, acquireChannel: mocks.acquire, releaseChannel: mocks.release }))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }))

import { useColorPalette } from '@/features/color-palette/hooks'

const PALETTE = { favorites: [{ color: '#A78BFA', name: 'Violeta' }] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.available.mockReturnValue(true)
  mocks.acquire.mockReturnValue({ bind: mocks.bind, unbind: mocks.unbind })
  mocks.get.mockResolvedValue({ data: { success: true, data: PALETTE } })
})
afterEach(cleanup)

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

describe('useColorPalette', () => {
  it('lê as favoritas, adiciona de forma otimista e invalida pelo evento do Pusher', async () => {
    const { client, wrapper } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    let resolvePost: (value: unknown) => void = () => {}
    mocks.post.mockReturnValue(new Promise((resolve) => (resolvePost = resolve)))
    const { result, unmount } = renderHook(() => useColorPalette(), { wrapper })
    await waitFor(() => expect(result.current.favorites).toHaveLength(1))
    expect(mocks.get).toHaveBeenCalledWith('/color-palette')

    act(() => result.current.addFavorite({ color: '#8000FF' }))
    await waitFor(() => expect(result.current.favorites.map((item) => item.color)).toEqual(['#A78BFA', '#8000FF']))
    expect(result.current.isFavorite('#8000FF')).toBe(true)
    expect(mocks.post).toHaveBeenCalledWith('/color-palette/favorites', { color: '#8000FF', name: null })
    await act(async () => resolvePost({ data: { success: true, data: { favorites: [...PALETTE.favorites, { color: '#8000FF', name: null }] } } }))
    expect(mocks.toastSuccess).toHaveBeenCalled()

    const handler = mocks.bind.mock.calls.find(([name]) => name === 'color-palette-updated')![1] as () => void
    act(() => handler())
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['color-palette'] })
    unmount()
    expect(mocks.release).toHaveBeenCalledWith('private-app')
    client.clear()
  })

  it('remoção que falha volta a lista e avisa', async () => {
    const { client, wrapper } = setup()
    mocks.del.mockRejectedValue(new Error('falhou'))
    const { result } = renderHook(() => useColorPalette(), { wrapper })
    await waitFor(() => expect(result.current.favorites).toHaveLength(1))
    act(() => result.current.removeFavorite('#A78BFA'))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Não foi possível remover a cor das favoritas'))
    expect(mocks.del).toHaveBeenCalledWith('/color-palette/favorites/A78BFA')
    expect(result.current.favorites).toEqual(PALETTE.favorites)
    client.clear()
  })

  it('edição troca no lugar de forma otimista e volta se falhar', async () => {
    mocks.get.mockResolvedValue({ data: { success: true, data: { favorites: [{ color: '#A78BFA', name: 'Violeta' }, { color: '#38BDF8', name: 'Azul' }] } } })
    const { client, wrapper } = setup()
    let rejectPatch: (error: unknown) => void = () => {}
    mocks.patch.mockReturnValue(new Promise((_resolve, reject) => (rejectPatch = reject)))
    const { result } = renderHook(() => useColorPalette(), { wrapper })
    await waitFor(() => expect(result.current.favorites).toHaveLength(2))

    act(() => result.current.updateFavorite('#A78BFA', { color: '#8000FF', name: ' Roxo ' }))
    await waitFor(() => expect(result.current.favorites[0]).toEqual({ color: '#8000FF', name: 'Roxo' }))
    expect(result.current.favorites[1]!.color).toBe('#38BDF8')
    expect(mocks.patch).toHaveBeenCalledWith('/color-palette/favorites/A78BFA', { color: '#8000FF', name: 'Roxo' })

    await act(async () => rejectPatch(new Error('falhou')))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Não foi possível atualizar a cor favorita'))
    expect(result.current.favorites[0]).toEqual({ color: '#A78BFA', name: 'Violeta' })
    client.clear()
  })
})
