/** @vitest-environment happy-dom */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LEAVE_MS, useLeavingItems } from '@/features/engramind/components/network/useLeavingItems'

/** OPE-109: itens que saem da rede ficam marcados `leaving` por `LEAVE_MS` e depois somem de vez. */

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const list = (...ids: string[]) => ids.map((id) => ({ id }))

describe('useLeavingItems', () => {
  it('o item removido fica saindo e some depois de LEAVE_MS', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ items }) => useLeavingItems(items), { initialProps: { items: list('a', 'b') } })
    rerender({ items: list('a') })
    expect(result.current.find((item) => item.id === 'b')?.leaving).toBe(true)
    act(() => void vi.advanceTimersByTime(LEAVE_MS + 10))
    expect(result.current.map((item) => item.id)).toEqual(['a'])
  })

  it('regressão: nova referência da lista dentro de LEAVE_MS não prende o item saindo para sempre', () => {
    vi.useFakeTimers()
    const onRemoved = vi.fn()
    const { result, rerender } = renderHook(({ items }) => useLeavingItems(items, onRemoved), { initialProps: { items: list('a', 'b') } })
    rerender({ items: list('a') })
    act(() => void vi.advanceTimersByTime(LEAVE_MS / 2))
    // Releitura (invalidação, Pusher, re-render do pai) com os mesmos dados e outra referência.
    rerender({ items: list('a') })
    rerender({ items: list('a') })
    act(() => void vi.advanceTimersByTime(LEAVE_MS))
    expect(result.current.map((item) => item.id)).toEqual(['a'])
    expect(result.current.some((item) => item.leaving)).toBe(false)
    expect(onRemoved).toHaveBeenCalledTimes(1)
  })

  it('nada saindo: devolve a mesma referência da lista', () => {
    const items = list('a')
    const { result, rerender } = renderHook(({ items: current }) => useLeavingItems(current), { initialProps: { items } })
    rerender({ items })
    expect(result.current).toBe(items)
  })
})
